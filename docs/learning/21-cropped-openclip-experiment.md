# Manual bounding boxes and cropped OpenCLIP

This local experiment compares manual full-body crops with the saved full-image
baseline. It reads only the 27 single-pet references and 9 single-pet development
photos selected from the frozen manifest. It does not call the general dataset
scanner, open held-out test images, or change the production classifier.

## What is ready

The annotation workspace is outside Git:

```text
/absolute/path/to/Piggy-ml-dataset-jpeg/experiments/cropped-openclip/
  annotate.html                 Local browser interface with 36 preview images
  experiment.json               Selected paths, dimensions, hashes and crop rule
  pipeline-verification.json    Synthetic-only check of the production embedder
  README.md
```

The HTML file contains personal image previews. Keep it private and outside Git.
It has no external scripts, images, analytics, upload endpoints, or network calls.
It works without starting a server. No box has been filled in or approved for you.

## Annotate on your Mac

1. Open Finder and press **Command–Shift–G** (Go to Folder). Paste:

   ```text
   /absolute/path/to/Piggy-ml-dataset-jpeg/experiments/cropped-openclip
   ```

2. Right-click `annotate.html`, choose **Open With → Safari** or **Google Chrome**.
3. Drag a rectangle tightly around the entire visible guinea pig, including ears
   and feet. Do not include another animal, surrounding objects or a large manual
   margin. The same rule applies to both reference and development images.
4. Check the square preview on the right. To adjust your box, drag again or type
   the four coordinates. They refer to **original image pixels**, not the scaled
   preview. `(x1,y1)` is the top-left; `(x2,y2)` is the exclusive bottom-right.
5. Click **Save box & next**. Previous/Next and the photo selector let you revisit
   any image. Green checkmarks show saved boxes. Clear box removes the current box.
6. Click **Export annotations JSON** after every few photos. Save writes to this
   tab's memory only; **export is what preserves progress on disk**. Check that the
   downloaded JSON exists before closing. Browsers may add `(1)`, `(2)`, etc. to
   repeated downloads; keep track of the newest file.
7. To resume, reopen the page and use **Resume from JSON** to select your latest
   export. Imported files must belong to this exact manifest and crop rule.
8. When the counter reaches **36 / 36**, export once more. Move that final file
   into the workspace above and rename it **`annotations.json`**. Keep the
   original photos as they are.

If an animal cannot be confidently boxed, leave it unannotated and ask for help;
do not guess or silently substitute a full-frame box. Evaluation requires all
36 valid boxes. Annotations contain coordinates and the frozen manifest identity,
not image bytes. They can also be edited manually in a text editor; use integer
pixel coordinates and preserve the other fields.

## The fixed crop rule

Draw the tight full-visible-body box, without adding a margin. The exporter:

1. Takes the longer box dimension and multiplies it by 1.10 (5% on each side).
2. Rounds that length up to an integer and makes a square centered on the box.
3. Copies the corresponding original-resolution pixels. If the square extends
   beyond the photo, the missing area is RGB `(128,128,128)` gray padding.
4. Saves the result as lossless PNG without resizing or stretching the animal.

The shorter dimension has extra context because the crop is square. This is
intentional: the existing OpenCLIP evaluation transform uses a center crop, so
feeding it a narrow rectangle could cut off part of the body. The 5% rule and
padding are the same for references and development images. The on-page preview
uses the smaller display image; the evaluator always crops original-resolution
pixels. The originals are not modified.

## Verified preprocessing and classifier reuse

The existing `OpenClipEmbedder` is imported directly. Its model is
`ViT-B-32-quickgelu`, with `openai` weights, in evaluation mode. The actual loaded
evaluation transform is:

- Bicubic resize to 224 on the shorter side, with antialiasing.
- Center crop to 224 × 224.
- RGB conversion and tensor conversion.
- CLIP normalization: mean `(0.48145466, 0.4578275, 0.40821073)`;
  standard deviation `(0.26862954, 0.26130258, 0.27577711)`.

The crop PNG goes through the same production byte decoder and `embed_bytes`
method: `encode_image` in inference mode followed by L2 normalization to a
512-dimensional vector. No additional custom image normalization is introduced.

A synthetic-only check compared that method with the explicit transform → encoder
→ normalization pipeline. The maximum embedding difference was **0**, the tensor
shape was `[1,3,224,224]`, and the vector norm was approximately 1. No personal
image was used for that check. The check is saved in `pipeline-verification.json`.

The classifier bridge loads the actual existing TypeScript classifier. It retains
the top-three mean, minimum two references, single threshold 0.86, multiple-pet
threshold 0.82, and ambiguity margin 0.04. Manifest hashes, production source
hashes, configuration, baseline prediction hashes and dependency versions are
checked before evaluation. A mismatch fails rather than silently changing the
experiment. The test set is excluded from image access before validation.

## Run the comparison after annotating

Open Terminal in the repository and run:

```bash
cd "/absolute/path/to/GuineaAI"
export PIGGIE_DATASET_DIR="/absolute/path/to/Piggy-ml-dataset-jpeg"
HF_HUB_OFFLINE=1 HF_HUB_DISABLE_TELEMETRY=1 OMP_NUM_THREADS=4 MKL_NUM_THREADS=4 \
  .venv/bin/python scripts/offline-ml/cropped.py evaluate \
  --annotations "$PIGGIE_DATASET_DIR/experiments/cropped-openclip/annotations.json" \
  --run-name cropped-v1
```

- `cd` selects the project containing the scripts and existing Python environment.
- `export` selects the external JPEG dataset; it moves nothing.
- Offline mode uses the already cached weights; thread settings limit CPU workers.
- `evaluate` validates all boxes, crops the 36 selected photos, embeds those crops,
  and evaluates only the same nine development samples as the paired baseline.
- `--annotations` points to your final exported JSON.
- `--run-name` creates a separate result folder and refuses to overwrite one.

Results will appear under:

```text
experiments/cropped-openclip/runs/cropped-v1/
  report.md          Paired metrics, confusion matrices and per-image outcomes
  summary.json       Metrics, pipeline/configuration and provenance
  predictions.json   Cropped candidate scores and decisions
  annotations.json   Exact annotation snapshot used in this run
  crops/             Lossless crops for references and development images
```

All of these files remain outside Git. Full-image results are read from the saved
baseline; the baseline is not recomputed or overwritten.

## How the comparison is scored

Both methods use exactly the same **nine single-pet development images**:

| Metric                    | Saved full-image baseline | Cropped            |
| ------------------------- | ------------------------: | ------------------ |
| Single-pet accuracy       |               2/9 (22.2%) | Pending your boxes |
| Identity ranking accuracy |               5/9 (55.6%) | Pending your boxes |
| False multi-pet rate      |               7/9 (77.8%) | Pending your boxes |
| Uncertainty rate          |                  0/9 (0%) | Pending your boxes |

Identity ranking asks whether the correct pet has the highest reference score,
before the decision rule. Single-pet accuracy requires the final correct pet
label; Both and Unknown count as errors. False multi-pet rate counts Both on these
single-pet images. The earlier overall uncertainty of 1/11 included two true Both
photos, so it is not the correct denominator for this paired comparison.

This is a **manual-crop-assisted** experiment, not an automatic detection system.
Cropping changes background and scale simultaneously. Improvement could support a
background/framing explanation but would not prove it. Nine correlated images are
not enough for a reliable generalization estimate. Do not inspect held-out test
images or adjust boxes to chase individual model scores. Keep the crop protocol
fixed and label later experiments separately.

## Development validation

```bash
python3 -m unittest discover -s scripts/offline-ml -p 'test_*.py'
node --test scripts/offline-ml/test_annotator.mjs
```

These use synthetic images to check crop geometry, exclusions, immutable sources,
complete annotations, JSON import/export, coordinate mapping, and paired report
generation. The browser automation tool cannot open local HTML files under its
URL policy; no visual browser QA is claimed. Open the page directly in your own
browser using the Finder instructions above.

## Experiment 2 observed development results

The real `cropped-v1` run used all 36 user-provided boxes. Final single-pet
classification stayed at 2/9 (22.2%); highest-ranked identity improved from 5/9
(55.6%) to 7/9 (77.8%). False Both remained 7/9, and Unknown remained 0/9 on the
paired single-pet cohort. Two final decisions improved and two worsened. Two Annie
rankings became correct but still produced Both because the scores were close.

This is limited evidence consistent with a background/framing effect, not proof
of background causality or better final classification. Cropping also changes
scale and padding. The next proposed measurement is a separate cropped HSV/Lab
color-feature baseline on the same train/development split, with training-only
feature fitting and ranking metrics first. OpenCLIP thresholds must not be reused
as if they were calibrated for color distances. More independent Both/Neither
sessions are needed to assess a different multi-pet decision policy.

The full per-image analysis is private in the external dataset at
`experiments/cropped-openclip/runs/cropped-v1/report.md`. All 36 saved crops were
checked against the agreed crop rule, and selected original hashes remained
unchanged. The test images were not opened or evaluated. The earlier pending
comparison table documents the pre-run plan; the results above are the observed
outcome.
