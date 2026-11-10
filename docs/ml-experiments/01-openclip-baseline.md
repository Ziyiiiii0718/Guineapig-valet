# Experiment 1: full-image OpenCLIP baseline

**Status: completed on development only.** Sources: private `runs/openclip-baseline-v1-development/{report.md,summary.json,predictions.json}`. Identity ranking on the nine-image cohort is also recorded in the cropped experiment's paired summary. See the [shared dataset methodology](README.md).

## Objective and hypothesis

Measure the current classifier unchanged before trying improvements. The baseline asks whether reference-image similarity distinguishes Potato from Annie and whether the existing decision rules return sensible single/multiple-pet predictions. Background/framing interference became a proposed explanation after reviewing the baseline; this run does not prove it.

## Dataset and implementation

The frozen dataset has 28 reference, 11 development and 18 held-out photos. Only 27 references are used: 14 Potato and 13 Annie. All 11 development images are evaluated: 5 Potato, 4 Annie and 2 Both, with no Neither examples. No test inference is performed. Integrity verification does read test files; see the access distinction in the index.

[The evaluator](../../scripts/offline-ml/evaluate.py) imports the existing Python `OpenClipEmbedder`; [the Node bridge](../../scripts/offline-ml/classify.mjs) executes the actual TypeScript classifier locally. No API, Supabase or website is involved.

## Model, preprocessing and fixed parameters

- `ViT-B-32-quickgelu`, pretrained `openai` weights; evaluation/inference mode, no fine-tuning.
- Upright exported images decoded as RGB. Bicubic, antialiased resize to shorter side 224; center crop 224×224; tensor conversion.
- CLIP mean `(0.48145466, 0.4578275, 0.40821073)` and standard deviation `(0.26862954, 0.26130258, 0.27577711)`.
- L2-normalized 512-dimensional embeddings; cosine similarity against references.
- A pet needs at least 2 references. Its score is the mean of its top 3 reference similarities. Candidate limit is 5 (only two pets are eligible here).
- Multiple-pet rule is checked first: at least two candidate scores ≥0.82 and within 0.04 of the best score produce Both.
- Otherwise, best score ≥0.86 and a gap strictly greater than 0.04 produces a single pet. Remaining cases produce Unknown.
- Configuration: `embedding-similarity-v1`, `provisional-2026-09-v1`. These numerical similarities are not probabilities.

Dependency versions are recorded in the [index](README.md). Production logic and thresholds were not altered.

## Actual development results

| Metric | Result | Denominator |
|---|---:|---|
| Final single-pet accuracy, primary | 2/9 (22.2%) | Potato + Annie |
| Identity ranking accuracy | 5/9 (55.6%) | Potato + Annie |
| False multi-pet rate | 7/9 (77.8%) | All non-Both development images |
| Single-pet uncertainty | 0/9 (0%) | Potato + Annie |
| Overall uncertainty | 1/11 (9.1%) | All development images |
| All-category accuracy, exploratory | 3/11 (27.3%) | Includes two Both images |

Final-decision confusion matrix: rows are actual labels; columns are predictions.

| Actual | Potato | Annie | Both | Neither | Unknown | Support |
|---|---:|---:|---:|---:|---:|---:|
| Potato | 2 | 0 | 3 | 0 | 0 | 5 |
| Annie | 0 | 0 | 4 | 0 | 0 | 4 |
| Both | 0 | 0 | 1 | 0 | 1 | 2 |
| Neither | 0 | 0 | 0 | 0 | 0 | 0 |

Neither's zero row means **no samples**, not successful rejection. Unknown is not treated as Neither.

Identity-ranking matrix, before thresholds, on the nine single-pet images:

| Actual | Ranked Potato | Ranked Annie |
|---|---:|---:|
| Potato | 5 | 0 |
| Annie | 4 | 0 |

## Failure analysis, conclusions and next step

The most frequent errors are Annie → Both (4), Potato → Both (3), and Both → Unknown (1). Potato ranks first on all nine single-pet images. Thus there are two distinct issues: Annie identity ranking fails, and close high scores produce false Both decisions. Changing the multi-pet threshold alone would not fix the ranking issue.

The sample is small and session-correlated; Both is exploratory, and Neither rejection cannot be measured. These observations guide a diagnostic experiment rather than establish future accuracy. Background interference is a hypothesis; reference composition and the representation itself may also matter.

The next controlled comparison was manual full-body cropping of both references and queries while retaining the same model and decision rules. [Experiment 2](02-cropped-openclip.md) records the completed outcome.

## Reproduction commands

Set `PIGGIE_DATASET_DIR` and install/cache dependencies as described in the index. The historical command was:

```sh
HF_HUB_OFFLINE=1 HF_HUB_DISABLE_TELEMETRY=1 OMP_NUM_THREADS=4 MKL_NUM_THREADS=4 \
  .venv/bin/python scripts/offline-ml/evaluate.py --run-name openclip-baseline-v1
```

The environment flags use cached weights, disable Hugging Face telemetry and limit CPU threads. Development is the default split. Output is the external `runs/openclip-baseline-v1-development/` folder. The existing run causes an overwrite refusal; an intentional repeat requires a different `--run-name`.

**Do not rerun this command under the current no-test-file-access restriction:** its integrity scanner opens all source images even though it performs no test inference. Use the saved baseline for subsequent comparisons. This documentation task did not execute it. Later crop/color scripts expect the original baseline run name and verify its manifest/configuration provenance; a differently named baseline repeat does not replace that dependency automatically.
