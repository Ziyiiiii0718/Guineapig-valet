"""macOS local HEIC export; originals stay untouched and output must be new."""
import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image, ImageOps

from dataset import LABELS, dataset_root


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def convert(source, destination):
    # ImageIO (sips) decodes HEIC to a lossless TIFF; Pillow writes JPEG once.
    with tempfile.TemporaryDirectory(prefix='piggie-export-') as temporary:
        intermediate = Path(temporary) / 'decoded.tiff'
        subprocess.run(['sips', '-s', 'format', 'tiff', str(source),
                        '--out', str(intermediate)], check=True, capture_output=True)
        with Image.open(intermediate) as image:
            image.load()  # TIFF decoding may already apply its orientation.
            exif = image.getexif()
            # TIFF copy/transpose can drop lazy EXIF; materialize nested metadata first.
            for key in (34665, 34853):
                if key in exif:
                    exif[key] = dict(exif.get_ifd(key))
            upright = ImageOps.exif_transpose(image)
            # Do not copy TIFF strip offsets into JPEG metadata.
            for key in (273, 278, 279, 284, 259, 262, 277, 258, 317, 322, 323, 324, 325, 34675):
                if key in exif:
                    del exif[key]
            exif[274] = 1
            exif[256], exif[257] = upright.size
            if 34665 in exif:
                details = exif.get_ifd(34665)
                details[40962], details[40963] = upright.size
            upright.convert('RGB').save(destination, 'JPEG', quality=95, subsampling=0,
                                        exif=exif.tobytes(),
                                        icc_profile=image.info.get('icc_profile'))
    with Image.open(destination) as check:
        check.load()
        if check.getexif().get(274, 1) != 1:
            raise ValueError('Export is not upright.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    source = dataset_root()
    output = args.output.expanduser().resolve()
    repo = Path(__file__).resolve().parents[2]
    if not args.output.is_absolute() or output.is_relative_to(repo) or output.is_relative_to(source):
        parser.error('Choose a new absolute output folder outside the repo and source dataset.')
    if output.exists():
        parser.error('Output already exists; exports never overwrite files.')
    inputs = []
    names = set()
    for label in LABELS:
        folder = source / label
        if not folder.is_dir() or folder.is_symlink():
            parser.error(f'Missing or symlinked folder: {label}')
        for path in sorted(folder.rglob('*')):
            if path.is_symlink():
                parser.error('Symlinks are not allowed.')
            if not path.is_file() or path.name == '.DS_Store':
                continue
            relative = path.relative_to(source)
            if path.suffix.lower() == '.heic':
                relative = relative.with_suffix('.JPG')
            elif path.suffix.lower() not in {'.jpg', '.jpeg'}:
                parser.error('Expected HEIC or JPEG inputs only.')
            key = str(relative).casefold()
            if key in names:
                parser.error('Output filename collision; nothing was exported.')
            names.add(key)
            inputs.append((path, relative, digest(path)))
    output.mkdir()
    records = []
    for path, relative, original_hash in inputs:
        target = output / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        heic = path.suffix.lower() == '.heic'
        if heic:
            convert(path, target)
        else:
            shutil.copy2(path, target)
        records.append(dict(source=path.relative_to(source).as_posix(),
                            output=relative.as_posix(), converted=heic,
                            original_sha256=original_hash, output_sha256=digest(target)))
    if any(digest(path) != original_hash for path, _, original_hash in inputs):
        raise RuntimeError('Source checksum changed during export.')
    (output / 'conversion-log.json').write_text(json.dumps(records, indent=2))
    print(f'Converted {sum(r["converted"] for r in records)} HEIC files; '
          f'copied {sum(not r["converted"] for r in records)} JPEGs. '
          'All source checksums unchanged.')


if __name__ == '__main__':
    main()
