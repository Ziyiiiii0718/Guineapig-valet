"""Offline, fixed HSV/Lab prototype experiment; never opens held-out images."""
import argparse
from collections import Counter
from io import BytesIO
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from cropped import (EXPERIMENT, POLICY, context, crop_image, sha, source_bytes,
                     square_bounds, validate_annotations)
from dataset import dataset_root

LABELS = ('potato', 'annie')
CONFIG = dict(version=1, hsv_bins=[16, 4, 4], lab_bins=[8, 8, 8],
              lab_ranges=[[0, 100], [-128, 128], [-128, 128]],
              prototype='equal-image arithmetic mean of normalized reference histograms',
              distance='Hellinger', tie_break='potato',
              padding='exclude only geometric out-of-source padding',
              pixels='all real crop pixels; no segmentation, resizing, or color correction',
              hsv='Pillow HSV; hue shifted by half a bin, wrapping red across zero')


def rgb_lab(rgb):
    """sRGB [0,1] -> CIELAB, D65 reference white; no fitted parameters."""
    linear = np.where(rgb <= .04045, rgb / 12.92, ((rgb + .055) / 1.055) ** 2.4)
    xyz = linear @ np.array([[.4124564, .3575761, .1804375],
                            [.2126729, .7151522, .0721750],
                            [.0193339, .1191920, .9503041]]).T
    xyz /= np.array([.95047, 1., 1.08883])
    delta = 6 / 29
    f = np.where(xyz > delta ** 3, np.cbrt(xyz), xyz / (3 * delta ** 2) + 4 / 29)
    return np.stack((116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]),
                     200 * (f[..., 1] - f[..., 2])), axis=-1)


def histogram(values, bins, ranges):
    # Clip numerical roundoff at theoretical limits; every pixel contributes.
    values = np.clip(values, np.array(ranges)[:, 0], np.array(ranges)[:, 1])
    counts = np.histogramdd(values, bins=bins, range=ranges)[0].ravel()
    if counts.sum() == 0:
        raise ValueError('Empty crop.')
    return counts / counts.sum()


def features(image):
    rgb = np.asarray(image.convert('RGB'), dtype=np.float64).reshape(-1, 3) / 255
    hsv = np.asarray(image.convert('HSV'), dtype=np.float64).reshape(-1, 3) / 255
    hsv[:, 0] = (hsv[:, 0] + 1 / 32) % 1
    # Hue is undefined for achromatic pixels. Collapse the lowest saturation
    # bin into one hue bin so gray coats/backgrounds are not assigned a hue.
    hsv[hsv[:, 1] < .25, 0] = 0
    lab = rgb_lab(rgb)
    return dict(HSV=histogram(hsv, CONFIG['hsv_bins'], [[0, 1]] * 3),
                Lab=histogram(lab, CONFIG['lab_bins'], CONFIG['lab_ranges']))


def fit(rows, vectors):
    return {method: {label: np.mean([vectors[r['path']][method] for r in rows
                                    if r['split'] == 'train' and r['label'] == label], axis=0)
                     for label in LABELS} for method in ('HSV', 'Lab')}


def distance(a, b):
    return float(np.linalg.norm(np.sqrt(a) - np.sqrt(b)) / np.sqrt(2))


def confusion(predictions, method):
    return [[sum(p['expected'] == actual and p[method] == predicted for p in predictions)
             for predicted in LABELS] for actual in LABELS]


def run(root, run_name):
    if not run_name or Path(run_name).name != run_name or run_name in ('.', '..'):
        raise ValueError('Run name must be a plain folder name.')
    rows, _, hashes, _ = context(root)  # metadata-only filtering before file access
    prior = root / EXPERIMENT / 'runs/cropped-v1'
    summary_raw = (prior / 'summary.json').read_bytes()
    prior_summary = json.loads(summary_raw)
    annotations_raw = (prior / 'annotations.json').read_bytes()
    spec = json.loads((root / EXPERIMENT / 'experiment.json').read_text())
    if (prior_summary['manifest_sha256'] != hashes['manifest_sha256']
            or spec['manifest_sha256'] != hashes['manifest_sha256']
            or prior_summary['policy'] != POLICY
            or sha(annotations_raw) != prior_summary['annotation_sha256']):
        raise ValueError('Cropped run provenance mismatch.')
    boxes = validate_annotations(spec, json.loads(annotations_raw))
    if set(boxes) != {r['path'] for r in rows}:
        raise ValueError('Crop cohort mismatch.')
    predictions_raw = (prior / 'predictions.json').read_bytes()
    old = json.loads(predictions_raw)
    old_by_path = {p['path']: p for p in old}
    dev = [r for r in rows if r['split'] == 'development']
    if len(old) != 9 or set(old_by_path) != {r['path'] for r in dev}:
        raise ValueError('Development predictions mismatch.')
    vectors, crop_hashes, thumbs = {}, {}, {}
    for row in rows:
        path = row['path']
        data = (prior / 'crops' / (path + '.png')).read_bytes()
        with Image.open(BytesIO(source_bytes(root, row))) as original:
            expected = crop_image(original, boxes[path])
            with Image.open(BytesIO(data)) as image:
                image = image.convert('RGB')
                if image.size != expected.size or image.tobytes() != expected.tobytes():
                    raise ValueError('Saved crop differs from frozen annotation.')
                left, top, side = square_bounds(boxes[path])
                real = image.crop((max(0, -left), max(0, -top),
                                   min(side, original.width - left), min(side, original.height - top)))
                vectors[path] = features(real)
                image.thumbnail((260, 220))
                thumbs[path] = image.copy()
        crop_hashes[path] = sha(data)
    prototypes = fit(rows, vectors)
    predictions = []
    for row in dev:
        path = row['path']
        if old_by_path[path]['expected'] != row['label']:
            raise ValueError('Label mismatch.')
        result = dict(path=path, expected=row['label'],
                      OpenCLIP=old_by_path[path]['result']['candidates'][0]['petId'], distances={})
        for method in prototypes:
            distances = {label: distance(vectors[path][method], prototypes[method][label]) for label in LABELS}
            result[method] = min(LABELS, key=distances.get)
            result['distances'][method] = distances
        predictions.append(result)
    metrics = {m: dict(correct=sum(p[m] == p['expected'] for p in predictions),
                       total=9, confusion_matrix=confusion(predictions, m))
               for m in ('OpenCLIP', 'HSV', 'Lab')}
    output = root / 'experiments/color-features/runs' / run_name
    output.mkdir(parents=True, exist_ok=False)
    provenance = dict(**hashes, cropped_summary_sha256=sha(summary_raw),
                      cropped_predictions_sha256=sha(predictions_raw),
                      annotations_sha256=sha(annotations_raw), crop_sha256=crop_hashes,
                      script_sha256=sha(Path(__file__).read_bytes()), numpy_version=np.__version__,
                      config=CONFIG, test_images_opened=0,
                      counts={s: dict(Counter(r['label'] for r in rows if r['split'] == s))
                              for s in ('train', 'development')}, metrics=metrics)
    for filename, value in [('summary.json', provenance), ('predictions.json', predictions),
                            ('prototypes.json', {m: {l: v.tolist() for l, v in pets.items()}
                                                  for m, pets in prototypes.items()})]:
        (output / filename).write_text(json.dumps(value, indent=2))
    for split in ('train', 'development'):
        subset = [r for r in rows if r['split'] == split]
        sheet = Image.new('RGB', (840, ((len(subset) + 2) // 3) * 260), 'white')
        draw = ImageDraw.Draw(sheet)
        for i, row in enumerate(subset):
            x, y = (i % 3) * 280, (i // 3) * 260
            sheet.paste(thumbs[row['path']], (x, y))
            draw.text((x + 2, y + 224), row['path'], fill='black')
        sheet.save(output / f'{split}-contact-sheet.jpg')
    lines = ['# Experiment 3: HSV and Lab color identity ranking', '',
             'Frozen 27 reference crops (14 Potato, 13 Annie); same 9 development crops '
             '(5 Potato, 4 Annie). No held-out image files opened.', '',
             'Methods were fixed before scoring: HSV 16×4×4 and D65 CIELAB 8×8×8 joint '
             'histograms, normalized per image; equal-image mean reference histogram per pet; '
             'nearest prototype by Hellinger distance. Smaller distance is better; distances '
             'are neither probabilities nor CLIP similarities. No tuning, score fusion, or CLIP thresholds.', '',
             'Same saved full-body crops, 5% margin and square expansion. Pixel-for-pixel crop '
             'verification against frozen boxes and source hashes passed. Only synthetic gray padding '
             'is excluded geometrically. All real background remains. Native RGB pixels are assumed '
             'sRGB; no white balance or ICC correction. Hue wraps with a half-bin offset; lowest '
             'saturation bin has hue collapsed. Hard histogram boundaries remain a limitation.', '',
             '| Identity ranking | Correct | Accuracy |', '|---|---:|---:|']
    for method, metric in metrics.items():
        lines.append(f"| {method} | {metric['correct']}/9 | {metric['correct']/9:.1%} |")
    lines += ['', 'These are forced two-identity rankings, not calibrated Both/Neither/Unknown '
              'classification. The unchanged cropped CLIP final classification accuracy remains 2/9.', '']
    for method, metric in metrics.items():
        matrix = metric['confusion_matrix']
        lines += [f'## {method} ranking confusion matrix', '', '| Actual / Predicted | Potato | Annie |',
                  '|---|---:|---:|', f'| Potato | {matrix[0][0]} | {matrix[0][1]} |',
                  f'| Annie | {matrix[1][0]} | {matrix[1][1]} |', '']
    lines += ['## Paired development predictions', '',
              '| Image | True | CLIP rank | HSV rank | HSV distance P / A | Lab rank | Lab distance P / A |',
              '|---|---|---|---|---|---|---|']
    for p in predictions:
        h, l = p['distances']['HSV'], p['distances']['Lab']
        lines.append(f"| {p['path']} | {p['expected']} | {p['OpenCLIP']} | {p['HSV']} | "
                     f"{h['potato']:.4f} / {h['annie']:.4f} | {p['Lab']} | {l['potato']:.4f} / {l['annie']:.4f} |")
    lines += ['', '## Limits', '', 'Nine development photos are a small, session-correlated sample. '
              'A change of one image changes accuracy by 11.1 percentage points. These results '
              'cannot establish generalization or estimate Both/Neither detection performance. '
              'No feature choice was selected using held-out data. Stored JSON contains exact '
              'distances, reference prototypes, configuration and provenance hashes. Visual review follows separately.', '']
    (output / 'report.md').write_text('\n'.join(lines))
    print(json.dumps(metrics, indent=2))
    print(output / 'report.md')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run-name', default='color-v1')
    args = parser.parse_args()
    run(dataset_root(), args.run_name)
