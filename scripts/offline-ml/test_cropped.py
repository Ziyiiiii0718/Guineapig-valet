import json
from io import BytesIO, StringIO
from contextlib import redirect_stdout
from types import SimpleNamespace
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image

import cropped


class CropTests(unittest.TestCase):
    def test_boxes_and_padding_preserve_full_body(self):
        self.assertFalse(cropped.box_valid([0, 0, 11, 4], 10, 10))
        self.assertFalse(cropped.box_valid([0, 0, float('nan'), 4], 10, 10))
        self.assertFalse(cropped.box_valid([True, 0, 4, 4], 10, 10))
        self.assertFalse(cropped.box_valid([0, 0, 0, 4], 10, 10))
        image = Image.new('RGB', (20, 10), 'red')
        result = cropped.crop_image(image, [0, 0, 20, 10])
        self.assertEqual(result.size, (22, 22))
        self.assertEqual(result.getpixel((0, 0)), (128, 128, 128))
        self.assertEqual(result.getpixel((1, 6)), (255, 0, 0))
        self.assertEqual(result.getpixel((20, 15)), (255, 0, 0))
        self.assertEqual(image.size, (20, 10))

    def test_annotation_validation_requires_complete_exact_cohort(self):
        spec = dict(manifest_sha256='hash', items=[dict(path='potato/a.jpg', width=20, height=10)])
        annotations = dict(version=1, manifest_sha256='hash', policy=cropped.POLICY, boxes={})
        with self.assertRaises(ValueError):
            cropped.validate_annotations(spec, annotations)
        annotations['boxes']['potato/a.jpg'] = [0, 0, 20, 10]
        self.assertEqual(cropped.validate_annotations(spec, annotations), annotations['boxes'])
        annotations['boxes']['test.jpg'] = [0, 0, 20, 10]
        with self.assertRaises(ValueError):
            cropped.validate_annotations(spec, annotations)

    def test_prepare_never_opens_unselected_images(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            allowed = root / 'potato' / 'reference.png'
            allowed.parent.mkdir()
            Image.new('RGB', (20, 10), 'red').save(allowed)
            selected = dict(path='potato/reference.png', label='potato', split='train',
                            sha256=cropped.sha(allowed.read_bytes()))
            # There is deliberately no test file on disk. Metadata is sufficient to exclude it.
            manifest = dict(samples=[selected, dict(path='annie/held-out.png', split='test', label='annie'),
                                     dict(path='both/unused.png', split='development', label='both')])
            self.assertEqual(cropped.selected_rows(manifest), [selected])
            accesses = []
            original = cropped.source_bytes
            def tracked(root, row):
                accesses.append(row['path'])
                return original(root, row)
            with patch('cropped.context', return_value=([selected], {}, dict(manifest_sha256='hash'), [])), \
                    patch('cropped.source_bytes', side_effect=tracked):
                cropped.prepare(root)
            self.assertEqual(accesses, ['potato/reference.png'])
            html = (root / cropped.EXPERIMENT / 'annotate.html').read_text()
            self.assertNotIn('held-out', html)
            self.assertNotIn('both/unused', html)
            self.assertIn('data:image/jpeg;base64', html)

    def test_changed_images_and_traversal_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ('../secret', '/tmp/secret'):
                with self.assertRaises(ValueError):
                    cropped.source_bytes(root, dict(path=name, sha256='hash'))
            (root / 'image.png').write_bytes(b'changed')
            with self.assertRaises(ValueError):
                cropped.source_bytes(root, dict(path='image.png', sha256='hash'))

    def test_metrics_separate_identity_ranking_from_decisions(self):
        predictions = [dict(expected='potato', predicted='both', result=dict(candidates=[dict(petId='potato')])),
                       dict(expected='annie', predicted='unknown', result=dict(candidates=[dict(petId='potato')]))]
        report = cropped.summarize(predictions)
        self.assertEqual(report['single_pet_accuracy'], 0)
        self.assertEqual(report['identity_ranking_accuracy'], .5)
        self.assertEqual(report['false_multi_pet_rate'], .5)
        self.assertEqual(report['uncertain_prediction_rate'], .5)

    def test_complete_synthetic_evaluation_generates_paired_report(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            rows = []
            for split, counts in [('train', {'potato': 14, 'annie': 13}),
                                  ('development', {'potato': 5, 'annie': 4})]:
                for label, count in counts.items():
                    for i in range(count):
                        path = f'{label}/{split}-{i}.png'
                        target = root / path
                        target.parent.mkdir(exist_ok=True)
                        Image.new('RGB', (20, 20), 'red' if label == 'potato' else 'blue').save(target)
                        rows.append(dict(path=path, label=label, split=split,
                                         sha256=cropped.sha(target.read_bytes())))
            baseline = dict(model='synthetic', weights='synthetic', packages={}, config={})
            hashes = dict(manifest_sha256='synthetic')
            original = [dict(path=r['path'], expected=r['label'], predicted=r['label'],
                             result=dict(candidates=[dict(petId=r['label'])]))
                        for r in rows if r['split'] == 'development']
            folder = root / cropped.EXPERIMENT
            folder.mkdir(parents=True)
            spec = dict(policy=cropped.POLICY, **hashes,
                        items=[dict(r, width=20, height=20) for r in rows])
            (folder / 'experiment.json').write_text(json.dumps(spec))
            annotations = root / 'annotations.json'
            annotations.write_text(json.dumps(dict(version=1, **hashes, policy=cropped.POLICY,
                                                  boxes={r['path']: [2, 2, 18, 18] for r in rows})))
            class SyntheticEmbedder:
                _settings = SimpleNamespace(model_name='synthetic', model_version='synthetic')
                _preprocess = 'synthetic test only'
                def embed_bytes(self, data):
                    with Image.open(BytesIO(data)) as image:
                        pixel = image.getpixel((image.width // 2, image.height // 2))
                        return SimpleNamespace(embedding=[1., 0.] if pixel[0] > pixel[2] else [0., 1.])
            with patch('cropped.context', return_value=(rows, baseline, hashes, original)), \
                    patch.dict('sys.modules', {'ai_service.model': SimpleNamespace(OpenClipEmbedder=SyntheticEmbedder)}), \
                    redirect_stdout(StringIO()):
                cropped.evaluate(root, annotations, 'synthetic-check')
            output = folder / 'runs/synthetic-check'
            summary = json.loads((output / 'summary.json').read_text())
            self.assertEqual(summary['cropped']['single_pet_accuracy'], 1)
            self.assertEqual(summary['cropped']['identity_ranking_accuracy'], 1)
            self.assertEqual(summary['test_images_opened'], 0)
            self.assertEqual(len(list((output / 'crops').rglob('*.png'))), 36)
            self.assertIn('paired development comparison', (output / 'report.md').read_text())
            self.assertTrue(all(cropped.sha((root / r['path']).read_bytes()) == r['sha256'] for r in rows))

    def test_evaluation_stops_before_model_when_boxes_missing(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / cropped.EXPERIMENT).mkdir(parents=True)
            row = dict(path='potato/a.png', split='train', label='potato')
            spec = dict(policy=cropped.POLICY, manifest_sha256='hash',
                        items=[dict(row, width=20, height=10)])
            (root / cropped.EXPERIMENT / 'experiment.json').write_text(json.dumps(spec))
            annotations = root / 'boxes.json'
            annotations.write_text(json.dumps(dict(version=1, manifest_sha256='hash',
                                                  policy=cropped.POLICY, boxes={})))
            with patch('cropped.context', return_value=([row], {}, dict(manifest_sha256='hash'), [])):
                with self.assertRaisesRegex(ValueError, 'missing'):
                    cropped.evaluate(root, annotations, 'test')
            self.assertFalse((root / cropped.EXPERIMENT / 'runs').exists())


if __name__ == '__main__':
    unittest.main()
