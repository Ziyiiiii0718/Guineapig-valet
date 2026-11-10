# Experiment 3: HSV and Lab color features

**Status: actually run, development only.** Sources: private `experiments/color-features/runs/color-v1/{report.md,summary.json,predictions.json,prototypes.json}`. This is a completed experiment, not a planned claim. [Implementation](../../scripts/offline-ml/color.py).

## Objective and hypothesis

Test whether explicit coat-color distributions help identify Potato and Annie, especially the Annie examples cropped OpenCLIP ranked as Potato. Compare HSV and Lab separately; do not combine their distances with CLIP similarities or apply CLIP thresholds to them.

## Dataset and preprocessing

The same frozen manifest and manual crops are reused: 27 references (14 Potato, 13 Annie) and nine development photos (5 Potato, 4 Annie). The full split remains 28 reference / 11 development / 18 test; unused Both/Neither samples are not evaluated here. The script filters metadata before file access; no held-out image files are opened.

All 36 source hashes and saved crop pixels were verified against the frozen annotations and agreed 5% margin/square-padding rule. Only synthetic gray padding is excluded from color features, using geometric source bounds rather than a color filter. All real background pixels remain. Native RGB pixels are treated as sRGB; no resizing, foreground segmentation, white-balance adjustment or ICC conversion is applied for color extraction.

## Fixed algorithms and parameters

| Choice | HSV | Lab |
|---|---|---|
| Color conversion | Pillow HSV, values scaled to [0,1] | Explicit sRGB linearization → XYZ → CIELAB, D65 white |
| Joint histogram | 16 hue × 4 saturation × 4 value bins (256 dimensions) | 8 × 8 × 8 bins (512 dimensions) |
| Ranges | [0,1] on each axis | L*: [0,100]; a*, b*: [-128,128] |
| Special handling | Hue shifted by 1/32 and wrapped; saturation below 0.25 uses hue zero | Values clipped to histogram ranges at boundaries |

Each image histogram is normalized to sum to one. Each pet's prototype is the arithmetic mean of its **reference-only** histograms, giving each reference image equal weight. No development image contributes to a prototype. Prediction is the closest pet prototype under Hellinger distance:

```text
H(p, q) = sqrt(sum((sqrt(p_i) - sqrt(q_i))^2)) / sqrt(2)
```

Smaller distance is better. Exact ties choose Potato by fixed label order. Features and distance rules were fixed before scoring; there was no threshold search. NumPy version recorded: 2.5.2. Hard histogram boundaries, lost spatial coat patterns and sensitivity to illumination remain limitations. Lab includes lightness and is not lighting-invariant.

These are forced two-identity rankings. They cannot detect Both, Neither or Unknown, and their distances are neither probabilities nor CLIP similarities. Final production decision accuracy, false-multi rate and uncertainty are not evaluated for these color models.

## Actual development results

| Method | Identity ranking accuracy | Potato correct | Annie correct |
|---|---:|---:|---:|
| Cropped OpenCLIP, saved comparison | 7/9 (77.8%) | 5/5 | 2/4 |
| HSV | 5/9 (55.6%) | 3/5 | 2/4 |
| Lab | 8/9 (88.9%) | 4/5 | 4/4 |

Ranking confusion matrices: rows are actual identities; columns are predicted identities.

| Method | Actual | Ranked Potato | Ranked Annie |
|---|---|---:|---:|
| Cropped OpenCLIP | Potato | 5 | 0 |
| Cropped OpenCLIP | Annie | 2 | 2 |
| HSV | Potato | 3 | 2 |
| HSV | Annie | 2 | 2 |
| Lab | Potato | 4 | 1 |
| Lab | Annie | 0 | 4 |

Lab corrects both Annie rankings that cropped OpenCLIP gets wrong, but loses one Potato close-up that CLIP ranks correctly. Net improvement: one image, or 11.1 percentage points. HSV rescues neither CLIP error and adds two Potato errors. The saved cropped OpenCLIP **final decision** accuracy remains 2/9; 8/9 Lab ranking is not an improvement to deployed classification accuracy.

## Failure analysis: observations versus hypotheses

The saved report contains a qualitative review of reference/development contact sheets. This documentation summarizes that existing review without reopening photos. Original filenames and pictures remain private.

| Case | Recorded visible observation | Hypothesis, not proven cause |
|---|---|---|
| Potato close-up, wrong for HSV/Lab but right for CLIP ranking | Head/neck dominate, much of body outside frame; face darker than upper fur, hay/cage background present | Missing brown body and uneven illumination may shift color proportions toward Annie |
| Frontal Potato, wrong for HSV only | White face/chest emphasized; hay, cage and turquoise bowl remain | Background and reduced brown-body visibility may affect HSV bins |
| First Annie correction by Lab | White muzzle, golden coat, tan hanging fabric, hay and foreground wire | Warm background/coat overlap may confuse representations; Lab's distance gap is only 0.0114 |
| Second Annie correction by Lab | Golden back/body and white muzzle with cage/hay | Lab may retain useful proportions lost in HSV, but no component ablation proves this |
| Pale-looking Annie, all rankings correct | Coat appears paler/grayer than other Annie views | Lighting, white balance, pose or coat visibility may explain appearance; correctness does not establish lighting invariance |
| Another face-dominated Potato, all rankings correct | Much of body hidden in a warm/dark shelter | Incomplete visibility alone is insufficient to explain failure |

The failed Lab Potato case has a small distance separation of about 0.0169. Neither that separation nor the Annie gap is calibrated confidence. Reference photos also vary in backgrounds, accessories and visible coat regions; one reference shows noticeable facial blur at contact-sheet scale. Thumbnail review limits fine sharpness assessment. No controlled blur, exposure, resolution or lighting experiment was performed, so none can be named as a demonstrated cause of an error.

## Conclusions and next steps

Lab is promising as complementary information, not a proven replacement. Lab and CLIP disagree on three photos: Lab is correct on two and CLIP on one. Selecting whichever was right after seeing the labels would be an oracle, not a tested combined system. HSV alone is not supported by this run.

Nine session-correlated development photos cannot establish reliable future accuracy; even 4/4 Annie is not a generalization estimate. Selecting Lab after comparing methods also introduces selection bias. Background remains within the crops and color histograms discard spatial patterns.

Historical next step, subsequently completed in [Experiment 4](04-supervised-learning.md): a small regularized supervised model combining frozen CLIP and Lab features, with reference-only feature scaling and hyperparameter selection through session-group cross-validation. Include CLIP-only and Lab-only supervised controls. If folds cannot contain both pets, collect independent sessions first. Keep the fixed development cohort diagnostic and test images reserved. Do not add raw color distances to similarities or borrow CLIP thresholds. A separately declared foreground-mask experiment could isolate background effects more directly. Both/Neither decision calibration needs its own data and evaluation.

## Reproduction commands

With the shared environment set and the original `cropped-v1` run available:

```sh
.venv/bin/python scripts/offline-ml/color.py
```

This verifies provenance and crops, builds reference-only prototypes, scores nine development images and writes `experiments/color-features/runs/color-v1/` externally. It does not load OpenCLIP again: it compares against saved cropped predictions. Results include the Markdown report, metrics, predictions, prototypes, source/crop hashes and private contact sheets.

An existing run refuses overwrites. For an intentional repeat into a new folder:

```sh
.venv/bin/python scripts/offline-ml/color.py --run-name color-reproduction-1
```

Do not repeatedly change parameters to chase these nine labels. The qualitative review in the original report was appended after human-readable image inspection; an automatic rerun generates metrics/contact sheets but does not reproduce that narrative automatically. No experiments were rerun for these documentation pages.
