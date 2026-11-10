import json
import os
import subprocess
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

from PIL import Image

from convert_heic import convert
from audit import audit
from dataset import LABELS, dataset_root, load_frozen, scan, split_rows, validate_coverage
from evaluate import REPO, markdown_report, metrics


def sample(session, fingerprint, label='potato'):
    return dict(session=session, sha256=str(fingerprint), dhash=fingerprint,
                label=label, path=f'{label}/{session}/photo.jpg')


class DatasetTests(unittest.TestCase):
    def test_export_bakes_orientation_and_preserves_capture_date(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / 'original.heic'
            source.write_bytes(b'unchanged source')
            target = root / 'copy.jpg'

            def decode_to_tiff(command, **kwargs):
                image = Image.new('RGB', (8, 4), 'red')
                exif = Image.Exif()
                exif[274] = 6
                exif[34665] = {36867: '2026:11:03 09:30:00'}
                image.save(command[-1], 'TIFF', tiffinfo={274: 6, 34665: {36867: '2026:11:03 09:30:00'}})

            with patch('convert_heic.subprocess.run', side_effect=decode_to_tiff):
                convert(source, target)
            with Image.open(target) as image:
                image.load()
                self.assertEqual(image.size, (4, 8))
                self.assertEqual(image.getexif()[274], 1)
                self.assertEqual(image.getexif().get_ifd(34665)[36867], '2026:11:03 09:30:00')
            self.assertEqual(source.read_bytes(), b'unchanged source')

    def test_explicit_sessions_and_exclusions_are_frozen(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for label in LABELS:
                (root / label).mkdir()
            import random
            sessions = {}
            for i in range(5):
                name = f'potato/{i}.png'
                image = Image.new('L', (9, 8))
                rng = random.Random(i)
                image.putdata([rng.randrange(256) for _ in range(72)])
                image.save(root / name)
                sessions[name] = f'session-{i}' if i < 4 else None
            current = scan(root, sessions)
            rows = split_rows([r for r in current if r['session'] is not None])
            manifest = dict(seed=42, session_decisions=dict(sessions=sessions),
                            samples=rows, excluded=[r for r in current if r['session'] is None])
            (root / 'manifest.json').write_text(json.dumps(manifest))
            self.assertEqual(load_frozen(root), manifest)
            with self.assertRaises(ValueError):
                scan(root, {k: v for k, v in sessions.items() if k != 'potato/0.png'})
            (root / 'potato/4.png').unlink()
            with self.assertRaises(ValueError):
                load_frozen(root)

    def test_coverage_and_single_pet_metrics(self):
        with self.assertRaises(ValueError):
            validate_coverage([dict(split='train', label='potato')])
        rows = [dict(split=split, label=label) for split in ('train', 'development', 'test')
                for label in ('potato', 'annie') for _ in range(2)]
        validate_coverage(rows)
        report = metrics(['potato', 'annie', 'both', 'neither'],
                         ['potato', 'unknown', 'both', 'unknown'])
        self.assertEqual(report['single_pet_accuracy'], .5)
        self.assertEqual(report['single_pet_count'], 2)
        self.assertEqual(report['single_pet_uncertain_rate'], .5)

    def test_external_environment_path(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.dict('os.environ', {'PIGGIE_DATASET_DIR': directory}):
                self.assertEqual(dataset_root(), Path(directory).resolve())
            with patch.dict('os.environ', {}, clear=True):
                with self.assertRaises(ValueError):
                    dataset_root()
        with self.assertRaises(ValueError):
            dataset_root(str(REPO))
        with self.assertRaises(ValueError):
            dataset_root('relative/path')

    def test_flat_audit_reports_partial_coverage_and_duplicates(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for label in LABELS:
                (root / label).mkdir()
            Image.new('RGB', (10, 10)).save(root / 'potato/a.jpg')
            (root / 'annie/b.jpg').write_bytes((root / 'potato/a.jpg').read_bytes())
            (root / 'both/c.heic').write_bytes(b'unsupported example')
            (root / 'neither/d.jpg').write_bytes(b'invalid image')
            result = audit(root)
            self.assertEqual(result['exact_duplicate_pairs'], 1)
            self.assertEqual(result['conflicting_exact_duplicate_pairs'], 1)
            self.assertEqual(result['unsupported_files'], 1)
            self.assertEqual(result['invalid_supported_files'], 1)
            self.assertEqual(result['near_duplicate_checked_images'], 2)
            self.assertEqual(result['files_without_session_layout'], 4)

    def test_session_worksheet_does_not_assign_missing_dates(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for label in LABELS:
                (root / label).mkdir()
            image = Image.new('RGB', (10, 10))
            image.save(root / 'potato/missing.jpg')
            exif = Image.Exif()
            exif[34665] = {36867: '2026:11:03 09:30:00'}
            image.save(root / 'annie/dated.jpg', exif=exif)
            before = sorted(str(p) for p in root.rglob('*'))
            result = subprocess.run(['node', str(REPO / 'scripts/offline-ml/sessions.mjs')],
                                    env=dict(os.environ, PIGGIE_DATASET_DIR=directory),
                                    text=True, capture_output=True, check=True)
            self.assertIn('UNASSIGNED', result.stdout)
            self.assertIn('2026-11-03-review', result.stdout)
            self.assertEqual(before, sorted(str(p) for p in root.rglob('*')))

    def test_requested_rates_and_markdown(self):
        report = metrics(['potato', 'both', 'neither'], ['both', 'both', 'unknown'])
        self.assertEqual(report['false_multi_pet_rate'], .5)
        self.assertEqual(report['uncertain_prediction_rate'], 1 / 3)
        self.assertIsNone(metrics(['both'], ['both'])['false_multi_pet_rate'])
        with self.assertRaises(ValueError):
            metrics([], [])
        report.update(method='test', split='development', manifest_sha256='example')
        self.assertIn('50.00%', markdown_report(report))
        self.assertIn('| neither |', markdown_report(report))

    def test_session_and_transitive_duplicates_stay_together(self):
        rows = [sample('a', 0), sample('b', 1), sample('b', 2**64-1),
                sample('c', 2**64-2), sample('d', int('aa'*8, 16)),
                sample('e', int('cc'*8, 16))]
        result = split_rows(rows)
        self.assertEqual(len({r['split'] for r in result[:4]}), 1)
        self.assertEqual(result, split_rows(rows))
        self.assertEqual({r['split'] for r in result}, {'train', 'development', 'test'})

    def test_conflicting_exact_duplicates_fail(self):
        with self.assertRaises(ValueError):
            split_rows([sample('a', 0), sample('b', 0, 'annie')])

    def test_too_few_independent_sessions_fail(self):
        with self.assertRaises(ValueError):
            split_rows([sample('a', 0), sample('b', 1)])

    def test_loader_requires_sessions_and_detects_changes(self):
        import random
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for label in LABELS:
                (root / label).mkdir()
            Image.new('RGB', (10, 10)).save(root / 'potato/flat.png')
            with self.assertRaises(ValueError):
                scan(root)
            (root / 'potato/flat.png').unlink()
            for i in range(5):
                folder = root / 'potato' / f'session-{i}'
                folder.mkdir()
                rng = random.Random(i)
                image = Image.new('L', (9, 8))
                image.putdata([rng.randrange(256) for _ in range(72)])
                image.save(folder / 'photo.png')
            manifest = dict(seed=42, samples=split_rows(scan(root)))
            (root / 'manifest.json').write_text(json.dumps(manifest))
            self.assertEqual(load_frozen(root), manifest)
            Image.new('RGB', (9, 8)).save(folder / 'photo.png')
            with self.assertRaises(ValueError):
                load_frozen(root)

    def test_unknown_is_not_neither(self):
        report = metrics(['potato', 'neither'], ['potato', 'unknown'])
        self.assertEqual(report['accuracy'], .5)
        self.assertEqual(report['per_class']['neither']['recall'], 0)
        self.assertEqual(report['confusion_matrix']['neither']['unknown'], 1)

    def test_real_classifier_bridge(self):
        references = [dict(petId=pet, referenceId=str(i), embedding=vector)
                      for pet, vector in [('potato', [1, 0]), ('annie', [0, 1])]
                      for i in range(2)]
        process = subprocess.run(['node', str(REPO / 'scripts/offline-ml/classify.mjs')],
                                 input=json.dumps(dict(references=references,
                                                       queries=[[1, 0], [0, 1], [-1, 0]])),
                                 text=True, capture_output=True, check=True)
        results = json.loads(process.stdout)
        self.assertEqual([r['suggestedPetIds'] for r in results], [['potato'], ['annie'], []])
        self.assertEqual(results[-1]['outcome'], 'unknown')


if __name__ == '__main__':
    unittest.main()
