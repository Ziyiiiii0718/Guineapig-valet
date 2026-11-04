# Experiment 3: color-only identity ranking

This local experiment asks whether coat-color distributions help distinguish the two known pets. It does not detect guinea pigs, count them, or replace the production classifier.

## Run on your Mac

Open Terminal in the GuineaAI repository, with the existing `.venv` installed, then run:

```sh
export PIGGIE_DATASET_DIR=/absolute/path/to/Piggy-ml-dataset-jpeg
.venv/bin/python scripts/offline-ml/color.py
```

The first command points to your external photos. The second verifies the frozen manifest and the completed `cropped-v1` run, reads only the 27 reference and nine development images, and writes a new `experiments/color-features/runs/color-v1` folder inside that external dataset. Open its `report.md` to see results. Original images and crops are never overwritten. An existing run folder causes the command to stop; to reproduce into a fresh folder, add `--run-name color-reproduction-1`. Do not adjust parameters repeatedly to improve these nine scores.

## Fixed method

Each saved crop is checked pixel-for-pixel against its frozen full-body box, 5% margin, square expansion, and gray padding. Color features exclude only the known synthetic padding by geometry; real background remains. Pixel colors are treated as sRGB, without white-balance adjustment. No test image files are opened, even for validation.

Two independent models use normalized joint histograms: HSV (16 hue × 4 saturation × 4 value bins) and D65 CIELAB (8 × 8 × 8 bins). Hue wraps around red and low-saturation pixels share one hue bin. Each pet's representation is the mean of its reference histograms, giving equal weight to each image. The closest representation by Hellinger distance wins. Smaller distance is better; it is not confidence or a CLIP similarity. Lab includes lightness, so it is not illumination-invariant. Both representations can respond to background and visible coat proportions.

No supervised threshold or feature tuning occurs. This intentionally simple first comparison has only two possible identities: Potato and Annie. It cannot provide meaningful Both, Neither, unknown, or false-multi rates. Compare its identity ranking to the saved cropped OpenCLIP ranking on exactly the same nine photos, not to OpenCLIP's thresholded final classification.

Reports, predictions, prototypes, crop hashes, script hash, and contact sheets remain outside Git. Contact sheets contain only reference or development images. They support a qualitative failure review, not causal proof that lighting or background caused a mistake. Multiple photos from a session are correlated; nine development examples cannot establish general reliability. Keep the held-out test sealed while designing later experiments.

## Checks

```sh
.venv/bin/python -m unittest discover -s scripts/offline-ml -p 'test_*.py'
```

Tests cover known sRGB-to-Lab values, histogram normalization and distances, and exclusion of development images from reference prototypes, alongside the existing crop and dataset tests.
