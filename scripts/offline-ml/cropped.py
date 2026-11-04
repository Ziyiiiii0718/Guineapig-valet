"""Manual-crop experiment. Never opens held-out test image files."""
import argparse
import base64
import hashlib
import importlib.metadata
import json
import math
import os
from io import BytesIO
from pathlib import Path
import subprocess
import sys

from PIL import Image

from dataset import dataset_root
from evaluate import REPO, metrics

BASELINE = 'runs/openclip-baseline-v1-development'
EXPERIMENT = 'experiments/cropped-openclip'
POLICY = dict(version=1, box='tight-full-visible-body', margin=0.05,
              shape='square', outside_image_rgb=[128, 128, 128], encoding='lossless PNG')
PINNED_SOURCES = ('lib/ai/classifier.ts', 'ai-service/ai_service/model.py',
                  'ai-service/ai_service/preprocessing.py', 'scripts/offline-ml/classify.mjs')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def selected_rows(manifest):
    # Filter metadata before any filesystem access. Do not use load_frozen(),
    # which intentionally scans all image files for the general baseline workflow.
    rows = [r for r in manifest['samples'] if r['split'] in ('train', 'development')
            and r['label'] in ('potato', 'annie')]
    if len({r['path'] for r in rows}) != len(rows):
        raise ValueError('Duplicate manifest paths.')
    return rows


def source_bytes(root, row):
    relative = Path(row['path'])
    if relative.is_absolute() or '..' in relative.parts:
        raise ValueError('Invalid source path.')
    path = root.resolve() / relative
    if path.resolve() != path.absolute():
        raise ValueError('Symlinked image paths are not allowed.')
    data = path.read_bytes()
    if sha(data) != row['sha256']:
        raise ValueError('A selected source image changed since the baseline.')
    return data


def context(root):
    raw = (root / 'manifest.json').read_bytes()
    baseline_raw = (root / BASELINE / 'summary.json').read_bytes()
    baseline = json.loads(baseline_raw)
    if sha(raw) != baseline['manifest_sha256']:
        raise ValueError('Frozen manifest differs from baseline.')
    for filename in PINNED_SOURCES:
        if sha((REPO / filename).read_bytes()) != baseline['source_sha256'][filename]:
            raise ValueError(f'Pipeline differs from baseline: {filename}')
    config = json.loads((REPO / 'lib/ai/classification-config.json').read_text())
    if config != baseline['config']:
        raise ValueError('Classifier configuration differs from baseline.')
    rows = selected_rows(json.loads(raw))
    if (sum(r['split'] == 'train' for r in rows),
            sum(r['split'] == 'development' for r in rows)) != (27, 9):
        raise ValueError('Expected the frozen 27 reference and 9 development photos.')
    predictions_raw = (root / BASELINE / 'predictions.json').read_bytes()
    predictions = json.loads(predictions_raw)
    by_path = {r['path']: r for r in predictions}
    if len(by_path) != len(predictions):
        raise ValueError('Duplicate baseline prediction paths.')
    dev = [r for r in rows if r['split'] == 'development']
    if any(r['path'] not in by_path or by_path[r['path']]['expected'] != r['label'] for r in dev):
        raise ValueError('Baseline comparison cohort differs.')
    return rows, baseline, dict(manifest_sha256=sha(raw),
                               baseline_summary_sha256=sha(baseline_raw),
                               baseline_predictions_sha256=sha(predictions_raw)), [by_path[r['path']] for r in dev]


def box_valid(box, width, height):
    return (isinstance(box, list) and len(box) == 4
            and all(type(v) is int for v in box)
            and 0 <= box[0] < box[2] <= width
            and 0 <= box[1] < box[3] <= height
            and box[2] - box[0] >= 2 and box[3] - box[1] >= 2)


def square_bounds(box):
    x1, y1, x2, y2 = box
    side = math.ceil(max(x2 - x1, y2 - y1) * 1.1)
    left = math.floor((x1 + x2 - side) / 2)
    top = math.floor((y1 + y2 - side) / 2)
    return left, top, side


def crop_image(image, box):
    if not box_valid(box, *image.size):
        raise ValueError('Box must be integer x1,y1,x2,y2 within the original image.')
    left, top, side = square_bounds(box)
    crop = Image.new('RGB', (side, side), tuple(POLICY['outside_image_rgb']))
    bounds = (max(0, left), max(0, top), min(image.width, left + side), min(image.height, top + side))
    crop.paste(image.convert('RGB').crop(bounds), (bounds[0] - left, bounds[1] - top))
    return crop


def prepare(root):
    rows, _, hashes, _ = context(root)
    items = []
    previews = []
    for index, row in enumerate(rows):
        with Image.open(BytesIO(source_bytes(root, row))) as image:
            image.load()
            if image.getexif().get(274, 1) != 1:
                raise ValueError('Images must already be upright, matching the baseline.')
            items.append(dict(row, id=index, width=image.width, height=image.height))
            preview = image.convert('RGB')
            preview.thumbnail((1200, 900))
            buffer = BytesIO()
            preview.save(buffer, 'JPEG', quality=85)
            previews.append('data:image/jpeg;base64,' + base64.b64encode(buffer.getvalue()).decode())
    spec = dict(version=1, policy=POLICY, **hashes, items=items)
    output = root / EXPERIMENT
    output.mkdir(parents=True, exist_ok=False)
    (output / 'experiment.json').write_text(json.dumps(spec, indent=2))
    template = (Path(__file__).parent / 'annotator.html').read_text()
    payload = json.dumps(dict(spec=spec, previews=previews)).replace('<', '\\u003c')
    (output / 'annotate.html').write_text(template.replace('/*EXPERIMENT_DATA*/null', payload))
    (output / 'README.md').write_text(
        '# Manual crop experiment: awaiting annotations\n\n'
        'Open annotate.html in Safari or Chrome. Draw one tight full-visible-body box per photo. '
        'Click Save box & next, then Export annotations JSON. Import that JSON to resume. '
        'No boxes are preapproved. The page includes only 27 references and 9 development photos.\n\n'
        'Cropped results do not exist yet. Run cropped.py evaluate only after all 36 boxes are saved. '
        'The baseline is compared on the same 9 single-pet development photos.\n')
    print(f'Prepared {len(items)} annotation images: {output / "annotate.html"}')


def validate_annotations(spec, annotations):
    if (annotations.get('version') != 1 or annotations.get('manifest_sha256') != spec['manifest_sha256']
            or annotations.get('policy') != POLICY):
        raise ValueError('Annotation manifest or crop policy does not match.')
    boxes = annotations.get('boxes', {})
    expected = {r['path'] for r in spec['items']}
    if not isinstance(boxes, dict) or set(boxes) != expected:
        missing = len(expected - set(boxes)) if isinstance(boxes, dict) else len(expected)
        raise ValueError(f'Need exactly all 36 boxes; {missing} missing. Extra paths are forbidden.')
    for row in spec['items']:
        if not box_valid(boxes[row['path']], row['width'], row['height']):
            raise ValueError(f'Invalid box for {row["path"]}.')
    return boxes


def summarize(predictions):
    result = metrics([p['expected'] for p in predictions], [p['predicted'] for p in predictions])
    ranked_correct = sum(p['result']['candidates'][0]['petId'] == p['expected'] for p in predictions)
    result.update(identity_ranking_accuracy=ranked_correct / len(predictions),
                  identity_ranking_correct=ranked_correct)
    return result


def report_markdown(summary, pairs):
    lines = ['# Cropped OpenCLIP: paired development comparison', '',
             'Manual full-body boxes, fixed 5% square margin, gray padding only beyond image edges. '
             'Same 27 references, same 9 development images; test image files were not opened.', '',
             '| Metric | Full image | Cropped |', '| --- | ---: | ---: |']
    for key in ('single_pet_accuracy', 'identity_ranking_accuracy', 'false_multi_pet_rate', 'uncertain_prediction_rate'):
        lines.append(f"| {key.replace('_', ' ')} | {summary['baseline'][key]:.1%} | {summary['cropped'][key]:.1%} |")
    for method in ('baseline', 'cropped'):
        lines += ['', f'## {method.title()} confusion matrix', '',
                  '| Actual | Potato | Annie | Both | Unknown | Count |', '| --- | ---: | ---: | ---: | ---: | ---: |']
        for label in ('potato', 'annie'):
            row = summary[method]['confusion_matrix'][label]
            lines.append('| ' + label + ' | ' + ' | '.join(str(row[k]) for k in ('potato', 'annie', 'both', 'unknown'))
                         + f' | {sum(row.values())} |')
    lines += ['', '## Paired outcomes', '', '| Photo | Actual | Full image | Crop |', '| --- | --- | --- | --- |']
    for pair in pairs:
        lines.append(f"| {pair['path'].replace('|', '&#124;')} | {pair['expected']} | {pair['baseline']} | {pair['cropped']} |")
    lines += ['', 'Identity ranking counts the highest-scoring candidate before the decision rule. '
              'Both and Unknown are errors for single-pet accuracy. False multi-pet rate is Both/9. '
              'These rates are not calibrated probabilities.', '',
              'This is a manual-crop-assisted experiment, not automatic localization. '
              'Nine images from few sessions cannot establish reliable future accuracy. '
              'Neither and true Both performance are not tested. Cropping also changes scale/context; '
              'improvement supports, but does not prove, a background explanation.', '',
              '## Exact model preprocessing', '', '```text', summary['preprocessing'], '```', '',
              'The production OpenClipEmbedder performs RGB decode, this evaluation transform, '
              'encode_image in inference mode, and L2 normalization. Crops are lossless PNG inputs '
              'to that same method. The existing TypeScript classifier and JSON thresholds are reused. '
              'See summary.json for provenance and annotations.json for the frozen boxes.', '']
    return '\n'.join(lines)


def evaluate(root, annotation_path, name):
    if not name or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-_' for c in name):
        raise ValueError('Run name must use lowercase letters, digits, - or _.')
    rows, baseline, hashes, original = context(root)
    spec = json.loads((root / EXPERIMENT / 'experiment.json').read_text())
    if spec['policy'] != POLICY or any(spec[k] != v for k, v in hashes.items()):
        raise ValueError('Prepared experiment differs from the frozen baseline.')
    expected = [{k: item[k] for k in row} for item, row in zip(spec['items'], rows, strict=True)]
    if expected != rows:
        raise ValueError('Prepared selection changed.')
    annotations_raw = annotation_path.read_bytes()
    annotations = json.loads(annotations_raw)
    boxes = validate_annotations(spec, annotations)
    for package, version in baseline['packages'].items():
        if importlib.metadata.version(package) != version:
            raise ValueError(f'{package} version differs from baseline; restore its environment.')
    # Validate selected sources only, before model loading or writing a run.
    for row in rows:
        source_bytes(root, row)
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
    from ai_service.model import OpenClipEmbedder
    embedder = OpenClipEmbedder()
    if (embedder._settings.model_name, embedder._settings.model_version) != (baseline['model'], baseline['weights']):
        raise ValueError('Embedding model differs from baseline.')
    output = root / EXPERIMENT / 'runs' / name
    output.mkdir(parents=True, exist_ok=False)
    (output / 'annotations.json').write_bytes(annotations_raw)
    references, queries, query_rows = [], [], []
    for row in rows:
        with Image.open(BytesIO(source_bytes(root, row))) as image:
            cropped = crop_image(image, boxes[row['path']])
        buffer = BytesIO()
        cropped.save(buffer, 'PNG')
        data = buffer.getvalue()
        target = output / 'crops' / (row['path'] + '.png')
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        embedding = embedder.embed_bytes(data).embedding
        if row['split'] == 'train':
            references.append(dict(petId=row['label'], referenceId=row['path'], embedding=embedding))
        else:
            queries.append(embedding)
            query_rows.append(row)
        print(f"Embedded {row['split']} crop locally", flush=True)
    process = subprocess.run(['node', str(REPO / 'scripts/offline-ml/classify.mjs')],
                             input=json.dumps(dict(references=references, queries=queries)),
                             text=True, capture_output=True, check=True)
    predictions = []
    for row, result in zip(query_rows, json.loads(process.stdout), strict=True):
        pets = result['suggestedPetIds']
        predicted = 'both' if len(pets) == 2 else pets[0] if pets else 'unknown'
        predictions.append(dict(path=row['path'], expected=row['label'], predicted=predicted, result=result))
    pairs = [dict(path=a['path'], expected=a['expected'], baseline=a['predicted'], cropped=b['predicted'])
             for a, b in zip(original, predictions, strict=True)]
    summary = dict(**hashes, baseline=summarize(original), cropped=summarize(predictions),
                   policy=POLICY, annotation_sha256=sha(annotations_raw),
                   config=baseline['config'], model=baseline['model'], weights=baseline['weights'],
                   packages=baseline['packages'], preprocessing=str(embedder._preprocess),
                   test_images_opened=0, reference_count=27, development_count=9,
                   source_sha256={p: sha((REPO / p).read_bytes()) for p in (*PINNED_SOURCES, 'scripts/offline-ml/cropped.py')})
    (output / 'summary.json').write_text(json.dumps(summary, indent=2))
    (output / 'predictions.json').write_text(json.dumps(predictions, indent=2))
    (output / 'report.md').write_text(report_markdown(summary, pairs))
    print(f'Report saved: {output / "report.md"}')


def verify_pipeline(root):
    _, baseline, hashes, _ = context(root)
    for package, version in baseline['packages'].items():
        if importlib.metadata.version(package) != version:
            raise ValueError(f'{package} version differs from baseline.')
    os.environ['HF_HUB_OFFLINE'] = '1'
    os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
    import numpy as np
    from ai_service.model import OpenClipEmbedder
    from ai_service.preprocessing import decode_rgb_image
    embedder = OpenClipEmbedder()
    image = Image.new('RGB', (91, 73))
    image.putdata([(x * 2 % 256, y * 3 % 256, (x + y) % 256)
                   for y in range(73) for x in range(91)])
    image = crop_image(image, [5, 8, 80, 65])
    buffer = BytesIO()
    image.save(buffer, 'PNG')
    data = buffer.getvalue()
    result = embedder.embed_bytes(data)
    tensor = embedder._preprocess(decode_rgb_image(data)).unsqueeze(0)
    with embedder._torch.inference_mode():
        raw = embedder._model.encode_image(tensor)[0].detach().cpu().numpy()
    normalized = raw / np.linalg.norm(raw)
    difference = float(np.max(np.abs(normalized - np.asarray(result.embedding))))
    if (tuple(tensor.shape) != (1, 3, 224, 224) or embedder._model.training
            or difference > 1e-6 or result.dimension != 512
            or result.model != baseline['model'] or result.version != baseline['weights']):
        raise ValueError('Synthetic pipeline equivalence check failed.')
    report = dict(**hashes, synthetic_only=True, personal_images_opened=0,
                  model=result.model, weights=result.version, dimension=result.dimension,
                  evaluation_mode=True, input_tensor_shape=list(tensor.shape),
                  embedding_norm=float(np.linalg.norm(result.embedding)),
                  max_embedding_difference=difference, preprocessing=str(embedder._preprocess),
                  classifier='Same classify.mjs bridge loads the unchanged production TypeScript classifier.',
                  config=baseline['config'], packages=baseline['packages'])
    with (root / EXPERIMENT / 'pipeline-verification.json').open('x') as file:
        json.dump(report, file, indent=2)
    print(json.dumps(report, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command', choices=('prepare', 'verify', 'evaluate'))
    parser.add_argument('--annotations', type=Path)
    parser.add_argument('--run-name', default='cropped-v1')
    args = parser.parse_args()
    root = dataset_root()
    if args.command == 'prepare':
        prepare(root)
    elif args.command == 'verify':
        verify_pipeline(root)
    else:
        if args.annotations is None:
            parser.error('Supply --annotations with your exported JSON file.')
        evaluate(root, args.annotations.expanduser(), args.run_name)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError) as error:
        sys.exit(f'Crop workflow stopped: {error}')
