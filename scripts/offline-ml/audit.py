"""Read-only local dataset audit, including flat folders before session labeling."""
import argparse
import hashlib
import json
import sys
from collections import Counter

from dataset import EXTENSIONS, LABELS, dataset_root, fingerprint


def audit(root):
    rows = []
    counts = {}
    invalid = unsupported = missing_sessions = 0
    for label in LABELS:
        folder = root / label
        if not folder.is_dir() or folder.is_symlink():
            raise ValueError(f'Missing or symlinked label folder: {label}')
        extensions = Counter()
        for path in sorted(folder.rglob('*')):
            if path.is_symlink():
                raise ValueError('Symlinks are not allowed.')
            if not path.is_file() or path.name == '.DS_Store':
                continue
            extensions[path.suffix.lower()] += 1
            relative = path.relative_to(root)
            if len(relative.parts) != 3:
                missing_sessions += 1
            row = dict(label=label, sha256=hashlib.sha256(path.read_bytes()).hexdigest())
            if path.suffix.lower() not in EXTENSIONS:
                unsupported += 1
            else:
                try:
                    row['dhash'] = fingerprint(path)
                except (OSError, ValueError):
                    invalid += 1
            rows.append(row)
        counts[label] = dict(files=sum(extensions.values()), extensions=dict(extensions))
    exact = near = conflicting = 0
    for i, row in enumerate(rows):
        for other in rows[:i]:
            if row['sha256'] == other['sha256']:
                exact += 1
                conflicting += row['label'] != other['label']
            elif 'dhash' in row and 'dhash' in other:
                near += (row['dhash'] ^ other['dhash']).bit_count() <= 6
    return dict(categories=counts, total_files=len(rows), unsupported_files=unsupported,
                invalid_supported_files=invalid, files_without_session_layout=missing_sessions,
                exact_duplicate_pairs=exact, conflicting_exact_duplicate_pairs=conflicting,
                potential_near_duplicate_pairs=near,
                near_duplicate_checked_images=sum('dhash' in r for r in rows),
                note='Near-duplicate audit covers decoded supported images only. '
                     'Session labels and manual review are still required; no splits or inference ran.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('root', nargs='?', help='Defaults to PIGGIE_DATASET_DIR')
    args = parser.parse_args()
    print(json.dumps(audit(dataset_root(args.root)), indent=2))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError) as error:
        sys.exit(f'Audit stopped: {error}')
