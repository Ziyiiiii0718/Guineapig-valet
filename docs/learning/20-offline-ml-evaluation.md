# Offline photo evaluation

This experiment reads local photos only. It reuses the existing Python OpenCLIP
embedder and executes the actual TypeScript classifier via a small local Node
bridge. It never calls FastAPI, Supabase, or the website. There is no training or
fine-tuning of OpenCLIP: “train” means the reference images used for similarity.
Production code and thresholds are unchanged.

## 1. Put photos in four folders, grouped by capture session

Keep all personal photos outside the repository. From the repository root, set
an environment variable (a named path your terminal passes to the scripts):

```bash
export PIGGIE_DATASET_DIR="/absolute/path/to/Piggy-ml-dataset"
```

Run this in each new terminal. It does not copy or move photos. All three scripts
read this variable; an explicit absolute path argument overrides it. They reject
paths inside GuineaAI. Do not add this path to the production environment.

Example layout (these are illustrative filenames, not included photos):

```text
Piggy-ml-dataset/
  potato/
    2026-11-03-morning-cage/
      IMG_001.jpg
  annie/
    2026-11-03-morning-cage/
      IMG_002.jpg
  both/
    2026-11-03-morning-cage/
      IMG_003.jpg
  neither/
    2026-11-03-morning-cage/
      IMG_004.jpg
```

- `potato`: Potato visible, Annie absent.
- `annie`: Annie visible, Potato absent.
- `both`: both visibly present.
- `neither`: neither present (empty cage, room, objects, or other animals).

Do not guess labels on images you cannot identify; leave them outside this dataset
until resolved. Use JPEG, PNG, or WebP. Export HEIC files as upright JPEGs first.
Keep originals in your personal library. Do not put images directly in a label
folder: the middle session folder is mandatory.

A **session** is one continuous shoot with substantially the same setting and
lighting. Use the SAME session name across all four label folders for that shoot.
Burst shots, video frames, exports, resized copies, and edits belong to the same
session as their original. If two shoots are near-identical or you are unsure,
group them under one session name. Session names are global, not per pet.

### Help identifying capture sessions

A local worksheet is available at `$PIGGIE_DATASET_DIR/session-review.md` for the
initial dataset. It lists all 60 photos using original EXIF capture clocks only:
58 have timestamps spanning 26 dates; `potato/IMG_2301.JPG` and
`both/IMG_3935.JPG` have no original capture time. No metadata was uploaded.

To print a fresh worksheet in the terminal:

```bash
node scripts/offline-ml/sessions.mjs
```

This command reads metadata (including HEIC metadata) without decoding or changing
photos. Its suggested day groups are **unconfirmed**, not split assignments.
Metadata support for HEIC does not mean the model can decode HEIC pixels.

1. Open the worksheet and view photos in Finder or Preview. Compare background,
   lighting, cage arrangement, clothes/hands, and adjacent burst frames.
2. Keep each day's photos together by default. Merge across dates if the photos
   are edits, related exports, or near-identical shoots. Clock values can be wrong
   and may lack timezone information. Do not infer separate sessions solely from
   a long time gap.
3. For the two UNASSIGNED photos, use your original Photos library's Info panel and
   visual context to match a known session. If you cannot establish the session,
   leave the photo out of this dataset until resolved.
4. Make the reviewed session folders inside the existing label folders, with the
   same name in every affected category. Move each photo into its reviewed folder;
   e.g. `potato/2026-10-07-cage/IMG_001.jpg`. Keep this organization external.
5. All five initial neither photos share one capture date. Keep that shoot together
   and collect additional negative images in independent sessions so development
   and test can both include negatives.

The scripts do not automatically approve these suggestions or move files.

Collect varied independent sessions across days, lighting, poses, and backgrounds.
Aim for at least 10 sessions, with each label represented across many sessions;
three independent groups is only the mechanical minimum. More burst frames do
not substitute for more independent sessions.

## 2. Install local dependencies

Use Python 3.12 or 3.13 and the project's Node/pnpm installation:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -e './ai-service[dev]'
pnpm install --frozen-lockfile
```

For dataset preparation alone, Pillow is sufficient. Full evaluation requires the
AI service dependencies above. Model weights may download on first use; photos
are processed locally and are not uploaded. Once weights are cached, inference
can run without network access. No `.env` file or service token is required.

## 3. Audit first, then freeze a split

```bash
.venv/bin/python scripts/offline-ml/audit.py
```

This read-only command counts files by category/extension, verifies supported
images decode, hashes all files for exact duplicates, and checks decoded images
for potential near-duplicates. It reports missing session-folder structure and
how many images were covered by the near-duplicate check. It does not move images,
create splits, load model weights, or upload anything.

For manual export, use Preview on your Mac to export upright JPEG copies locally.
For a batch export using the same native macOS image-decoding facilities:

```bash
python3 scripts/offline-ml/convert_heic.py --output /absolute/path/to/Piggy-ml-dataset-jpeg
```

Run this only with a **new** output directory. It uses `PIGGIE_DATASET_DIR` as the
source, never overwrites an existing output folder, and never changes originals.
`sips` first decodes HEIC to a temporary lossless TIFF; Pillow bakes in orientation
and writes a full-resolution JPEG at quality 95 with no chroma subsampling. This
avoids an intermediate JPEG recompression. Temporary TIFFs are removed after each
export. Existing JPEGs are copied byte-for-byte. Original checksums are verified
before/after and recorded alongside output checksums in `conversion-log.json`.
Capture EXIF and ICC color profiles are retained where available; conversion is
not an archival replacement for the originals (HEIC auxiliary/HDR data can differ).

The current dataset has already been exported. Do not rerun that conversion into
the same folder. Select the prepared JPEG dataset for subsequent audits:

```bash
export PIGGIE_DATASET_DIR="/absolute/path/to/Piggy-ml-dataset-jpeg"
python3 scripts/offline-ml/audit.py
```

The first command changes only the path used by scripts in this terminal. The
second reads all 60 JPEGs to verify decoding and check duplicate fingerprints.
Original HEICs remain in the original `Piggy-ml-dataset` directory. Do not mix
originals and converted copies in the evaluation set.

Before the following command, place each photo under `label/session/photo.jpg`.
Session names must be supplied by you; timestamps alone cannot prove independence.

The following command freezes the split and writes an external `manifest.json`:

```bash
.venv/bin/python scripts/offline-ml/dataset.py
```

This creates private `manifest.json` with image paths, labels, session IDs, content
hashes, duplicate fingerprints, and split membership. It prints label counts for
each split. Roughly 60% of independent groups become training references, 20%
development, and 20% test, using seed 42. These are group proportions, not exact
image proportions. Small or uneven datasets may have missing classes.

The splitter joins sessions connected by exact or near-duplicate photos before
splitting. Connections are transitive: if A resembles B and B resembles C, all
three stay together. Exact duplicates with contradictory labels cause an error.
Near-duplicate detection uses a 64-bit grayscale difference hash with Hamming
distance <= 6. This is a conservative heuristic, not a guarantee: it can merge
unrelated photos or miss crops/rotations. Correct session labeling and a manual
review of the manifest are essential. Pairwise checks are intended for a small
personal dataset, not millions of images.

Inspect the counts: training needs at least two Potato-only and two Annie-only
photos; preferably 5–15 varied references per pet. Both/neither training photos
are retained for future methods but are not OpenCLIP identity references. Ideally
every label appears in development and test. Missing classes are reported with
zero support and undefined metrics, not silently treated as successful results.

Do not repeatedly change the seed to seek a favorable score. The manifest cannot
be overwritten. Every evaluation verifies it against current photos and sessions;
new, removed, relabeled, or modified images require an explicitly new dataset
version. Archive the entire old dataset outside Git before preparing a new one.
Adding data may change group assignments, so do not compare runs across manifests
as if they used the same held-out photos.

## 4. Run the first baseline on development photos

Run from the repository root:

```bash
.venv/bin/python scripts/offline-ml/evaluate.py
```

Results go to:

```text
Piggy-ml-dataset/runs/openclip-baseline-development/report.md
Piggy-ml-dataset/runs/openclip-baseline-development/summary.json
Piggy-ml-dataset/runs/openclip-baseline-development/predictions.json
```

`report.md` is the readable Markdown evaluation report. False multi-pet rate means
incorrect `both` predictions divided by the number of genuinely non-both photos;
it is undefined if there are no non-both photos. Uncertain rate is Unknown
predictions divided by all evaluated photos. Accuracy includes abstentions as
errors. These metrics are calculated only after actual inference.

The summary includes accuracy, per-class precision/recall/support, a confusion
matrix (rows = true labels, columns = predictions), unknown rate, configuration,
model/weights identity, dependency versions, and dataset/source hashes. Predictions
include filenames and candidate scores for private error review. Embeddings stay
in memory. Existing runs cannot be overwritten; use `--run-name baseline-02` for
an intentional rerun. A failed run can leave an empty run directory; choose a new
name when retrying.

**Unknown is not proof of neither.** The current classifier can suggest Potato,
Annie, both, or abstain (`unknown`). It has no explicit neither detector. Therefore
this strict four-class report counts Unknown as an abstention/error even on
neither images. Neither recall will be zero for this baseline. Its confusion row
still shows how often unrelated images are incorrectly assigned to a pet. This
avoids claiming a successful negative detection merely because the model was
uncertain. Scores are similarities, not probabilities.

Development data is for inspecting mistakes and choosing future methods. Keep
test photos untouched until those choices are fixed. Then run once:

```bash
.venv/bin/python scripts/offline-ml/evaluate.py --split test --allow-test
```

The explicit flag is a reminder, not access control. Do not tune on test results.
With few sessions, scores are exploratory and do not establish reliable accuracy.

## 5. Compare cropped OpenCLIP and color later

Only the current full-frame baseline is implemented now. The frozen manifest,
label vocabulary, and `metrics()` function form the shared evaluation setup.
Future methods must use exactly the same source-image rows and split membership:

| Method                    | Reference/features                      | Rule                                          |
| ------------------------- | --------------------------------------- | --------------------------------------------- |
| Current OpenCLIP          | Train-only single-pet references        | Existing production thresholds                |
| Cropped OpenCLIP (future) | Crops derived from the same source rows | Crop both references and queries consistently |
| Color classifier (future) | HSV/Lab features fitted on train only   | Tune thresholds on development only           |

Store future crops/annotations beneath `Piggy-ml-dataset/artifacts/`, not in the
four source folders. Every crop inherits its source session and split; never split
crops independently. Report manual crops as oracle/manual assistance, not automatic
detection. Define handling of both/neither before evaluating. Color is particularly
sensitive to lighting and backgrounds. Record each method's parameters and use
separate run names; keep the original manifest hash with every report. Freeze all
choices before comparing on the held-out test split. Do not edit production
configuration as part of these experiments.

## 6. Privacy and local checks

Photos and generated files now stay in the external directory selected by
`PIGGIE_DATASET_DIR`; they are outside this repository's Git tree. The command-line
scripts reject a dataset inside GuineaAI. Do not copy personal exports into the
repository. `.venv/` remains ignored. Share only reviewed aggregate results.

Run the offline tests (synthetic images only; no model download):

```bash
.venv/bin/python -m unittest discover -s scripts/offline-ml -p 'test_*.py'
```

## Initial external dataset audit

The first read-only audit found 60 files: Potato 25 (22 HEIC, 3 JPEG), Annie 25
(25 HEIC), both 5 (4 HEIC, 1 JPEG), and neither 5 (5 JPEG). All 9 JPEGs decoded.
There were no byte-identical duplicate pairs across all 60 files and no potential
near-duplicate pairs among the 9 supported images. The 51 HEIC images were not
covered by perceptual comparison. All 60 files lacked session subfolders.
No split or inference was run, and no accuracy result is available. This snapshot
must be refreshed after conversion and session labeling.

## Confirmed sessions and the first frozen baseline

The reviewed JPEG dataset now uses `session-decisions.json` instead of moving
photos into new folders. Its `sessions` mapping contains every current relative
photo path and its approved session ID; `null` explicitly excludes a photo.
March 13–14 and September 1–2 were merged conservatively. The two undated photos
are excluded. The previous export's `annie/IMG_2752.JPG` was absent at preparation
time and was not restored. Thus 59 current files yield 57 included photos.

The manifest embeds these decisions, image hashes, duplicate fingerprints,
exclusions, group assignments, and seed 42. Every run verifies the frozen dataset.
Missing/extra paths or changed image bytes cause failure. It also refuses a split
without at least two single-pet references per pet and at least one example of each
pet in development and test. This coverage check does not tune the seed against
model predictions. The existing seed 42 satisfied these requirements directly.

To reproduce preparation on a **new version** of the dataset (not to overwrite the
existing manifest):

```bash
export PIGGIE_DATASET_DIR="/absolute/path/to/Piggy-ml-dataset-jpeg"
.venv/bin/python scripts/offline-ml/dataset.py --sessions "$PIGGIE_DATASET_DIR/session-decisions.json"
```

The first command selects the external dataset; the second writes a new manifest
and fails if one already exists. No photos are moved or relabeled.

The first baseline command is:

```bash
HF_HUB_OFFLINE=1 HF_HUB_DISABLE_TELEMETRY=1 OMP_NUM_THREADS=4 MKL_NUM_THREADS=4 \
  .venv/bin/python scripts/offline-ml/evaluate.py --run-name openclip-baseline-v1
```

This uses already-cached OpenCLIP weights, disables Hugging Face network lookup
and telemetry, limits CPU worker threads, and saves a new external run directory.
It fails rather than overwriting a previous run. `PIGGIE_DATASET_DIR` must be set
in the same terminal. It uses the unchanged Python embedder and actual TypeScript
classifier with the production configuration; no service or database is called.

Seed-42 coverage before inference:

| Split         | Potato | Annie | Both | Neither | Photos | Session groups |
| ------------- | -----: | ----: | ---: | ------: | -----: | -------------: |
| Train         |     14 |    13 |    1 |       0 |     28 |             13 |
| Development   |      5 |     4 |    2 |       0 |     11 |              5 |
| Held-out test |      5 |     7 |    1 |       5 |     18 |              5 |

Only the 27 single-pet train photos are references. The train Both image is unused.
All five Neither images remain in one held-out session; development has no Neither
examples, so negative rejection is not measured in the first baseline. Both is
exploratory. No test embeddings or predictions are generated in this run.

Primary accuracy counts an image as correct only when a Potato/Annie photo gets
that exact single-pet prediction. Unknown and Both are errors on single-pet
photos. The report also includes false multi-pet rate (false Both / non-Both
images), uncertainty (Unknown / evaluated images), per-class support, split counts,
and observed error counts. Small correlated sessions make these descriptive
measurements, not reliable estimates of future accuracy. Preserve test data for
one comparison after the experimental choices are fixed.

### First observed development results

The unchanged full-image baseline (`openclip-baseline-v1-development`) scored
2/9 single-pet images correctly (22.2%). Seven single-pet photos were predicted
Both (77.8% false multi-pet rate): all four Annie images and three of five Potato
images. One of two Both images was Unknown, giving overall uncertainty 1/11
(9.1%). Neither was not evaluated. Test inference was not performed.

Potato ranked above Annie on all nine single-pet photos, so replacing the Both
rule alone would not solve the Annie ranking problem. Background/framing effects
are hypotheses, not proven causes. The next proposed experiment is paired manual
full-body crops on the same single-pet references and development images, holding
thresholds and model fixed. This small sample guides diagnosis, not production
accuracy claims. The detailed report and candidate scores stay outside Git in the
external dataset's `runs/openclip-baseline-v1-development/` directory.

The [manual cropped OpenCLIP workflow](21-cropped-openclip-experiment.md) is now
prepared for the 27 reference and 9 single-pet development images. It uses the
existing frozen manifest and does not open test image files. Actual cropped
results require the user's 36 bounding boxes.
