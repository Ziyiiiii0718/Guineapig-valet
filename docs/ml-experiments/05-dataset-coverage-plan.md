# Next milestone: dataset coverage and a fair final comparison

Status: **collection and evaluation plan, not a new model experiment**. Read-only coverage audit of existing reference/development metadata and previously recorded visual observations. No photos were reopened, models retrained, predictions generated, or frozen splits changed. Held-out images remain untouched. This document is not `final-evaluation.md`.

## Verified reference/development coverage

Counts come from the frozen manifest, restricted to `train` and `development`. A session is the user's approved capture grouping; a group is the indivisible session/duplicate component used for splitting. Their counts coincide for each label here. Independence is provisional: metadata and conservative grouping reduce leakage risk but cannot prove that two shoots are independent.

| Label | Reference photos / groups | Development photos / groups | Combined photos / distinct groups |
|---|---:|---:|---:|
| Potato | 14 / 6 | 5 / 3 | 19 / 9 |
| Annie | 13 / 7 | 4 / 4 | 17 / 11 |
| Both | 1 / 1 | 2 / 2 | 3 / 3 |
| Neither | 0 / 0 | 0 / 0 | 0 / 0 |

There are 13 reference groups and 5 development groups, **18 total**. Label group counts cannot be summed: the same shoot can contain several labels. The 27 single-pet references occupy 12 groups; the unused Both reference occupies the remaining group. The nine single-pet development examples cover only 3 Potato groups and 4 Annie groups, with shared groups possible.

Neither coverage is zero in the data currently available for development. This is not a claim that the entire private collection lacks negative photos; reserved test membership is outside this analysis. Both has only three non-test photos across three groups, far too little to characterize multi-pet performance. More burst frames would not fix either session-coverage gap.

## What the existing evidence supports

The manifest records labels, sessions, groups, hashes and splits. Crop metadata adds image dimensions and boxes. There are **no structured lighting, viewpoint, background, visibility, coat-region or sharpness labels**. Therefore, condition-specific counts or failure rates cannot be reported honestly. The observations below come from the saved Experiment 3 visual review, not new inspection or test images.

| Dimension | Recorded observation | Collection priority / missing evidence |
|---|---|---|
| Lighting | Annie appears golden in some views and pale gray-white in another; a Potato face is darker than nearby fur; warm/dark shelter views occur | Photograph both pets under comparable diffuse daylight, normal room light and naturally dimmer conditions. Actual exposure/white-balance categories are not annotated; apparent color does not prove a lighting cause. |
| Viewing angle | Frontal, side/head close-up and back/body-dominant views occur | Balance front, left/right side, three-quarter and gently elevated views for both pets across independent shoots. No reliable angle counts exist. |
| Background | Hay/cages, bowls, hanging fabric, upholstery/clothing, accessories and a person occur | Include both pets in comparable settings so background does not identify the pet. Include simple and cluttered familiar backgrounds; existing per-pet background balance is unknown. |
| Visibility | Some images contain mostly head/neck, others expose much more body; fabric/wire can obscure regions | Collect clear full-visible-body examples plus naturally occurring partial/occluded views. A tight box cannot recover missing body. Do not infer visibility solely from box area. |
| Coat-color representation | Potato views vary in white face/chest versus brown back; Annie's visible golden/white proportions and apparent color vary | Include face-dominant and body-dominant views for each pet. Record the visible regions rather than assigning a pet a single fixed color. |
| Image quality | One reference shows facial blur at contact-sheet scale; fine sharpness assessment was limited | Record obvious blur/underexposure when present, retain realistic difficult examples under a declared policy, and avoid selecting only attractive shots. No measured quality-error relationship exists. |

The previously failed Potato close-up lacked much of the brown body; another face-dominated Potato example was correct. Thus incomplete visibility is a plausible contributor, not a sufficient explanation. Similar caution applies to lighting and background. Existing results do not establish which nuisance condition caused a failure.

## Practical collection target: 40 photos across 10 new shoots

Aim for **10 genuinely separate capture sessions**, collecting four labeled photos from each:

| Per session | Across 10 sessions | Purpose |
|---|---:|---|
| 1 Potato-only | 10 | Single-pet identity |
| 1 Annie-only | 10 | Single-pet identity |
| 1 Both | 10 | Presence/counting challenge |
| 1 Neither | 10 | Negative/rejection challenge |
| **4 total** | **40** | Balanced prospective collection |

An optional eight additional single-pet photos (four per pet, spread across sessions) brings the target to **48**, with 14 Potato, 14 Annie, 10 Both and 10 Neither. These extra photos do not add independent sessions. Prefer more genuinely new shoots over filling a burst quota. If only eight independent shoots are feasible, 32 photos is a useful first milestone, not the full target.

Spread shoots over multiple days and normal routines, with naturally different lighting/positions/background arrangements. A new filename, camera angle, outfit, or a few minutes' delay does not create independence. Moving from pet-only to Both or empty-cage photos in one sitting is still the same session. If shoots look closely related, merge their session IDs and collect another session to reach the target. Do not force pet interactions or difficult poses just to meet a quota; collect Both when they naturally share a frame.

Use this loose coverage schedule, rather than attempting every combination in 40 photos:

- Include diffuse daylight, ordinary room light and naturally dimmer scenes, with both pets represented in each broad condition across sessions.
- Alternate front, side/three-quarter and elevated views. Include clear full-body views as well as some natural close-ups or partial views.
- Include familiar simple bedding and cluttered cage/hay settings. Avoid making one background exclusive to one pet.
- For Both, vary naturally separated versus touching/partially occluded animals; retain identity certainty for ground-truth labels.
- For Neither, include familiar empty settings and ordinary objects/hay/fabric that resemble pet colors. Neither means neither target pet is present; tag other animals separately if included, because two-pet rejection is different from detecting any guinea pig.

### Beginner checklist for each shoot

- [ ] Assign one unique global session ID, shared across all labels from this shoot.
- [ ] Write down local date/time and a short description of setting/light; keep this private.
- [ ] Take clear labelable examples first, then natural difficult views if available.
- [ ] Choose the first technically valid photo satisfying each planned category, not whichever a model predicts correctly. Keep burst siblings together; do not count them as independent evidence.
- [ ] Confirm Potato / Annie / Both / Neither without consulting model predictions. Quarantine ambiguous ground-truth labels separately; do not silently call them Neither.
- [ ] Record lighting (daylight/room/mixed/dim/unknown), view (front/side/three-quarter/elevated/unknown), background, full/partial visibility, occlusion, visible coat regions, and obvious blur. These are human tags, not calibrated measurements.
- [ ] Keep originals, upright JPEG exports, session notes and annotations outside Git. Preserve EXIF where possible; retain conversion checksums.
- [ ] Keep edits, resized copies and alternate exports linked to the original session. Review duplicates within the new collection and against allowed reference/development data only.
- [ ] Record exclusions and reasons before model scoring; do not delete difficult samples after seeing results.

## Add data without contaminating the frozen dataset

1. **Do not add files to the existing frozen dataset folders.** Keep the old manifest, session decisions, 36 crops, models, prototypes and reports immutable. The existing validation scripts intentionally reject changed collections.
2. Create a separate external collection, for example `new-evaluation-collection/`, organized as `label/session/image.jpg`. A separate private JSON metadata file can hold the checklist tags. This proposal does not create files, move photos or assign new splits now.
3. Recommended role for these 40–48 photos: a **prospective evaluation-only collection** for the two already fitted candidates. Decide this before looking at model predictions. Do not add these photos to reference prototypes, scaler fitting, LR training, threshold tuning or hyperparameter selection.
4. The collection owner may inspect new images to establish ground truth, annotations and technical validity. Keep model developers from iteratively adapting choices to those images or labels, and keep predictions hidden until the protocol is locked. If photos are used to debug or tune a method, mark the affected entire sessions as development and collect replacement independent evaluation sessions later.
5. Duplicate checks are allowed within new data and against existing reference/development photos. Do not run the current general scanner or baseline evaluator: they open the reserved test files during validation. Any unresolved link to an old shoot should quarantine the whole new session. At a future authorized final audit, an independent custodian can resolve remaining overlap against the reserved set before scoring, without feedback for model tuning.
6. A later evaluator must explicitly support a separate collection and split-role manifest; the current scripts expect the fixed original 27/9 cohort. Do not point them at a new mixed directory or regenerate the old manifest to make them accept additions.

This plan adds a new versioned evaluation collection, not random image splits or modifications to the original split. If future training enrichment is desired instead, declare separate development/training sessions before viewing scores and collect another evaluation cohort. Do not reuse the same new sessions for both purposes.

## Proposed final comparison: freeze first, evaluate once

This is a proposal only; it does not authorize test access or execute evaluation.

1. Lock the **existing fitted candidates**: Experiment 3's reference-mean Lab histogram prototypes and Experiment 4's CLIP-only logistic regression, selected C=1, with its reference-fitted scaler/coefficients. Both used the same 27 references. No retraining, reference expansion, recalibration or model selection from final data.
2. Lock the original feature implementations, package versions, model weights, padding handling and original crop rule (5% margin, square expansion, gray padding). CLIP retains padding; Lab excludes only known synthetic padding, exactly as in their saved runs. Cache and artifact hashes identify the versions.
3. Before scoring, manually annotate tight visible-body boxes for all eligible single-pet evaluation photos using the same rule and without seeing outputs. Do not correct boxes to improve scores. Predeclare handling of unlabelable/uncroppable samples and publish excluded counts/reasons. Manual crops make this a manually assisted identity test, not end-to-end detection.
4. After explicit authorization, evaluate both methods on the **same eligible single-pet photos** in the original reserved set, and separately on the new prospective collection. Do not inspect the original reserved images now. Report original and prospective results separately as primary cohorts; any pooled figure is secondary and must not count related sessions as independent.
5. Report exact correct/total, per-pet recall, balanced accuracy, the 2×2 confusion matrix, and paired disagreements (Lab-only correct, LR-only correct, both correct, both wrong). Report photo accuracy and equal-session mean accuracy, with session counts. Any uncertainty intervals should resample entire groups, not treat burst images as independent; with few groups, label even these intervals as unstable. Do not promise statistically significant superiority.
6. Predeclare a conservative decision: if the difference is small or inconsistent across cohorts/pets, conclude that there is no demonstrated winner and prefer the simpler prototype as the benchmark. Do not use final errors to revise either candidate and then report a second score on the same test as independent.
7. Save an immutable local report and only then create `final-evaluation.md` with verified aggregate results. If final evidence motivates more work, collect a fresh independent test cohort for the revised method.

The original test has limited session coverage, and a 40-photo targeted collection is still small. A deliberately balanced challenge set tests specified conditions; its class proportions do not estimate ordinary upload frequency. More sessions and a later representative sample are needed for deployment claims.

## Both, Neither and Uncertain are separate questions

The two candidate identity methods assume **one known pet**. They force Potato or Annie and cannot establish animal count or presence. Do not run a full Both or empty image through them and interpret the forced identity as detection.

| Evaluation question | Ground truth / denominator | Suitable future measurements |
|---|---|---|
| Which single pet? | Confirmed Potato-only or Annie-only images | Binary identity accuracy, per-pet recall, 2×2 confusion matrix |
| Are both target pets present? | Both plus single-pet and negative images | Both recall = correct Both / true Both; Both precision = correct Both / all predicted Both; false-Both rate on non-Both, with per-class breakdown |
| Are neither of the target pets present? | Explicit Neither and positive images | Neither recall; false acceptance of any pet on Neither; false rejection on positive images |
| Should the system abstain? | Known true labels, plus separately flagged human-ambiguous examples | Coverage = accepted / evaluated; accuracy among accepted; errors among accepted; abstention rate by true class |

“Uncertain” describes a model action, not a fifth biological ground-truth class and not a synonym for Neither. Human-ambiguous labels belong in a separate review queue; they cannot support standard accuracy until resolved. A future rejection policy needs thresholds calibrated on **separate non-test development data**, using each method's own score scale. Do not borrow CLIP similarity thresholds for Lab distances, or treat LR probabilities as calibrated confidence. Report the trade-off between accepting fewer images and making fewer errors; an abstain-on-everything system has zero coverage, not perfect performance.

Both can optionally supply one manually annotated crop per animal for a *secondary conditional identity* test, but that assumes successful localization/counting and cannot count as Both detection. Keep the two crops in the same session and source-image group. Neither has no true animal box, so do not invent one to make the identity pipeline run.

For now, collect Both/Neither challenge examples and report them as **not supported by the two identity candidates**. A future detector/counting/rejection workflow must be specified and calibrated separately, then evaluated with its own untouched session groups. If any prospective examples are repurposed for calibration, retire those entire sessions from final evaluation.

## Next milestone and exit checklist

Model experimentation is paused. The next milestone is a reviewed, external **40–48-photo prospective collection from at least 10 genuinely independent new sessions**, targeting at least 10 examples of each category.

Completion means: session IDs and provenance recorded; labels checked; lighting/view/background/visibility tags recorded; duplicate/related-session review completed within the allowed scope; uncertain items quarantined; collection role fixed; and the two-candidate evaluation protocol agreed before scoring. Additional same-session images do not count toward the session target. No future outcome or accuracy is promised.
