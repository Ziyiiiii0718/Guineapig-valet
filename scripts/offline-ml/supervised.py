"""Reference-only grouped logistic regression; selected development crops only."""
import argparse
from collections import Counter
from io import BytesIO
import importlib.metadata
import json
import os
from pathlib import Path
import warnings

import numpy as np
from PIL import Image
from sklearn.compose import ColumnTransformer
from sklearn.exceptions import ConvergenceWarning
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import LeaveOneGroupOut
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from color import features, distance
from cropped import (EXPERIMENT, POLICY, context, crop_image, sha, source_bytes,
                     validate_annotations, square_bounds)
from dataset import dataset_root

LABELS = ['potato', 'annie']
CS = [.001, .01, .1, 1., 10.]
CONFIG = dict(C_grid=CS, penalty='l2', solver='lbfgs', max_iter=5000, tol=1e-8,
              class_weight='balanced', random_state=42, cv='leave-one-reference-group-out',
              selection='mean validation-group accuracy; ties within 1e-12 choose smallest C',
              scaling='separate per-column StandardScaler per block, fit inside each fold',
              combination='concatenate standardized 512D CLIP and 512D Lab; no score fusion',
              decision='binary logistic predict, default boundary; no threshold tuning')
METHODS = ('CLIP-LR', 'Lab-LR', 'Combined-LR')


def make_model(method, c):
    blocks = []
    if method in ('CLIP-LR', 'Combined-LR'):
        blocks.append(('clip', StandardScaler(), list(range(512))))
    if method in ('Lab-LR', 'Combined-LR'):
        blocks.append(('lab', StandardScaler(), list(range(512, 1024))))
    if not blocks:
        raise ValueError('Unknown model.')
    return Pipeline([('scale', ColumnTransformer(blocks, remainder='drop')),
                     ('lr', LogisticRegression(C=c, penalty='l2', solver='lbfgs',
                                               class_weight='balanced', max_iter=5000,
                                               tol=1e-8, random_state=42))])


def grouped_folds(y, groups):
    folds = list(LeaveOneGroupOut().split(np.zeros((len(y), 1)), y, groups))
    if len(folds) < 3:
        raise ValueError('Insufficient independent reference groups.')
    seen = []
    for train, val in folds:
        if set(groups[train]) & set(groups[val]) or set(y[train]) != {0, 1}:
            raise ValueError('Unsafe fold or missing training class.')
        seen.extend(val.tolist())
    if sorted(seen) != list(range(len(y))):
        raise ValueError('Validation coverage mismatch.')
    return folds


def select_model(x, y, groups, method):
    folds = grouped_folds(y, groups)
    candidates = []
    for c in CS:
        predicted = np.full(len(y), -1)
        scores = []
        for train, val in folds:
            model = make_model(method, c).fit(x[train], y[train])
            predicted[val] = model.predict(x[val])
            scores.append(float(np.mean(predicted[val] == y[val])))
        candidates.append(dict(C=c, mean_group_accuracy=float(np.mean(scores)),
                               pooled_accuracy=float(np.mean(predicted == y)),
                               fold_accuracies=scores, oof_predictions=predicted.tolist()))
    best = candidates[0]
    for candidate in candidates[1:]:
        if candidate['mean_group_accuracy'] > best['mean_group_accuracy'] + 1e-12:
            best = candidate
    return best, candidates, make_model(method, best['C']).fit(x, y)


def stats(truth, predicted):
    return dict(correct=sum(a == b for a, b in zip(truth, predicted, strict=True)),
                total=len(truth), confusion_matrix=[[sum(a == i and b == j for a, b in
                    zip(truth, predicted, strict=True)) for j in range(2)] for i in range(2)])


def read_json(path):
    return json.loads(path.read_text())


def save_json(path, value):
    path.write_text(json.dumps(value, indent=2))


def extract(root, rows, baseline, hashes):
    prior = root / EXPERIMENT / 'runs/cropped-v1'
    color_run = root / 'experiments/color-features/runs/color-v1'
    crop_summary = read_json(prior / 'summary.json')
    color_summary = read_json(color_run / 'summary.json')
    spec = read_json(root / EXPERIMENT / 'experiment.json')
    annotation_raw = (prior / 'annotations.json').read_bytes()
    boxes = validate_annotations(spec, json.loads(annotation_raw))
    if (set(boxes) != {r['path'] for r in rows} or spec['policy'] != POLICY
            or any(spec[k] != v for k, v in hashes.items())
            or crop_summary['manifest_sha256'] != hashes['manifest_sha256']
            or color_summary['manifest_sha256'] != hashes['manifest_sha256']
            or sha(annotation_raw) != crop_summary['annotation_sha256']):
        raise ValueError('Frozen crop provenance mismatch.')
    packages = {p: importlib.metadata.version(p) for p in ('torch', 'open-clip-torch', 'pillow', 'numpy')}
    for p, v in baseline['packages'].items():
        if packages[p] != v:
            raise ValueError('Restore baseline dependency versions.')
    provenance = dict(**hashes, annotation_sha256=sha(annotation_raw), model=baseline['model'],
                      weights=baseline['weights'], packages=packages,
                      color_source_sha256=sha(Path(__file__).with_name('color.py').read_bytes()),
                      crop_sha256={r['path']: color_summary['crop_sha256'][r['path']] for r in rows},
                      paths=[r['path'] for r in rows], cache_version=1)
    cache = root / 'experiments/supervised/cache-v1'
    cache.mkdir(parents=True, exist_ok=True)
    if (cache / 'provenance.json').exists():
        if read_json(cache / 'provenance.json') != provenance:
            raise ValueError('Cache provenance mismatch; do not reuse stale features.')
    else:
        save_json(cache / 'provenance.json', provenance)
    embedder = None
    vectors = []
    for i, row in enumerate(rows):
        path = prior / 'crops' / (row['path'] + '.png')
        if path.resolve() != path.absolute():
            raise ValueError('Symlinked crop forbidden.')
        data = path.read_bytes()
        if sha(data) != provenance['crop_sha256'][row['path']]:
            raise ValueError('Saved crop changed.')
        original_data = source_bytes(root, row)  # selected whitelist only
        target = cache / f'{i:03d}.json'
        if target.exists():
            record = read_json(target)
            if record['path'] != row['path'] or record['crop_sha256'] != sha(data):
                raise ValueError('Cache item mismatch.')
        else:
            if embedder is None:
                os.environ['HF_HUB_OFFLINE'] = '1'
                os.environ['HF_HUB_DISABLE_TELEMETRY'] = '1'
                from ai_service.model import OpenClipEmbedder
                embedder = OpenClipEmbedder()
                if (embedder._settings.model_name, embedder._settings.model_version) != (baseline['model'], baseline['weights']):
                    raise ValueError('Model changed.')
            with Image.open(BytesIO(original_data)) as original, Image.open(BytesIO(data)) as crop:
                crop = crop.convert('RGB')
                expected = crop_image(original, boxes[row['path']])
                if crop.size != expected.size or crop.tobytes() != expected.tobytes():
                    raise ValueError('Crop pixel mismatch.')
                left, top, side = square_bounds(boxes[row['path']])
                real = crop.crop((max(0, -left), max(0, -top),
                                  min(side, original.width-left), min(side, original.height-top)))
                lab = features(real)['Lab']
            embedding = embedder.embed_bytes(data).embedding
            record = dict(path=row['path'], crop_sha256=sha(data), clip=embedding, lab=lab.tolist())
            temp = target.with_suffix('.tmp')
            save_json(temp, record)
            temp.replace(target)
        clip, lab = np.array(record['clip']), np.array(record['lab'])
        if (clip.shape != (512,) or lab.shape != (512,) or not np.isfinite([clip, lab]).all()
                or abs(np.linalg.norm(clip)-1) > 1e-5 or np.min(lab) < 0 or abs(lab.sum()-1) > 1e-9):
            raise ValueError('Invalid features.')
        vectors.append(np.r_[clip, lab])
        print(f'Features ready: {i+1}/36 ({row["split"]})', flush=True)
    provenance['cache_item_sha256'] = {f'{i:03d}.json': sha((cache/f'{i:03d}.json').read_bytes()) for i in range(len(rows))}
    return np.array(vectors), provenance


def verify_comparisons(root, rows, x):
    prior = read_json(root / EXPERIMENT / 'runs/cropped-v1/predictions.json')
    color = read_json(root / 'experiments/color-features/runs/color-v1/predictions.json')
    dev = [i for i, r in enumerate(rows) if r['split'] == 'development']
    if ({p['path'] for p in prior} != {rows[i]['path'] for i in dev}
            or {p['path'] for p in color} != {rows[i]['path'] for i in dev} or len(prior) != 9 or len(color) != 9):
        raise ValueError('Comparison cohort mismatch.')
    by_path, colors = {p['path']: p for p in prior}, {p['path']: p for p in color}
    max_clip, max_lab = 0., 0.
    for i in dev:
        r = rows[i]
        if by_path[r['path']]['expected'] != r['label'] or colors[r['path']]['expected'] != r['label']:
            raise ValueError('Comparison label mismatch.')
        for label in LABELS:
            refs = [j for j, row in enumerate(rows) if row['split'] == 'train' and row['label'] == label]
            clip = float(np.mean(np.sort(x[refs, :512] @ x[i, :512])[-3:]))
            saved = next(c['score'] for c in by_path[r['path']]['result']['candidates'] if c['petId'] == label)
            max_clip = max(max_clip, abs(clip-saved))
            lab = distance(x[i, 512:], np.mean(x[refs, 512:], axis=0))
            max_lab = max(max_lab, abs(lab-colors[r['path']]['distances']['Lab'][label]))
    if max_clip > 1e-5 or max_lab > 1e-10:
        raise ValueError('Cached features do not reproduce prior scores.')
    return by_path, colors, dict(max_clip_score_difference=max_clip, max_lab_distance_difference=max_lab)


def run(root, name):
    if not name or any(c not in 'abcdefghijklmnopqrstuvwxyz0123456789-_' for c in name):
        raise ValueError('Use a plain lowercase run name.')
    output = root / 'experiments/supervised/runs' / name
    if output.exists():
        raise FileExistsError('Run exists; choose a new name.')
    rows, baseline, hashes, _ = context(root)
    train = np.array([i for i, r in enumerate(rows) if r['split']=='train'])
    dev = np.array([i for i, r in enumerate(rows) if r['split']=='development'])
    y = np.array([LABELS.index(rows[i]['label']) for i in train])
    groups = np.array([rows[i]['group'] for i in train])
    folds = grouped_folds(y, groups)
    if set(groups) & {rows[i]['group'] for i in dev}:
        raise ValueError('Reference/development group overlap.')
    output.mkdir(parents=True)
    save_json(output / 'protocol.json', dict(config=CONFIG, **hashes,
              folds=[dict(train_paths=[rows[train[i]]['path'] for i in tr],
                          validation_paths=[rows[train[i]]['path'] for i in va],
                          train_counts=dict(Counter(LABELS[y[i]] for i in tr)),
                          validation_counts=dict(Counter(LABELS[y[i]] for i in va))) for tr, va in folds]))
    x, provenance = extract(root, rows, baseline, hashes)
    # Model selection API receives only reference arrays, never development labels/features.
    fitted, cv = {}, {}
    with warnings.catch_warnings():
        warnings.simplefilter('error', ConvergenceWarning)
        for method in METHODS:
            best, candidates, model = select_model(x[train], y, groups, method)
            fitted[method] = model
            cv[method] = dict(selected_C=best['C'], selected_mean_group_accuracy=best['mean_group_accuracy'],
                              selected_pooled_accuracy=best['pooled_accuracy'], candidates=candidates)
    save_json(output / 'cv-results.json', cv)  # freeze choices before scoring development
    prior, colors, equivalence = verify_comparisons(root, rows, x)
    truth = [LABELS.index(rows[i]['label']) for i in dev]
    predictions = [dict(path=rows[i]['path'], expected=rows[i]['label'],
                        cropped_OpenCLIP=prior[rows[i]['path']]['result']['candidates'][0]['petId'],
                        Lab_prototype=colors[rows[i]['path']]['Lab']) for i in dev]
    metrics = {}
    for method, model in fitted.items():
        pred = model.predict(x[dev])
        metrics[method] = stats(truth, pred.tolist())
        for p, value, prob in zip(predictions, pred, model.predict_proba(x[dev]), strict=True):
            p[method] = LABELS[value]
            p[method+'_probability_annie_uncalibrated'] = float(prob[1])
        scaler = model.named_steps['scale']
        save_json(output / (method + '-model.json'), dict(classes=LABELS,
                  coefficient=model.named_steps['lr'].coef_.tolist(), intercept=model.named_steps['lr'].intercept_.tolist(),
                  blocks={n:dict(mean=t.mean_.tolist(), scale=t.scale_.tolist(), columns=cols)
                          for n,t,cols in scaler.transformers_ if n!='remainder'}))
    for method in ('cropped_OpenCLIP', 'Lab_prototype'):
        metrics[method] = stats(truth, [LABELS.index(p[method]) for p in predictions])
    summary = dict(config=CONFIG, reference_count=27, development_count=9, reference_groups=len(folds),
                   test_images_opened=0, provenance=provenance, equivalence=equivalence,
                   packages={p:importlib.metadata.version(p) for p in ('scikit-learn','scipy','numpy','joblib','threadpoolctl')},
                   script_sha256=sha(Path(__file__).read_bytes()), metrics=metrics,
                   selected={m:{k:v for k,v in info.items() if k!='candidates'} for m,info in cv.items()})
    save_json(output / 'summary.json', summary)
    save_json(output / 'predictions.json', predictions)
    lines = ['# Experiment 4: lightweight supervised identity classification', '',
             'Development only: 27 reference photos across 12 groups; 9 development photos (5 Potato, 4 Annie). '
             'Frozen splits/crops unchanged. No held-out image files opened.', '',
             'Fixed protocol: leave-one-reference-group-out CV; separate per-feature StandardScaler for each '
             '512D block inside each fold; concatenated blocks for combined model. L2 logistic regression, '
             'lbfgs, class_weight=balanced (fold-training labels only), tol=1e-8, max_iter=5000, seed=42. '
             'C grid: 0.001, 0.01, 0.1, 1, 10. Select mean group accuracy; ties prefer smaller C '
             '(stronger regularization). No SVM, feature-weight search or decision-threshold tuning.', '',
             'Validation groups can contain one class; every fold training set contains both. '
             'Group-mean selection gives each session equal influence. Selected CV scores are tuning scores, '
             'not unbiased nested-CV estimates. Refit scaler and model on all 27 references before development.', '',
             '| Method | Selected C | CV mean session accuracy | CV pooled accuracy | Development correct |',
             '|---|---:|---:|---:|---:|']
    for m in METHODS:
        lines.append(f"| {m} | {cv[m]['selected_C']} | {cv[m]['selected_mean_group_accuracy']:.1%} | {cv[m]['selected_pooled_accuracy']:.1%} | {metrics[m]['correct']}/9 ({metrics[m]['correct']/9:.1%}) |")
    for m in ('cropped_OpenCLIP','Lab_prototype'):
        lines.append(f"| {m} (saved ranking) | — | — | — | {metrics[m]['correct']}/9 ({metrics[m]['correct']/9:.1%}) |")
    for m, metric in metrics.items():
        a=metric['confusion_matrix']
        lines += ['', f'## {m} confusion matrix', '', '| Actual / Predicted | Potato | Annie |',
                  '|---|---:|---:|',f'| Potato | {a[0][0]} | {a[0][1]} |', f'| Annie | {a[1][0]} | {a[1][1]} |']
    lines += ['', '## Per-image predictions', '', '| Image | Actual | CLIP ranking | Lab prototype | CLIP LR | Lab LR | Combined LR |', '|---|---|---|---|---|---|---|']
    for p in predictions:
        lines.append('| '+' | '.join(p[k] for k in ('path','expected','cropped_OpenCLIP','Lab_prototype',*METHODS))+' |')
    lines += ['', '## Limits and provenance', '',
              'These are forced binary identity predictions, not Both/Neither/Unknown detection or the production '
              'decision policy. Logistic probabilities are uncalibrated. There are 512 or 1024 inputs for only '
              '27 images, fewer independent groups; overfitting remains likely despite L2 regularization. '
              'Development has already influenced the choice of experiment family. One image changes its accuracy '
              'by 11.1 percentage points. No population accuracy or causal lighting claim is justified.', '',
              'CLIP cache uses unchanged production decoder, model/weights and preprocessing. Lab reuses Experiment 3 '
              'histograms and excludes only geometric gray padding. Saved scores were reproduced from cached features '
              f"(maximum CLIP difference {equivalence['max_clip_score_difference']:.3g}; Lab difference {equivalence['max_lab_distance_difference']:.3g}). "
              'Cache records contain hashes and fixed feature provenance; no fitted scaling is cached across folds. '
              'Protocol, CV candidate scores, fold paths/counts, final model coefficients/scalers, predictions and '
              'package versions are saved locally. No production code, database or deployment changed.', '']
    (output / 'report.md').write_text('\n'.join(lines))
    print(json.dumps(dict(selected=summary['selected'], metrics=metrics),indent=2))
    print(output / 'report.md')


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run-name',default='supervised-v1')
    args=parser.parse_args()
    run(dataset_root(), args.run_name)
