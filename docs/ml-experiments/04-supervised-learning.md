# Experiment 4: lightweight supervised identity learning

The goal is to compare logistic regression on frozen cropped OpenCLIP embeddings, Lab histograms, and their concatenation. **Completed:** all three models were selected using reference-only cross-validation and evaluated on the same nine development images. No held-out evaluation is authorized or performed.

## Objective and fixed protocol

Hypothesis: a small supervised classifier can exploit complementary embedding and coat-color information better than the existing top-three reference-similarity ranking or Lab mean-histogram prototype. The experiment compares feature families under the same learning algorithm; it does not change production classification or detect Both/Neither.

Use the original 27 single-pet references (14 Potato, 13 Annie) and nine development photos (5 Potato, 4 Annie). The references occupy **12 session/duplicate groups**; the full reference split's 13th group contains only the unused Both example. No frozen split changes. Each cross-validation fold holds out one entire reference group, retaining both pets in the remaining training data. Some validation groups contain only one pet; their accuracy is valid but cannot measure both-class recall independently.

Predeclare the following, before seeing Experiment 4 development scores:

- Three models: CLIP-only logistic regression, Lab-only logistic regression, and combined logistic regression. No optional SVM or feature-weight search.
- L2 regularization, `lbfgs` solver, `class_weight='balanced'`, intercept fitted, `max_iter=5000`, `tol=1e-8`, `random_state=42`. Class weights use each fold's training labels only; convergence warnings stop the run.
- Candidate inverse regularization strengths `C = [0.001, 0.01, 0.1, 1, 10]`. Smaller C means stronger regularization.
- Leave-one-group-out cross-validation on references only. Select highest mean validation-session accuracy, giving each session equal influence regardless of photo count. Ties within 1e-12 choose the smallest C. Also report pooled out-of-fold photo accuracy.
- Fit separate per-column `StandardScaler` instances for CLIP and Lab inside each fold. Each coordinate is centered and divided by its training standard deviation; zero-variance coordinates use unit scale. Validation data never determines scaler statistics.
- The combined model concatenates the two standardized 512-dimensional blocks into 1024 inputs. No addition of incompatible similarity scores, no tuned block weights, no PCA, feature selection or threshold search.
- Refit each selected pipeline on all 27 references, then score the nine development photos once. Logistic probabilities are uncalibrated; use the default binary decision boundary, not the production CLIP thresholds.

The selected CV score is a hyperparameter-selection score, not an unbiased nested-CV performance estimate. Development has already informed the choice to investigate Lab, so it is not an independent final test.

## Features and private cache

The script checks the frozen manifest, selected original hashes, crop hashes and annotation provenance before using the existing 36 crops. It never calls the general dataset scanner and never opens test photo files.

CLIP features use the unchanged production `OpenClipEmbedder`: `ViT-B-32-quickgelu` with `openai` weights, evaluation preprocessing and L2-normalized 512D output. Lab descriptors reuse Experiment 3's 8×8×8 normalized D65 CIELAB histogram, excluding only geometrically known gray padding. Real background remains. Feature extraction is fixed and has no fitted population statistics, so caching these raw descriptors before folds is safe. Fitted scalers are never shared between folds.

External `experiments/supervised/cache-v1/` contains provenance and one JSON feature record per approved image. Completed feature records are reused only with matching manifest/model/package/crop provenance; each record includes its original relative identity and crop checksum. The cache supports reuse after interruption, but incomplete experiment run folders must be retained and a new run name used. No original, annotation or prior result is overwritten.

Before comparing results, reconstructed top-three CLIP scores and Lab prototype distances must match saved experiments within 1e-5 and 1e-10 respectively. This is a feature-equivalence check, not re-tuning the baseline.

## Beginner-friendly reproduction

From the repository root, with the existing Python environment and cached OpenCLIP weights:

```sh
.venv/bin/python -m pip install -r scripts/offline-ml/requirements-supervised.txt
export PIGGIE_DATASET_DIR="/absolute/path/to/external/jpeg-dataset"
HF_HUB_OFFLINE=1 HF_HUB_DISABLE_TELEMETRY=1 OMP_NUM_THREADS=4 MKL_NUM_THREADS=4 \
  .venv/bin/python scripts/offline-ml/supervised.py --run-name supervised-v1
```

The first command installs experiment-only Python dependencies; it does not modify the production service's dependency specification. Replace the illustrative dataset path with your own, outside Git. The final command uses cached model weights, extracts or verifies cached features, performs reference-only model selection and saves the development comparison locally. The existing `cropped-v1` and `color-v1` outputs are prerequisites. An existing run directory causes an overwrite refusal; use a distinct name only for an intentional repeat.

Outputs under `experiments/supervised/runs/supervised-v1/`:

- `protocol.json`: fixed choices and explicit fold memberships/class counts, written before feature extraction or scoring.
- `cv-results.json`: every C candidate's fold/pooled scores and out-of-fold predictions, saved before development scoring.
- `summary.json`, `predictions.json`, `report.md`: metrics, provenance and per-image development results.
- `*-model.json`: final coefficients/intercepts and each feature block's scaler statistics/column order. Label order is Potato=0, Annie=1.

All artifacts contain private data or derived features and stay outside Git. Source: [supervised.py](../../scripts/offline-ml/supervised.py). Unit checks:

```sh
.venv/bin/python -m unittest discover -s scripts/offline-ml -p 'test_*.py'
```

These verify group separation, fold training-class coverage, scaler isolation and deterministic regularization tie-breaking alongside previous offline tests. Algorithm references: [scikit-learn 1.7 logistic regression](https://scikit-learn.org/1.7/modules/generated/sklearn.linear_model.LogisticRegression.html) and [leave-one-group-out](https://scikit-learn.org/1.7/modules/generated/sklearn.model_selection.LeaveOneGroupOut.html).

## Limitations

There are 512 or 1024 input coordinates for only 27 reference photos and 12 independent groups. L2 regularization reduces complexity but does not remove overfitting risk. Cross-validation sessions are small and often single-class. The nine development images are correlated and repeatedly reused across experiments; one changed prediction is 11.1 percentage points. No result here establishes population accuracy, calibrated confidence, causal lighting robustness, Both/Neither detection or improved production behavior. A genuine held-out evaluation is still pending.

## Actual results: supervised-v1

Verified against the saved `summary.json`, `cv-results.json` and `predictions.json`. No development-driven retuning followed these scores.

| Method | Selected C | Mean-session CV accuracy | Pooled CV accuracy | Development identity accuracy |
|---|---:|---:|---:|---:|
| CLIP logistic regression | 1 | 84.7% | 23/27 (85.2%) | 8/9 (88.9%) |
| Lab logistic regression | 0.01 | 70.1% | 18/27 (66.7%) | 5/9 (55.6%) |
| Combined logistic regression | 10 | 93.1% | 25/27 (92.6%) | 7/9 (77.8%) |
| Saved cropped CLIP ranking | — | — | — | 7/9 (77.8%) |
| Saved Lab prototype ranking | — | — | — | 8/9 (88.9%) |

CV figures above were used for selection; they are not independent performance estimates. Mean-session accuracy averages 12 validation-group accuracies; pooled accuracy weights each of the 27 photos equally.

### Declared C search: mean-session CV accuracy

| C | CLIP LR | Lab LR | Combined LR |
|---|---:|---:|---:|
| 0.001 | 71.5% | 59.0% | 66.0% |
| 0.01 | 74.3% | 70.1% | 82.6% |
| 0.1 | 74.3% | 70.1% | 86.8% |
| 1 | 84.7% | 67.4% | 88.9% |
| 10 | 84.7% | 69.4% | 93.1% |

The combined model chose the upper edge of the fixed grid (weakest regularization tested). The grid was not extended after observing development performance. CLIP and Lab ties used the smaller C as declared.

### Development confusion matrices

Rows are actual identity; columns are predicted identity. No Both/Neither/Unknown class is supported by these binary models.

| Model | Actual | Predicted Potato | Predicted Annie |
|---|---|---:|---:|
| CLIP LR | Potato | 5 | 0 |
| CLIP LR | Annie | 1 | 3 |
| Lab LR | Potato | 2 | 3 |
| Lab LR | Annie | 1 | 3 |
| Combined LR | Potato | 4 | 1 |
| Combined LR | Annie | 1 | 3 |
| Cropped CLIP ranking | Potato | 5 | 0 |
| Cropped CLIP ranking | Annie | 2 | 2 |
| Lab prototype | Potato | 4 | 1 |
| Lab prototype | Annie | 0 | 4 |

### Per-image comparison, anonymous development IDs

IDs follow the fixed within-class order in the private prediction file. P means Potato, A means Annie; filenames remain private.

| ID (true pet) | Cropped CLIP | Lab prototype | CLIP LR | Lab LR | Combined LR |
|---|---|---|---|---|---|
| P1 | P | P | P | A | P |
| P2 | P | P | P | P | P |
| P3 | P | P | P | A | P |
| P4 | P | P | P | P | P |
| P5 | P | A | P | A | A |
| A1 | A | A | A | A | A |
| A2 | P | A | P | A | P |
| A3 | P | A | A | P | A |
| A4 | A | A | A | A | A |

CLIP LR corrects A3 relative to the cropped CLIP ranking and keeps all Potato predictions correct. Combined LR also corrects A3 but loses P5, leaving no net gain. Lab LR adds P1, P3 and A3 errors to the prototype's P5 error. CLIP LR and the Lab prototype both score 8/9 but fail on different images; an after-the-fact oracle choosing the correct method is not an evaluated ensemble.

Prior visual review described P5 as a head/neck close-up missing much of the brown body, and A2 as having fabric/hay/cage context around the animal. These are inherited observations; no new image-quality measurement or causal background/lighting experiment was conducted.

## Conclusion and next step

**Combining features did not improve development accuracy.** CLIP-only supervised learning improved on the CLIP similarity baseline by one image, but only tied the simpler Lab prototype. The combined model's strong selected CV score did not carry through to this tiny development set. Overfitting, session differences and sampling variability are plausible explanations, not isolated causes. Lab standardization/logistic classification also uses a different geometry from Hellinger prototype matching; its lower score does not disprove supervised color learning generally.

Retain the Lab prototype as the simplest competitive benchmark and CLIP LR as a candidate for further validation. Do not replace production logic or adopt the combined model on this evidence. Collect more independent sessions before further method searching; choose any next feature weighting, dimensionality reduction or classifier using reference-group validation. Keep held-out images sealed until the final method and evaluation plan are fixed. No final-evaluation document is warranted yet.

Feature-equivalence checks reproduced prior CLIP scores within 5.55e-16 and Lab distances exactly. All 27 offline tests, 3 annotation logic tests and 192 application tests passed, as did lint, type checking and the local production build. No convergence warnings occurred. Recorded additional packages: scikit-learn 1.7.2, SciPy 1.18.1, joblib 1.6.0 and threadpoolctl 3.7.0; CLIP/Pillow/NumPy versions remain as in the earlier experiments.
