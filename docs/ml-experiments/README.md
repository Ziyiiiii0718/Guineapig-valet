# PiggieVault offline ML experiments

This is the centralized, portfolio-safe record of a local investigation into recognizing two guinea pigs, Potato and Annie. Four experiments have actually run on development data. **No held-out test evaluation has been completed.** These results are diagnostic measurements, not production accuracy claims.

The process separated representation quality (which pet ranks first) from decision quality (whether the classifier returns the correct single pet, Both, or Unknown). Cropping improved identity ranking without improving final decisions. Lab color features then corrected different mistakes from OpenCLIP, motivating a controlled supervised comparison. That comparison did not improve on the simpler Lab prototype; no production change followed.

## Experiment index and roadmap

| Stage | Status | Evidence / next action |
|---|---|---|
| Dataset preparation | Completed | External photos, reviewed sessions, duplicate checks, immutable group splits |
| [01: Full-image OpenCLIP](01-openclip-baseline.md) | Completed, development only | Establish unchanged production baseline |
| [02: Cropped OpenCLIP](02-cropped-openclip.md) | Completed, development only | Manual crops improve ranking, not final accuracy |
| [03: HSV and Lab features](03-color-features.md) | Completed, development only | Lab 8/9; HSV 5/9 identity rankings |
| [04: Lightweight supervised learning](04-supervised-learning.md) | Completed, development only | CLIP LR 8/9, Lab LR 5/9, combined LR 7/9; reference-group CV only |
| [05: Dataset coverage and collection plan](05-dataset-coverage-plan.md) | **Next milestone; model experiments paused** | Collect 40–48 prospective evaluation photos across at least 10 new session groups; keep frozen data unchanged |
| Final held-out evaluation | Not completed | Freeze method and selection rules first; then evaluate once and create `final-evaluation.md` |

No `final-evaluation.md` is included because there are no genuine held-out results to report. The first three experiment summaries were written from saved results; Experiment 4 was subsequently implemented and run as a new experiment.

## Dataset and leakage prevention

Photos live outside the repository, selected through `PIGGIE_DATASET_DIR`. Four categories mean Potato only, Annie only, both pets, and neither pet. The user reviewed category labels and orientation.

The initial collection contained 60 photos, including 51 HEIC files. Local conversion preserved originals and produced separate upright JPEG exports. The conversion script uses macOS `sips` to decode a temporary TIFF, then Pillow to apply orientation and save JPEG at quality 95 without chroma subsampling; capture EXIF and ICC profiles are retained where available. Existing JPEGs are copied. Conversion logs retain checksums; this is not a lossless archival replacement for HEIC/HDR originals.

At split preparation, one earlier export was absent and was not restored: 59 current files remained. Two images with unknown capture sessions were explicitly excluded, leaving **57 included photos**. Exact filenames and capture timestamps remain private.

A capture session groups related photos from the same shoot. Bursts, edits and related exports must remain together, including across labels. Two uncertain adjacent-day pairs were conservatively merged; other proposed day groups were accepted provisionally. All five Neither images belong to one session. Day-based grouping and duplicate detection reduce leakage risk but do not prove independence.

The private `session-decisions.json` maps relative photo paths to session IDs; `null` means excluded. `manifest.json` freezes those decisions, labels, image hashes, difference hashes, group IDs and splits. The splitter uses seed **42** and allocates approximately 60%/20%/20% of groups to reference/development/test, not exact photo proportions. It connects whole sessions transitively when SHA-256 hashes match or 64-bit grayscale difference hashes have Hamming distance ≤6. This near-duplicate heuristic can miss crops/rotations or merge unrelated images; human session review remains necessary. No new duplicate scan was performed for this documentation review.

| Frozen split | Potato | Annie | Both | Neither | Total | Session/duplicate groups |
|---|---:|---:|---:|---:|---:|---:|
| Reference (`train`) | 14 | 13 | 1 | 0 | 28 | 13 |
| Development | 5 | 4 | 2 | 0 | 11 | 5 |
| Held-out test, metadata only | 5 | 7 | 1 | 5 | 18 | 5 |

Only the **27 single-pet reference photos** build identity representations. The one Both reference image is unused. Experiments 2, 3 and 4 use the same **nine single-pet development photos** (5 Potato, 4 Annie); the full-image baseline additionally evaluated two Both images. Neither rejection is unmeasured on development. A single negative session cannot establish general negative-class performance.

“Train” here initially means reference examples: OpenCLIP weights were never trained or fine-tuned. Color prototypes were fitted only on reference photos. Crops inherit source split/session membership and are never split separately.

### Test-set access distinction

The initial dataset audit and manifest preparation decoded images for integrity and duplicate checks. The original baseline's `load_frozen()` also scans all source images during verification, including test files, but generates embeddings and predictions only for references and the requested development split. It records `test_inference_performed: false`. Therefore, it would be inaccurate to claim test files were never read throughout the entire project.

The later cropped and color workflows filter manifest metadata before opening images; they access only the 27 references and nine development photos. Experiment 4 also restricts feature extraction and verification to those same 36 approved images. No held-out predictions or test-driven tuning are recorded. Avoid rerunning the general scanner or baseline while the current no-test-image-access restriction is in effect.

## Comparable results

All percentages below use the same nine single-pet development samples.

| Method | Correct identity ranked first | Correct final single-pet decision | False Both | Unknown |
|---|---:|---:|---:|---:|
| Full-image OpenCLIP | 5/9 (55.6%) | 2/9 (22.2%) | 7/9 (77.8%) | 0/9 |
| Cropped OpenCLIP | 7/9 (77.8%) | 2/9 (22.2%) | 7/9 (77.8%) | 0/9 |
| Cropped HSV | 5/9 (55.6%) | Not evaluated with a calibrated decision policy | Not applicable | Not applicable |
| Cropped Lab | 8/9 (88.9%) | Not evaluated with a calibrated decision policy | Not applicable | Not applicable |
| CLIP logistic regression | 8/9 (88.9%) | Binary identity only; no detection policy | Not applicable | Not applicable |
| Lab logistic regression | 5/9 (55.6%) | Binary identity only; no detection policy | Not applicable | Not applicable |
| Combined logistic regression | 7/9 (77.8%) | Binary identity only; no detection policy | Not applicable | Not applicable |

- **Identity ranking accuracy:** correct pet has the highest CLIP score or lowest color distance, before any decision thresholds.
- **Final single-pet accuracy:** final output is exactly the correct pet; Both and Unknown are errors on single-pet images.
- **False multi-pet rate:** incorrect Both outputs divided by genuinely non-Both samples.
- **Uncertainty rate:** Unknown outputs divided by all samples in the stated cohort. Unknown is abstention, not confirmed Neither.

One image changes the nine-image score by 11.1 percentage points. Shared sessions reduce independent evidence. Repeated development comparisons also introduce model-selection bias. No confidence in future accuracy, lighting robustness or multi-pet detection follows from these percentages alone.

## Reproduction and private evidence

From the repository root, point Terminal at your own external prepared JPEG dataset. Replace the illustrative path; do not commit your actual path:

```sh
export PIGGIE_DATASET_DIR="/absolute/path/to/external/jpeg-dataset"
```

This environment variable selects files; it does not move or upload them. Existing runs refuse overwrites. Commands on each experiment page are for an intentional reproduction, not instructions to rerun completed experiments now. Exact reproduction requires the original private data, frozen manifest, annotations and compatible dependencies; the public repository intentionally does not contain these.

If setting up a new environment, use Python 3.12 or 3.13 and the project's Node/pnpm setup:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -e './ai-service[dev]'
pnpm install --frozen-lockfile
```

These install dependencies, not dataset files. The recorded OpenCLIP runs used torch **2.13.0**, open-clip-torch **2.32.0**, Pillow **12.3.0**; the color run recorded NumPy **2.5.2**. The package ranges alone do not guarantee these exact versions. OpenCLIP needs cached `ViT-B-32-quickgelu` / `openai` weights for the documented offline commands; offline mode fails if they are unavailable. No Supabase credentials are required.

The following paths are relative to the external dataset, not public repository files:

| Evidence | Private location |
|---|---|
| Dataset decisions and frozen split | `session-decisions.json`, `manifest.json` |
| Baseline | `runs/openclip-baseline-v1-development/` |
| Annotation workspace and verification | `experiments/cropped-openclip/` |
| Cropped run | `experiments/cropped-openclip/runs/cropped-v1/` |
| Color run | `experiments/color-features/runs/color-v1/` |
| Supervised run and raw feature cache | `experiments/supervised/runs/supervised-v1/`, `experiments/supervised/cache-v1/` |

Each completed run has `report.md`, `summary.json` and `predictions.json`. Cropped results retain the exact annotations and PNG crops; color results retain prototypes, hashes and contact sheets. All four runs identify the same manifest SHA-256 (nested under provenance in the supervised summary):

```text
18cf1e01a74aa08605f64805129ae53443b1ee2c3c67f03fc960cc2336b500df
```

These pages were reconciled against those saved reports, summaries, predictions, manifest counts and implementation. Per-photo examples below use anonymous descriptions rather than original filenames. Raw manifests, annotations, predictions, embedded-preview HTML, photos and contact sheets remain private. Keep them outside Git even if a filename is not covered by `.gitignore`.

Implementation: [dataset preparation](../../scripts/offline-ml/dataset.py), [audit](../../scripts/offline-ml/audit.py), [session worksheet](../../scripts/offline-ml/sessions.mjs), [conversion](../../scripts/offline-ml/convert_heic.py), [baseline](../../scripts/offline-ml/evaluate.py), [crop workflow](../../scripts/offline-ml/cropped.py), [color workflow](../../scripts/offline-ml/color.py). Earlier learning guides contain chronological setup and pre-run plans; this index records completed status.

## Interview takeaways and remaining work

This investigation demonstrates controlled comparisons, grouped data splitting, private local evaluation, explicit abstention metrics, separation of ranking from final decisions, provenance checks and cautious failure analysis. It does **not** demonstrate a deployed improvement or held-out accuracy.

Still missing: independent final evaluation; adequate independent Both/Neither coverage; calibrated confidence/rejection rules; controlled lighting/background/visibility ablations; and reliable generalization estimates. Camera-quality explanations remain hypotheses, not measured causal findings. Future reference cross-validation must preserve session groups and check both-pet coverage in every fold. Keep the test set reserved until the method is fixed.

## Current next steps

Follow the [coverage analysis, collection checklist and proposed final protocol](05-dataset-coverage-plan.md). Training/development coverage is 9 Potato, 11 Annie, 3 Both and 0 Neither session groups (label counts overlap). Lighting/viewpoint counts are unavailable because those attributes were not annotated. Collect new external data before further model searching. Freeze the existing Lab prototype and CLIP-only logistic regression for a paired final comparison; Both/Neither detection and uncertainty calibration remain separate, unimplemented tasks. No final evaluation is authorized or recorded yet.
