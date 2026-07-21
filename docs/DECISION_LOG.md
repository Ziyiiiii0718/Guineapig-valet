# Decision Log

## Decision 1: Phase 1A Does Not Implement Real AI

Original ambiguity: The requirements describe AI classification, but the task says Phase 1A must not depend on the AI service.

Chosen decision: Define TypeScript AI boundary types and documentation only.

Why: Authentication, database design, and user isolation should be stable before adding model infrastructure.

Alternatives: Build a mock classifier now; build FastAPI now.

Consequences: Dashboard has placeholders, but architecture stays honest.

Can revisit: Yes, in the AI reference-photo and classification phases.

## Decision 2: One Primary Classification Result First

Original ambiguity: Requirements mention multiple labels and multi-pet photos, while the task asks for one primary classification result.

Chosen decision: Store statuses for specific pet, unknown, not a guinea pig, and needs review. Treat reliable multi-pet detection as future work.

Why: Single-result review is easier to explain, test, and ship.

Alternatives: Many labels per photo from day one.

Consequences: Multi-pet support requires a later schema and UI update.

Can revisit: Yes.

## Decision 3: Supabase Auth Owns Passwords

Original ambiguity: The data model draft mentions users, but credentials should not be stored by the app.

Chosen decision: Use `auth.users` and optional `profiles`; never create a password table.

Why: Supabase Auth handles hashing, sessions, and credential workflows.

Alternatives: Custom auth.

Consequences: App code depends on Supabase Auth configuration for real login.

Can revisit: Unlikely unless the auth provider changes.

## Decision 4: Simple UI First

Original ambiguity: Portfolio-quality can imply heavy visual polish.

Chosen decision: Build simple, responsive, accessible pages with clear placeholders.

Why: Early phases should prove architecture and security first.

Alternatives: Build a highly branded UI immediately.

Consequences: Visual polish is deferred but the UI remains usable.

Can revisit: Yes, in portfolio polish.

## Decision 5: Cascade Deletion Is Used Only for User-Owned Dependent Data

Original ambiguity: Deleting pets or photos could remove related data unexpectedly.

Chosen decision: Cascade records that cannot stand alone, keep album/photo independence where appropriate, and document cleanup duties.

Why: Users expect private account deletion to remove their data, but removing a pet should not silently delete the whole photo library.

Alternatives: Restrict all deletes; cascade everything.

Consequences: Some cleanup needs application logic, especially storage objects.

Can revisit: Yes after photo features are implemented.

## Decision 6: Prefer Publishable Key Naming While Keeping Legacy Fallback

Original ambiguity: The project originally used `NEXT_PUBLIC_SUPABASE_ANON_KEY`, while current Supabase setup language often refers to a client-safe Publishable key.

Chosen decision: Use `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `.env.example` and docs, while keeping `NEXT_PUBLIC_SUPABASE_ANON_KEY` as a code fallback for existing local setups.

Why: This keeps setup language current without breaking anyone who already configured the legacy variable locally.

Alternatives: Keep only the anon-key name; rename everything and drop fallback.

Consequences: The environment helper has compatibility logic, and docs must explain which variable new setups should use.

Can revisit: Yes, after confirming all local and deployed environments have migrated.

## Decision 7: Pet Avatars Use a Private Storage Bucket Before General Photo Upload

Original ambiguity: Profile photos are image uploads, but the broader requirements also include reference photos, general galleries, AI classification, and albums.

Chosen decision: Implement only pet profile avatars in this phase, using a private `pet-avatars` bucket and the existing `pets.profile_photo_path` field. General photo upload and AI reference-photo storage remain future work.

Why: A profile avatar is a focused improvement to pet CRUD. It proves private Storage, signed URL rendering, file validation, and cleanup behavior without starting the full photo pipeline.

Alternatives: Make avatars public; store permanent signed URLs; implement the full gallery/upload system now.

Consequences: The app stores object paths rather than URLs, creates signed URLs at render time, and must handle best-effort cleanup because PostgreSQL and Storage do not share one transaction.

Can revisit: Yes, when general photo storage and reference-photo workflows are designed.
