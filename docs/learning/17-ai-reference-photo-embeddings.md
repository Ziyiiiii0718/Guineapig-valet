# AI Reference Photos and Image Embeddings

Phase 6 adds the foundation for visual similarity without claiming to classify a new photo. An authenticated owner selects existing private gallery photos for a pet, Next.js securely retrieves those bytes, a separate FastAPI service creates one normalized vector, and PostgreSQL stores it with model and processing metadata.

## 1. What is an image embedding?

An image embedding is a fixed-length list of numbers that summarizes visual features. Similar-looking images should have vectors that point in similar directions. The vector is not a filename, pet name, confidence score, or human-readable description.

## 2. Embeddings are not classification

Embedding generation answers “how can this image be represented numerically?” Classification answers “which label should this image receive?” This phase only creates reference vectors. It deliberately has no pet-specific label logic, thresholds, predictions, or review queue.

## 3. Why reference images are needed

A general image encoder has not learned a user's individual pets by name. Several clear examples provide a future comparison set for each arbitrary pet row. Different angles, face/body views, and backgrounds make that set more representative; 5–15 is guidance rather than a schema requirement.

## 4. CLIP/OpenCLIP-style encoders

OpenCLIP provides an open implementation of CLIP-style models. PiggieVault starts with `ViT-B-32-quickgelu` and `openai` pretrained weights because this mature image encoder produces compact 512-dimensional features and the QuickGELU architecture matches those weights. The model boundary is a Python protocol so a later encoder can replace it without rewriting authentication, RLS, or reference management.

## 5. Fixed-dimensional vectors

Every selected model version must return the same number of values. The database uses `vector(512)`, the Python result declares `dimension = 512`, and Next.js rejects any other size. This avoids silently comparing incompatible representations.

## 6. Cosine similarity

Cosine similarity measures the angle between two vectors. Values pointing in the same direction are more similar than perpendicular values. Phase 7 may compare reference embeddings this way, but this phase chooses no classification thresholds.

## 7. L2 normalization

The service divides each vector by its Euclidean (L2) magnitude so its final length is one. For unit vectors, cosine similarity becomes a dot product. Next.js checks the returned magnitude within a small numeric tolerance before storing it.

## 8. Why ML is separate from Next.js

PyTorch and OpenCLIP are large, stateful Python dependencies that do not belong in a browser or a Vercel Next.js bundle. FastAPI gives model inference a separate deployment/runtime boundary. Next.js remains responsible for sessions, ownership, Storage, and database writes; Python remains responsible for decode, preprocess, inference, and normalization.

## 9. FastAPI request flow

1. A Server Action authenticates the current user.
2. It verifies the pet and every selected photo under that user.
3. It reads the current Storage path from the authorized `photos` row.
4. The user's Supabase session downloads the private object.
5. Next.js sends raw stored JPEG/PNG/WEBP bytes to `/embed` with a server-only bearer token.
6. FastAPI decodes RGB pixels in memory and calls the singleton model.
7. FastAPI returns the normalized vector, model, version, and dimension.
8. Next.js validates the response and updates the owner-scoped reference row.

The endpoint accepts no URL, user ID, pet ID, Storage path, or Supabase credential.

## 10. Model loading

The model loads lazily on the first embedding request and is cached for the process. It is not reloaded per image. `/health` distinguishes `not_loaded`, `ready`, and `unavailable` without forcing a large weight download. Unit tests replace the model boundary with a deterministic fake.

## 11. Server-to-server authentication

`AI_SERVICE_URL` and `AI_SERVICE_TOKEN` are server-only environment variables. The token is compared safely by FastAPI and never uses a `NEXT_PUBLIC_*` name. This is a deliberately small internal boundary, not a new user identity platform.

## 12. Private image handling

Supabase Storage stays private. Authorization occurs before byte retrieval, Storage paths come from the database, and RLS independently protects the rows. Signed URLs, image bodies, vector values, and secrets are never logged. The AI service has no service-role key and cannot query Supabase.

## 13. pgvector

The initial migration already enabled PostgreSQL's `vector` extension and created `embedding vector(512)`. Migration 0008 reuses it. pgvector provides a typed fixed-length column and will support efficient similarity operations later; no similarity index is needed for the small reference set in this foundation phase.

## 14. Model and version metadata

A vector is meaningful only with the encoder and weights that produced it. Each ready reference records `embedding_model`, `embedding_version`, and `embedding_dimension`. Changing a model later can trigger intentional regeneration instead of mixing incompatible vectors.

## 15. Processing states and retries

`pending` means the relationship exists but work has not begun. `processing` means an embedding attempt is active. `ready` means a validated vector and metadata were saved. `failed` preserves the relationship with a sanitized category and allows Retry. Batch additions use two workers, so partial success is preserved rather than rolled back.

## 16. Why raw photos are not stored by the AI service

The image already exists in private Supabase Storage. A second copy creates retention, cleanup, and access-control risks. FastAPI reads request bytes into memory, decodes and processes them, returns a vector, and releases memory after the request. It writes no temporary image file.

## 17. Graceful service failure

AI configuration is read only when an embedding action runs. If the URL/token is absent, the service is down, the model cannot load, or a response is malformed, only that reference becomes failed. Authentication, pets, Gallery, albums, weights, health records, Dashboard, and navigation continue normally.

## 18. Common embedding-pipeline bugs

- Trusting a browser-submitted owner or Storage path.
- Linking a User A pet to a User B photo.
- Fetching arbitrary URLs and creating SSRF risk.
- Mixing model versions or dimensions.
- Storing a vector before marking work successful.
- Comparing unnormalized vectors as if they were unit length.
- Reloading the model for every request.
- Logging signed URLs, image bytes, vectors, or secrets.
- Copying a photo when a relationship row is sufficient.
- Deleting the original photo when removing a reference.
- Failing a whole batch because one image is invalid.
- Treating an embedding as a prediction.
- Deploying the Server Action before its additive database migration. Every
  Supabase query result must be checked: otherwise an undefined-column error in
  the duplicate lookup can be hidden until the following insert fails.

Reference-add diagnostics record only whether authentication and IDs were
present, selected/owned photo counts, the database operation, the PostgreSQL or
PostgREST error code, and a sanitized category. They never record IDs, private
rows, Storage paths, signed URLs, image bytes, database error messages, cookies,
tokens, or environment values.

## 19. Interview questions and answers

**Why does Next.js download the image?** It already owns authentication, RLS-backed authorization, and private Storage access. The AI service should not receive Supabase credentials or decide ownership.

**Why not send a signed URL?** A byte body prevents arbitrary URL fetching and keeps the AI service outside the Storage/security model. It also avoids logging or retaining temporary access URLs.

**Why normalize the vector?** Unit vectors make cosine similarity stable and reducible to a dot product.

**Why store model metadata?** Embeddings from different encoders or weights may not be comparable. Metadata supports safe future regeneration and debugging.

**How is cross-user attachment prevented?** Server queries scope pet/photo/reference by the authenticated user; RLS and composite owner foreign keys independently enforce the relationship.

**Why preserve failed references?** The user's selection remains meaningful, temporary service failures become retryable, and successful items in the same batch are not lost.

**Why no vector index yet?** Each pet has a small reference set and this phase does no library-wide similarity search. Premature indexing would add complexity without a measured query.

## 20. How I would explain this AI foundation in 60 seconds

PiggieVault lets an authenticated owner link existing private gallery photos to an owned pet without copying Storage objects. Next.js verifies both sides under the user's Supabase session, downloads the private stored JPEG/PNG/WEBP, and sends only its bytes through a server-authenticated request to a separate FastAPI/OpenCLIP service. The service loads one `ViT-B-32-quickgelu` model per process, applies matching preprocessing, returns a finite L2-normalized 512-value vector, and retains no image. Next.js validates the response and stores the pgvector value with model/version metadata and honest pending, processing, ready, or failed state under RLS. This establishes secure, retryable embeddings; classification and thresholds are deliberately deferred.

## 21. Vocabulary

- **Embedding:** fixed-length numeric representation of an image.
- **Encoder:** model that converts pixels into features.
- **OpenCLIP:** open CLIP-style model implementation.
- **ViT:** Vision Transformer.
- **Preprocessing:** deterministic resize, crop, RGB, and channel normalization.
- **L2 normalization:** scaling a vector to length one.
- **Cosine similarity:** directional similarity between vectors.
- **pgvector:** PostgreSQL vector type and operations.
- **Model metadata:** encoder, weights/version, and dimension.
- **RLS:** database row authorization using the authenticated identity.
- **Composite foreign key:** a relationship enforcing resource ID and owner.
- **SSRF:** abuse of a server to fetch attacker-chosen network URLs.
- **Bounded concurrency:** a small fixed number of simultaneous jobs.
- **Idempotency:** repetition that does not create unintended duplicates.
- **Sanitized error:** safe category/message without internal stack details.
