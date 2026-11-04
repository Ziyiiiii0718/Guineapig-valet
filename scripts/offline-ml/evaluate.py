"""Evaluate local OpenCLIP embeddings using the unchanged TypeScript classifier."""
import argparse
from collections import Counter
import hashlib
import importlib.metadata
import json
import subprocess
import sys
from pathlib import Path

from dataset import LABELS, dataset_root, load_frozen, validate_coverage

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / 'ai-service'))


def metrics(expected, predicted):
    if not expected:
        raise ValueError('Cannot evaluate an empty set.')
    columns = (*LABELS, 'unknown')
    matrix = {label: {p: 0 for p in columns} for label in LABELS}
    for truth, prediction in zip(expected, predicted, strict=True):
        matrix[truth][prediction] += 1
    per_class = {}
    for label in LABELS:
        support = expected.count(label)
        accepted = predicted.count(label)
        correct = matrix[label][label]
        per_class[label] = dict(support=support,
                               precision=correct / accepted if accepted else None,
                               recall=correct / support if support else None)
    single = [(a, b) for a, b in zip(expected, predicted, strict=True) if a in ('potato', 'annie')]
    single_correct = sum(a == b for a, b in single)
    negatives = sum(label != 'both' for label in expected)
    false_both = sum(a != 'both' and b == 'both'
                     for a, b in zip(expected, predicted, strict=True))
    return dict(single_pet_count=len(single), single_pet_correct=single_correct,
                single_pet_accuracy=single_correct / len(single) if single else None,
                single_pet_uncertain_rate=sum(b == 'unknown' for _, b in single) / len(single) if single else None,
                single_pet_false_multi_rate=sum(b == 'both' for _, b in single) / len(single) if single else None,
                false_multi_pet_count=false_both, non_both_count=negatives,
                false_multi_pet_rate=false_both / negatives if negatives else None,
                uncertain_prediction_rate=predicted.count('unknown') / len(expected),
                count=len(expected), confusion_matrix=matrix, per_class=per_class,
                accuracy=sum(a == b for a, b in zip(expected, predicted)) / len(expected),
                unknown_rate=predicted.count('unknown') / len(expected))


def markdown_report(report):
    def percent(value):
        return 'N/A' if value is None else f'{value:.2%}'
    lines = ['# Offline OpenCLIP evaluation', '',
             f"Method: {report['method']}; split: {report['split']}", '',
             f"Evaluated photos: {report['count']}", '',
             f"- Single-pet accuracy (primary): {percent(report['single_pet_accuracy'])} "
             f"({report['single_pet_correct']} / {report['single_pet_count']})",
             f"- All-category accuracy (exploratory): {percent(report['accuracy'])}",
             f"- False multi-pet rate: {percent(report['false_multi_pet_rate'])} "
             f"({report['false_multi_pet_count']} / {report['non_both_count']} non-both photos)",
             f"- Uncertain prediction rate: {percent(report['uncertain_prediction_rate'])}", '',
             'Rows are true labels; columns are predictions.', '',
             '| True / predicted | potato | annie | both | neither | unknown |',
             '| --- | --- | --- | --- | --- | --- |']
    for label in LABELS:
        values = report['confusion_matrix'][label]
        lines.append('| ' + label + ' | ' + ' | '.join(str(values[p]) for p in (*LABELS, 'unknown')) + ' |')
    lines += ['', 'Unknown is an abstention, not a confirmed neither prediction. '
              'It counts as incorrect in strict accuracy. Missing classes cannot be evaluated.', '',
              f"Manifest SHA-256: `{report['manifest_sha256']}`", '',
              'See summary.json for configuration, per-class metrics, model and dependency versions. '
              'Small session counts do not establish reliable generalization.', '']
    if 'split_counts' in report:
        lines += ['', '## Frozen split coverage', '',
                  '| Split | Potato | Annie | Both | Neither | Photos | Sessions |',
                  '| --- | ---: | ---: | ---: | ---: | ---: | ---: |']
        for split, counts in report['split_counts'].items():
            lines.append('| ' + split + ' | ' + ' | '.join(str(counts[k]) for k in LABELS)
                         + f" | {sum(counts.values())} | {report['session_counts'][split]} |")
        lines += ['', 'Only single-pet train photos are reference embeddings. Both train photos are reserved, not references.',
                  f"Excluded photos: {report['excluded_count']}. Test inference performed: {report['test_inference_performed']}.",
                  'Both and Neither are exploratory; absent development classes have no measured performance.', '',
                  '## Observed errors', '']
        for error, count in report.get('error_counts', {}).items():
            lines.append(f'- {error}: {count}')
        lines += ['', f"Single-pet uncertainty rate: {percent(report['single_pet_uncertain_rate'])}.",
                  f"Single-pet false multi-pet rate: {percent(report['single_pet_false_multi_rate'])}.", '',
                  'These are descriptive development results. Images in a session are correlated; '
                  'this small sample does not establish population accuracy. Test images were reserved '
                  'for a later frozen-method comparison, not used to tune this baseline.', '']
    return '\n'.join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', nargs='?', help='Absolute path; defaults to PIGGIE_DATASET_DIR')
    parser.add_argument('--split', choices=('development', 'test'), default='development')
    parser.add_argument('--allow-test', action='store_true')
    parser.add_argument('--run-name', default='openclip-baseline')
    args = parser.parse_args()
    args.root = dataset_root(args.root)
    if args.split == 'test' and not args.allow_test:
        parser.error('Freeze method choices first, then explicitly pass --allow-test.')
    if not args.run_name or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-_' for c in args.run_name):
        parser.error('Run name must contain lowercase letters, digits, - or _.')
    manifest = load_frozen(args.root)
    rows = manifest['samples']
    validate_coverage(rows)
    references = [r for r in rows if r['split'] == 'train' and r['label'] in ('potato', 'annie')]
    queries = [r for r in rows if r['split'] == args.split]
    config = json.loads((REPO / 'lib/ai/classification-config.json').read_text())
    for label in ('potato', 'annie'):
        if sum(r['label'] == label for r in references) < config['minimumReadyReferences']:
            parser.error(f'Need at least {config["minimumReadyReferences"]} training photos of {label} alone.')
    if not queries:
        parser.error('Selected split is empty.')
    output = args.root / 'runs' / f'{args.run_name}-{args.split}'
    output.mkdir(parents=True, exist_ok=False)
    from ai_service.model import OpenClipEmbedder
    print('Loading existing OpenCLIP model; no photos are sent to a service.', flush=True)
    embedder = OpenClipEmbedder()

    def embed(row):
        print(f"Embedding {row['split']} photo locally", flush=True)
        return embedder.embed_bytes((args.root / row['path']).read_bytes()).embedding

    payload = dict(references=[dict(petId=r['label'], referenceId=r['path'], embedding=embed(r))
                               for r in references], queries=[embed(r) for r in queries])
    result = subprocess.run(['node', str(REPO / 'scripts/offline-ml/classify.mjs')],
                            input=json.dumps(payload), text=True, capture_output=True, check=True)
    results = json.loads(result.stdout)
    predicted = []
    for result in results:
        pets = set(result['suggestedPetIds'])
        predicted.append('both' if pets == {'potato', 'annie'} else
                         next(iter(pets)) if len(pets) == 1 else 'unknown')
    report = metrics([r['label'] for r in queries], predicted)
    report['error_counts'] = dict(Counter(f"{r['label']} → {p}"
                                        for r, p in zip(queries, predicted, strict=True)
                                        if r['label'] != p).most_common())
    report.update(method='openclip-full-frame', split=args.split, config=config,
                  split_counts={split: {label: sum(r['split'] == split and r['label'] == label for r in rows)
                                       for label in LABELS} for split in ('train', 'development', 'test')},
                  session_counts={split: len({r['group'] for r in rows if r['split'] == split})
                                  for split in ('train', 'development', 'test')},
                  excluded_count=len(manifest.get('excluded', [])),
                  test_inference_performed=args.split == 'test',
                  model='ViT-B-32-quickgelu', weights='openai',
                  manifest_sha256=hashlib.sha256((args.root / 'manifest.json').read_bytes()).hexdigest(),
                  source_sha256={p: hashlib.sha256((REPO / p).read_bytes()).hexdigest() for p in
                                 ('lib/ai/classifier.ts', 'ai-service/ai_service/model.py',
                                  'ai-service/ai_service/preprocessing.py',
                                  'scripts/offline-ml/evaluate.py',
                                  'scripts/offline-ml/dataset.py',
                                  'scripts/offline-ml/classify.mjs')},
                  packages={p: importlib.metadata.version(p) for p in ('torch', 'open-clip-torch', 'pillow')})
    (output / 'report.md').write_text(markdown_report(report))
    (output / 'summary.json').write_text(json.dumps(report, indent=2))
    (output / 'predictions.json').write_text(json.dumps([
        dict(path=r['path'], expected=r['label'], predicted=p, result=result)
        for r, p, result in zip(queries, predicted, results, strict=True)], indent=2))
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, FileExistsError, FileNotFoundError) as error:
        sys.exit(f'Evaluation stopped: {error}')
