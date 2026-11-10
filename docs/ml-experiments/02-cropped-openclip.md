# Experiment 2: manually cropped OpenCLIP

**Status: completed on development only.** Source: private `experiments/cropped-openclip/runs/cropped-v1/` report, summary, predictions and annotation snapshot, plus `pipeline-verification.json`. See [Experiment 1](01-openclip-baseline.md) for the unchanged model and decision parameters.

## Objective and hypothesis

Test whether concentrating the image on the animal improves identity recognition. Reduced background interference is the hypothesis; cropping also changes scale, centering and padding, so this is not a background-only causal test.

## Dataset and annotation workflow

Use the frozen split: 27 reference images (14 Potato, 13 Annie) and the same nine single-pet development images (5 Potato, 4 Annie). The original full dataset has 28/11/18 reference/development/test photos, but Both/Neither are outside this experiment. All 36 manually supplied boxes were valid. No test image files were opened.

The local [annotation interface](../../scripts/offline-ml/annotator.html) is generated with only these 36 previews. On macOS, open the external workspace's `annotate.html` in Safari or Chrome. Draw a tight rectangle around the entire visible animal, including ears and feet; do not add a manual margin. Alternatively enter integer `(x1, y1, x2, y2)` coordinates in original-image pixels, with an exclusive bottom-right corner. Save each box, then **Export annotations JSON** to preserve it on disk. Tab memory is not a saved file. Resume by importing the JSON; save the final export as `annotations.json` in the external annotation workspace.

Do not adjust boxes in response to model scores. A crop cannot recover body regions outside the original image. The experiment is manually assisted, not an automatic animal detector.

## Crop and embedding parameters

1. Multiply the longer bounding-box dimension by 1.10: 5% extra on each side of that dimension.
2. Round the length up to an integer and center a square on the box, flooring the top/left coordinates. The shorter dimension gains additional context to become square.
3. Copy original-resolution pixels. Fill any area beyond source-image boundaries with RGB `(128,128,128)`.
4. Save as lossless PNG, without stretching or resizing during crop creation. Originals remain unchanged.

Fifteen of 36 crops required padding. Square inputs avoid losing additional animal regions to the model's later center crop. Both reference and development images use exactly the same rule.

The existing OpenCLIP RGB decoder, 224×224 evaluation transform, CLIP normalization, 512-dimensional normalized embeddings, top-three similarity aggregation and thresholds are unchanged from Experiment 1. Model: `ViT-B-32-quickgelu` / `openai`. A synthetic pipeline check found maximum embedding difference **0** between `embed_bytes` and the explicit transform → encoder → normalization path; input tensor shape `[1,3,224,224]`, vector norm approximately 1, evaluation mode enabled. This verifies pipeline agreement, not model accuracy.

The evaluator verifies manifest identity, source/configuration hashes, dependency versions and baseline records. All 36 saved crop images were checked against the crop rule and source hashes. The comparison reads the saved baseline rather than rerunning it.

## Actual paired development results

All metrics use exactly the same nine single-pet images, excluding the baseline's two true Both images.

| Metric | Full image | Cropped |
|---|---:|---:|
| Final single-pet accuracy | 2/9 (22.2%) | 2/9 (22.2%) |
| Identity ranking accuracy | 5/9 (55.6%) | 7/9 (77.8%) |
| False multi-pet rate | 7/9 (77.8%) | 7/9 (77.8%) |
| Uncertainty rate | 0/9 (0%) | 0/9 (0%) |

Final-decision confusion matrices are identical in aggregate, although individual decisions changed:

| Method | Actual | Potato | Annie | Both | Unknown |
|---|---|---:|---:|---:|---:|
| Full image | Potato | 2 | 0 | 3 | 0 |
| Full image | Annie | 0 | 0 | 4 | 0 |
| Cropped | Potato | 2 | 0 | 3 | 0 |
| Cropped | Annie | 0 | 0 | 4 | 0 |

Identity-ranking matrices:

| Method | Actual | Ranked Potato | Ranked Annie |
|---|---|---:|---:|
| Full image | Potato | 5 | 0 |
| Full image | Annie | 4 | 0 |
| Cropped | Potato | 5 | 0 |
| Cropped | Annie | 2 | 2 |

## Failure cases and interpretation

Two Potato final decisions improved from Both to Potato, with score gaps approximately 0.0426 and 0.0413, only just above the unchanged 0.04 margin. Two different Potato decisions worsened from Potato to Both, with gaps approximately 0.0316 and 0.0320. Potato stayed highest ranked in all five cases.

Two Annie rankings improved from Potato to Annie, but their final outputs stayed Both: score gaps approximately 0.0037 and 0.0144, with both candidates above 0.82. No ranking regressed. The remaining two Annie images still ranked Potato first.

The ranking improvement is consistent with a background/framing effect, not proof of background causality. Final classification did not improve. High similar scores for two identities do not reliably establish that two animals are present; the unchanged multi-pet rule remains a separate problem. Manual localization, nine correlated development samples, and missing true Both/Neither coverage limit conclusions.

The next experiment was [independent HSV/Lab features](03-color-features.md), fitted only on references and compared by identity ranking. No production changes or threshold tuning were justified by this run.

## Reproduction commands

Use the shared environment setup in the index. For a **fresh annotation workspace only**, run:

```sh
.venv/bin/python scripts/offline-ml/cropped.py prepare
```

This writes `experiments/cropped-openclip/` externally and refuses an existing workspace. It requires the saved baseline and frozen manifest. The current workspace and annotations already exist; do not recreate them.

The recorded evaluation command was:

```sh
HF_HUB_OFFLINE=1 HF_HUB_DISABLE_TELEMETRY=1 OMP_NUM_THREADS=4 MKL_NUM_THREADS=4 \
  .venv/bin/python scripts/offline-ml/cropped.py evaluate \
  --annotations "$PIGGIE_DATASET_DIR/experiments/cropped-openclip/annotations.json" \
  --run-name cropped-v1
```

It validates boxes, generates crops, embeds references and development photos, and saves the paired report under `experiments/cropped-openclip/runs/cropped-v1/`. The existing run refuses overwrites; use a new run name only for an intentional repeat. Keep the original `cropped-v1` artifacts because the color script explicitly reads them. Offline model flags have the same meaning as in Experiment 1. Neither preparation nor inference was rerun for documentation.
