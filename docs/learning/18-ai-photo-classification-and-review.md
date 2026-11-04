# AI Photo Classification and Human Review

Phase 7 turns the Phase 6 image-embedding foundation into reviewable pet suggestions. It deliberately does not treat machine output as truth: an authenticated user can confirm, correct, label multiple pets, choose Unknown, or skip.

## 1. Embedding-based classification

An uploaded private photo and each ready reference photo pass through the same OpenCLIP image encoder. The result is a normalized 512-value vector. Classification compares the new photo vector with reference vectors belonging to the current user's pets. No pet name is built into the model or code; pet IDs come from PostgreSQL.

## 2. Pet-level aggregation

One reference can be unusual or poorly framed, so PiggieVault does not let a single nearest image decide. It calculates cosine similarity to each usable reference, sorts each pet's values, and averages that pet's best three values (or all values when fewer than three are available). This **top-k mean** is deterministic, understandable, and less sensitive to one bad reference than a full mean while being less fragile than nearest-neighbor alone.

Each pet needs at least two ready, model-compatible references. The UI still recommends a richer 5–15 image set. A pet with one reference is excluded rather than presented as confidently recognizable.

## 3. Cosine similarity

Cosine similarity compares vector direction. OpenCLIP results are L2-normalized, so the dot product equals cosine similarity. The classifier rejects empty, non-finite, non-normalized, or dimension-mismatched vectors. A high similarity means the model placed two images near each other in its visual feature space; it does not prove identity.

## 4. Similarity is not probability

A cosine value such as `0.86` is not “86% confidence.” It has not been calibrated into a probability and depends on model, weights, preprocessing, references, and image conditions. Normal UI therefore says “Best match,” “Needs review,” or “Unknown.” Candidate scores are retained privately for audit and evaluation but are not marketed as probabilities.

## 5. Threshold calibration

Classifier settings live in `lib/ai/classification-config.json` and have an explicit configuration version. A local ignored evaluation file can record manually known pet IDs and candidate scores, then:

```bash
pnpm calibrate:ai -- .local/phase7-evaluation.json
```

The script reports test-image count, same-pet and different-pet score ranges, nearest-pet margins, and ambiguous-case count. It reads no images or embeddings and prints no private vectors. The evaluation file stays under ignored `.local/`.

Calibration should include clear images, difficult angles, multi-pet images, and unrelated images. Thresholds should be changed only with a new configuration version and a documented aggregate result. The current database has only one ready reference total and no labeled evaluation set, so statistically reliable calibration is impossible. Current thresholds are conservative, explicit, and provisional—not production claims.

## 6. Current provisional configuration

- Minimum ready references per pet: 2
- Pet score aggregation: mean of top 3 reference similarities
- Single-pet threshold: 0.86
- Multi-pet candidate threshold: 0.82
- Ambiguity/multi-pet margin: 0.04
- Persisted candidates: best 5 pet scores
- Classifier version: `embedding-similarity-v1`
- Configuration version: `provisional-2026-09-v1`

These safety-first defaults prefer Unknown and human review over a weak assignment. They must be revisited after a larger, manually labeled local evaluation.

## 7. Unknown classification

Unknown is used when the best pet is below the single-pet threshold, when the nearest alternatives are ambiguous without meeting the multiple-pet heuristic, or when an image is unlike known references. `insufficient_references` is separate: it means the system did not have enough evidence to run classification at all. Choosing Unknown in review is a valid final human label, not an error.

## 8. Multi-pet heuristic and its limitation

If at least two pet scores pass the multi-pet threshold and sit within the configured margin of the best score, PiggieVault suggests those pets together. This is only a global-image embedding heuristic. It does not detect separate bodies, count animals, localize them, or draw boxes. Similar-looking pets or a visually ambiguous single-pet image can also create close scores, which is why multiple suggestions always remain reviewable.

## 9. Human-in-the-loop systems

The review queue makes uncertainty visible and keeps the user in control. AI reduces repetitive work by proposing labels, while a human supplies application truth. This is safer than silently attaching a pet label, especially with a small private dataset and no probability calibration.

## 10. Prediction versus ground truth

`suggested_pet_ids` and candidate score arrays preserve what AI said. `confirmed_pet_ids` and `confirmed_unknown` preserve what the user decided. `review_status` states whether the suggestion is pending, confirmed, corrected, or skipped. Correcting the AI never overwrites its original suggestion, so later evaluation can compare prediction with truth.

Multiple pets are represented as multiple pet IDs, not a fake “Both” pet. Unknown is an explicit boolean with no confirmed pet IDs. This remains valid for any number of pets.

## 11. Review Queue architecture

`/review` is authenticated and owner-scoped. URL query parameters select Needs review, Confirmed, Corrected, Failed, or All. Each item obtains a short-lived signed thumbnail only after its owned photo row is read. It shows the editable display name, friendly suggestion wording, pet checkboxes, Unknown, Confirm, Save review, and Skip. Native checkboxes and semantic fieldsets keep selection keyboard-accessible.

The photo detail page has an always-available Pet labels editor, followed by the separate AI lifecycle. Gallery cards remain photo-first: a final human label is shown definitively, while an unreviewed result says only “Needs review.” Dashboard contains one lightweight pending-review count and link.

## 12. Why corrections are preserved

Before review, retries may refresh machine-processing fields, candidate scores, and the current AI suggestion. After confirmation/correction, retry preserves an existing reviewed suggestion snapshot and every confirmed field; it updates only processing/failure state. If a manual label predates any AI result, the first successful analysis may save its independent suggestion without touching the manual label. A failed retry can therefore coexist with the original AI audit trail and earlier human correction.

### Manual labeling without AI (migration 0012)

Owners can assign one or multiple pets, or explicitly select Unknown, before analysis, during processing, after an AI failure, or with insufficient references. The photo detail page and review queue share the same native-checkbox editor. Removing labels is different from Unknown: removal leaves the photo unlabeled and eligible for review again; Unknown records a human decision that no known pet applies. No pets or reference embeddings are required to select Unknown.

The `set_photo_labels` SECURITY INVOKER RPC authenticates with `auth.uid()`, locks the owned photo and prediction, validates and locks selected owned pets, and saves human fields plus the photo summary in one transaction. It creates the prediction container if necessary, with pending AI state and no analysis timestamp; the UI describes that as Not analyzed yet. It never writes candidate scores, suggestions, model versions, thresholds, or embeddings. Existing pet galleries already select human-confirmed IDs independently of processing status, so manually labeled photos appear there even when AI is unavailable. Unknown and cleared photos do not appear as a known pet.

`labels_revision` tracks changes to confirmed IDs, Unknown, confirmation and review state, including pet-deletion cleanup. A form submits the revision it loaded. A conflicting newer edit returns an explicit refresh message instead of silently overwriting it. Repeating the same desired state is a safe no-op, including after a lost response. Confirm suggestion submits the suggestion actually shown and rejects a different current suggestion. AI-only progress does not invalidate the user's draft revision.

AI orchestration already omits human fields from its writes. Migration 0012 also prevents delayed AI summary updates from replacing the current manual photo status or restoring a cleared status. PostgreSQL integration tests exercise both lock orders for concurrent AI/manual updates. Conflicting database transactions may still abort and require retry; failures roll back the label and summary together. No AI inference is run by a label action, and labeling never promotes a photo to an embedding reference.

Deploy in order: existing migrations through **0010 → 0011 → 0012**, then the updated application. These migrations are local and have not been applied to production. Missing migration/schema errors fail safely; the detail editor asks for a refresh if label data cannot be loaded. The local integration runner `tests/database/run-manual-photo-labels.py` uses the disposable container from the deletion tests and first runs their regression suites. No production endpoint is accepted. Supabase HTTP and signed-image behavior still need staging smoke testing.

## 13. Why corrections do not become references

A label is not automatically a high-quality reference. The image might contain several pets, be blurry, or be incorrectly clicked. Automatically feeding it back would amplify mistakes. Reference selection remains an explicit pet-management action.

## 14. Model and configuration versioning

Every successful prediction stores the embedding model, weights version, dimension, classifier strategy/version, and threshold configuration version. A score is only interpretable alongside that metadata. Ready references from a different model, version, or dimension are excluded rather than mixed.

## 15. Idempotent retries and races

The database allows one prediction row per photo. Analyze and Retry use the transactional start RPC to create or reuse that row and assign a fresh processing token. The finish RPC must match that token and commits prediction and photo status together, so an older overlapping attempt cannot overwrite a newer run. Repeated reviews update the same row instead of creating duplicates. Owner-scoped unique and foreign-key constraints backstop application logic.

Reference rows are refreshed after query-image inference. If references disappear during work and no pet remains sufficient, processing ends honestly as insufficient rather than fabricating a result. Historical predictions retain candidate counts and configuration metadata; adding or removing references does not automatically reprocess the whole library.

## 16. Failure recovery

The Storage upload and `photos` insert complete before classification is triggered. If FastAPI is down, the image is still visible in Gallery and the prediction becomes failed with a sanitized category. Retry securely reuses the original owned Storage object. A failed job never deletes or changes the image and never remains permanently in `processing` after a handled error. If the server process itself is interrupted, a processing attempt older than five minutes is shown as interrupted with a Retry action instead of leaving the user permanently stuck.

## 17. Privacy and security

Next.js authenticates the user, reads only an owned photo row, validates its owner-prefixed Storage path, and downloads with the user's Supabase session. It sends bytes and MIME type to server-authenticated FastAPI. The browser receives neither the AI token nor vectors. FastAPI has no Supabase credentials and writes no image files.

Prediction RLS checks `auth.uid()`. Composite photo/owner foreign keys stop cross-owner photo rows, and prediction write policies verify every candidate, suggestion, and confirmed pet ID belongs to the same authenticated owner. Application checks provide defense in depth. Logs contain sanitized categories only—never image bytes, signed URLs, vectors, cookies, tokens, or credentials.

## 18. Evaluation with small datasets

Four photos, one ready reference, and no held-out labeled examples cannot establish performance or statistically meaningful thresholds. The honest response is to expose a calibration workflow, mark defaults provisional, require two references, and prefer Unknown. Accuracy should be reported only after a larger held-out set is reviewed; reference photos used to construct a pet representation must not also be counted as independent test wins.

## 19. Precision, recall, false positives, and Unknown

Higher thresholds usually improve precision: accepted labels are more likely correct. They usually reduce recall: more real matches become Unknown. For a private organizer, a false positive silently attaches the wrong pet, while Unknown asks for a quick human decision. Phase 7 intentionally favors precision and Unknown until local evidence supports a different trade-off.

## 20. Interview questions and answers

**Why top-k mean instead of one nearest reference?** One image can be an outlier. Averaging the best few retains representative matches without letting a single accidental similarity decide.

**Why not call cosine similarity confidence?** It is an uncalibrated geometric score, not an estimated probability of correctness.

**How do you support more than two pets?** Pet IDs and scores are dynamic arrays populated from owned database rows. Multiple labels are a set of IDs, never a hard-coded “Both.”

**How do you preserve the AI audit trail?** Suggested IDs and candidate scores are separate columns from confirmed IDs and Unknown truth. Review updates only the human fields.

**How does retry avoid overwriting a correction?** The retry upsert omits all confirmed/review fields, and a processing token prevents stale AI attempts from winning a race.

**What happens when the model is unavailable?** Upload remains successful, the prediction records a safe failed state, the photo stays visible, and Retry is offered.

**How is cross-user labeling prevented?** Server reads scope photo, prediction, and pets by the authenticated user. PostgreSQL RLS repeats those checks for the photo and every pet-ID array.

**Why not use pgvector search now?** A user has a small number of pets and references, so an owner-scoped in-memory comparison is simpler and fast. A larger corpus could justify pgvector indexes and nearest-neighbor queries later.

**Why is multi-pet output only heuristic?** A single global embedding describes the whole frame. It provides no object locations or guaranteed animal count.

## 21. The pipeline in 60 seconds

After a private upload is safely stored, Next.js creates or reuses one owner-scoped prediction row. It loads only ready references compatible with the current 512-dimensional OpenCLIP model and requires at least two for a pet. Next.js downloads the authorized private image and sends its bytes to the existing bearer-protected FastAPI `/embed` endpoint. A deterministic server module compares the normalized query vector with references, averages each pet's top three similarities, and applies versioned conservative thresholds for one pet, multiple plausible pets, or Unknown. Candidate scores and the original suggestion are stored separately from final human labels. The authenticated review queue lets the owner confirm, correct, choose several pets, select Unknown, or skip. RLS, composite ownership constraints, private Storage, sanitized errors, and idempotent retries keep failures and cross-user access contained.

## 22. Vocabulary

- **Candidate:** a pet considered by the classifier.
- **Top-k mean:** average of the highest `k` reference similarities.
- **Threshold:** configured score boundary for accepting a type of suggestion.
- **Margin:** difference between the first and second ranked candidates.
- **Calibration:** empirical selection/evaluation of decision thresholds.
- **Probability calibration:** mapping a raw score to a statistically meaningful probability; not implemented here.
- **Unknown:** explicit outcome when evidence is weak or no pet is selected.
- **Ground truth:** label confirmed by the user for application purposes.
- **Human in the loop:** workflow where a person approves or corrects model output.
- **Processing token:** per-attempt identifier that blocks stale overlapping writes.
- **Idempotent:** safe to repeat without creating duplicate active predictions.
- **Reference snapshot:** reference counts and versions used for a past decision.
- **False positive:** incorrect accepted pet label.
- **Recall:** proportion of real matches the system accepts.
- **Precision:** proportion of accepted labels that are correct.

## 23. Review queue pagination and direct lookup

The review queue reads 24 predictions per page, plus one lookahead row to determine whether another page exists. It uses cursor pagination ordered by `created_at DESC, id DESC`. Creation time remains unchanged by normal classification/review updates, and the unique ID breaks timestamp ties. Unlike an offset or `updated_at` ordering, this avoids shifting previously visited records when new predictions arrive or a user saves labels. Previous navigation reverses the database ordering, then restores newest-first display. Cursor timestamps retain PostgreSQL precision; URL cursor fields are validated before use in query predicates.

Filters still mean pending human review, confirmed, corrected, failed AI processing, or all prediction states. Manual labels remain visible under confirmed/corrected even when AI failed or never ran. Skipped items remain accessible under All. Every query includes the authenticated owner ID and uses the existing session/RLS; signing is restricted to the retrieved owned photos. No AI or human-label writes are introduced by pagination.

`/review?photo=<uuid>` looks up the owned photo and its prediction directly, ignoring queue filters and cursors. Older photos are therefore reachable regardless of page. Photos without predictions get the same manual-label editor and a link to the photo detail page. Missing and unauthorized IDs share an unavailable message. Database errors are separate from empty results; route loading and error boundaries provide feedback and retry.

This is a live queue, not a transaction snapshot spanning browser requests. Records can leave or enter a filter when reviewed, and deleted photos can disappear. Newer arrivals appear when returning to the first page. An item that newly matches a filter above the current cursor likewise requires refreshing the first page. Ordinary AI/review updates do not change ordering; administrative edits to creation times or row replacement are outside that guarantee. Exact page numbers and total counts are deliberately omitted. Existing database indexes may require a sort for large libraries; a measured future composite index can improve performance without changing behavior.

No new migration is required; this remains compatible with pending migrations 0010–0013. Query/page regression tests cover 65 entries, timestamp ties, first/middle/last pages, backward navigation, concurrent arrivals/updates, filters, manual labels, direct access, authorization, invalid cursors and errors. Existing review action/component tests continue to cover confirm/correct/skip and label edits.

## 24. Atomic classification attempts (migration 0014)

Previously, prediction updates filtered on `processing_token`, but photo `ai_status` updates were separate and did not check that token. A superseded request could update zero prediction rows and still mark the photo failed or ready. Some paths also ignored database errors, and a successful prediction write could be followed by a failed photo-summary write.

The application now calls two SECURITY INVOKER RPCs. `start_photo_classification` locks the authenticated owner's photo, then its prediction, assigns a new attempt token, and records processing status in both rows in one transaction. `finish_photo_classification` acquires locks in the same order, rejects a mismatched token, and saves the machine result and photo summary together. Any error rolls back both writes. RLS and explicit ownership checks remain in place. The database accepts only an explicit list of machine-result fields; it never copies human labels, owner IDs, photo IDs or attempt tokens from the result payload.

Each retry gets a fresh UUID. When retries overlap, the latest **database-accepted start** wins, regardless of inference completion order. This is not determined by browser click time. Duplicate completion with the same token returns its already stored terminal state without changing it; repeated start with the currently stored token is a no-op. A newer request can supersede a running request, but its old inference computation is not cancelled, so overlapping requests can still consume extra AI work. The application reports supersession rather than announcing a stale success/failure as current.

Manual label writes and classification RPCs lock photo then prediction. A completion derives the photo summary from current human labels, not the start-time snapshot. Confirmed/corrected labels remain authoritative, and an existing reviewed machine snapshot is preserved. A photo labeled before its first AI result can still acquire an independent AI suggestion. Classification thresholds, scores and model behavior are unchanged.

The embedding client retains its existing 60-second request timeout. Service failures are recorded transactionally when the database is reachable. If starting fails, inference does not run. If result persistence fails or its response is lost, the application returns `database_failure` and does not issue a compensating failure write: that write could destroy an already committed success. A rolled-back completion leaves both rows at their prior state (usually processing); a lost response may mean both rows committed. Refresh reveals the stored state. Existing five-minute interrupted-processing detection offers Retry after a process crash or prolonged database outage. There is no durable background worker or automatic recovery scheduler.

Apply **0010 → 0011 → 0012 → 0013 → 0014** before deploying this application version. Stop/drain old classification requests during rollout so legacy code cannot issue unguarded photo-status writes afterward. No production migration is applied by development. Direct owner-authorized database writes remain subject to existing RLS and are outside the RPC workflow guarantee. Rare deadlocks involving pet deletion roll back safely and may require retry.

`tests/database/run-photo-classification.py` uses only the isolated disposable Docker database documented in `run-photo-deletion.py`. It first runs the complete 0010–0013 regression chain, then tests actual row-lock concurrency, out-of-order attempts, stale success/failure, duplicate starts/completions, unauthorized calls, manual labels in both lock orders, and injected failure in the second write to prove rollback. Unit/action tests verify RPC-only persistence, superseded feedback, AI failure handling and uncertain database responses without fallback writes.
