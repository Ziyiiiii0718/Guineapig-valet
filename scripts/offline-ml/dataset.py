"""Local-only dataset preparation. No service, database, or upload clients."""
import argparse
import hashlib
import json
import os
import random
import sys
from pathlib import Path

from PIL import Image, ImageOps

LABELS = ('potato', 'annie', 'both', 'neither')
EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp'}


def dataset_root(value=None):
    raw = value if value is not None else os.environ.get('PIGGIE_DATASET_DIR')
    if not raw or not str(raw).strip():
        raise ValueError('Set PIGGIE_DATASET_DIR to your absolute external dataset path.')
    root = Path(raw).expanduser()
    if not root.is_absolute():
        raise ValueError('Dataset path must be absolute.')
    root = root.resolve()
    if root.is_relative_to(Path(__file__).resolve().parents[2]):
        raise ValueError('Keep personal photos outside the GuineaAI repository.')
    if not root.is_dir():
        raise ValueError('Dataset folder does not exist or is inaccessible.')
    return root


def fingerprint(path):
    with Image.open(path) as image:
        image.load()
        if image.format not in {'JPEG', 'PNG', 'WEBP'}:
            raise ValueError('Unsupported decoded image format.')
        small = ImageOps.exif_transpose(image).convert('L').resize((9, 8))
        pixels = list(small.getdata())
        return sum((pixels[y*9+x] > pixels[y*9+x+1]) << (y*8+x)
                   for y in range(8) for x in range(8))


def scan(root, sessions=None):
    rows = []
    for label in LABELS:
        folder = root / label
        if folder.is_symlink():
            raise ValueError('Label folders cannot be symlinks.')
        if not folder.is_dir():
            raise ValueError(f'Missing folder: {label}')
        for path in sorted(folder.rglob('*')):
            if path.is_symlink():
                raise ValueError('Symlinks are not allowed in the dataset.')
            if not path.is_file() or path.name == '.DS_Store':
                continue
            relative = path.relative_to(root)
            if path.suffix.lower() not in EXTENSIONS:
                raise ValueError('JPEG, PNG, WebP only.')
            if sessions is None and len(relative.parts) != 3:
                raise ValueError('Use label/session/image.jpg or an explicit session decisions file.')
            if sessions is not None and relative.as_posix() not in sessions:
                raise ValueError('A photo has no explicit session decision.')
            session = relative.parts[1] if sessions is None else sessions[relative.as_posix()]
            if session is not None and (not isinstance(session, str) or not session.strip()):
                raise ValueError('Session must be a nonempty string, or null for exclusion.')
            dhash = fingerprint(path)
            rows.append(dict(path=relative.as_posix(), label=label,
                             session=session,
                             sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
                             dhash=dhash))
    if sessions is not None and set(sessions) != {r['path'] for r in rows}:
        raise ValueError('Session decisions contain missing or extra photo paths.')
    if not rows:
        raise ValueError('No photos found. Add label/session/image.jpg first.')
    return rows


def split_rows(rows, seed=42):
    # Connected components: a duplicate connects entire sessions, transitively.
    sessions = sorted({r['session'] for r in rows})
    parent = {s: s for s in sessions}

    def find(s):
        while parent[s] != s:
            s = parent[s]
        return s

    for i, row in enumerate(rows):
        for other in rows[:i]:
            exact = row['sha256'] == other['sha256']
            if exact and row['label'] != other['label']:
                raise ValueError('Identical photos have conflicting labels.')
            if exact or (row['dhash'] ^ other['dhash']).bit_count() <= 6:
                parent[find(row['session'])] = find(other['session'])
    groups = sorted({find(s) for s in sessions})
    if len(groups) < 3:
        raise ValueError('Need at least 3 independent session/duplicate groups.')
    random.Random(seed).shuffle(groups)
    heldout = max(1, round(len(groups) * .2))
    assignments = {g: ('development' if i < heldout else
                       'test' if i < heldout * 2 else 'train')
                   for i, g in enumerate(groups)}
    return [dict(row, group=find(row['session']),
                 split=assignments[find(row['session'])]) for row in rows]


def load_frozen(root):
    manifest = json.loads((root / 'manifest.json').read_text())
    current = scan(root, manifest.get('session_decisions', {}).get('sessions'))
    expected = split_rows([r for r in current if r['session'] is not None], manifest['seed'])
    if manifest.get('excluded', []) != [r for r in current if r['session'] is None]:
        raise ValueError('Excluded dataset files changed.')
    if manifest['samples'] != expected:
        raise ValueError('Dataset or manifest changed. Restore it or prepare a new version.')
    return manifest


def validate_coverage(rows):
    for split in ('train', 'development', 'test'):
        for label in ('potato', 'annie'):
            count = sum(r['split'] == split and r['label'] == label for r in rows)
            minimum = 2 if split == 'train' else 1
            if count < minimum:
                raise ValueError(f'Insufficient {label} coverage in {split}; '
                                 'collect more independent sessions rather than force a split.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', nargs='?', help='Absolute path; defaults to PIGGIE_DATASET_DIR')
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--sessions', type=Path, help='JSON with complete path-to-session map; null excludes')
    args = parser.parse_args()
    args.root = dataset_root(args.root)
    decisions = json.loads(args.sessions.read_text()) if args.sessions else None
    if decisions is not None and not isinstance(decisions.get('sessions'), dict):
        raise ValueError('Session decisions must contain a sessions mapping.')
    current = scan(args.root, decisions['sessions'] if decisions else None)
    rows = split_rows([r for r in current if r['session'] is not None], args.seed)
    validate_coverage(rows)
    manifest = dict(version=2, seed=args.seed, duplicate_hamming_distance=6,
                    samples=rows, excluded=[r for r in current if r['session'] is None])
    if decisions is not None:
        manifest['session_decisions'] = decisions
    # Never silently reshuffle a previous experiment.
    with (args.root / 'manifest.json').open('x') as file:
        json.dump(manifest, file, indent=2)
    for split in ('train', 'development', 'test'):
        print(split, {label: sum(r['split'] == split and r['label'] == label
                                for r in rows) for label in LABELS})
    print('Frozen manifest written. Review class coverage before evaluating.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, FileExistsError, FileNotFoundError) as error:
        sys.exit(f'Preparation stopped: {error}')
