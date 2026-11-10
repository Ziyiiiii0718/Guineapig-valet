# Pet profiles and confirmed media

The September 2026 desktop redesign composes existing features into a photo-first pet homepage. It adds no database columns, pet/album relationship, upload path, or AI inference behavior.

## The layout boundary

The root Server Component still authenticates through Supabase. Signed-in users get `AuthenticatedSidebar`; visitors retain the public navigation. Home goes to `/dashboard`, and there is no invented Settings route. The sidebar uses the existing count of ready, pending reviews. On narrow screens it becomes wrapped navigation rather than a fixed-width sidebar.

`app/pets-desktop.css` isolates the shell and pet-page presentation from existing global feature styles. Fredoka and Nunito remain the configured fonts. Decorative SVG leaves and flowers have no interaction or semantic meaning and are hidden from assistive technology.

## A prediction is not a pet-photo relationship

`lib/pets/media-queries.ts` checks the pet owner before loading media. A photo qualifies only when its prediction has `review_status` confirmed or corrected, `confirmed_unknown = false`, and the requested pet in `confirmed_pet_ids`. It never uses suggested pet IDs or reference-photo membership to populate Recent Photos. A reviewed photo containing several pets qualifies independently for each pet.

Human truth remains usable when a later AI retry fails, so this query does not require the processing state to be ready. Ownership is checked on the photo and prediction, with RLS still enforced by the user's Supabase session. Explicit composite foreign-key names disambiguate PostgREST joins from legacy foreign keys. Signing happens only after filtering and pagination, and only for owner-prefixed Storage paths.

## Albums are derived, not assigned

The album query follows albums → owned album memberships → owned photos → reviewed prediction labels. An album appears once when at least one photo qualifies. It does not create a new pet-to-album table or copy an image. The card keeps the app's existing cover rule: the earliest surviving album membership. The count is the exact total album membership count and is explicitly labeled “photos in album,” rather than implying every image depicts the selected pet.

Both media sections have bounded, paginated expanded views on the same pet route, using validated `view` and `page` parameters. Database failures have separate error states; they are not presented as zero photos or fabricated content.

## Existing care features remain the source of truth

The overview reuses the existing weight sorting, summary calculation, canonical grams, and chart. The Weight tab opens the existing complete add/edit/delete/history component on the pet route. Health Summary lists real category/title/date records; it does not invent appetite, activity, or medical interpretation. Existing health routes handle editing and creation.

Photo/album actions invalidate the new pet-page consumers, weight actions also invalidate the pet index, and classification/review actions invalidate the shared layout to refresh the sidebar and derived pet media. These are cache updates, not changes to mutation semantics.

## Photos, avatars, and occasional reference setup

The cover uses a signed confirmed pet photo when available, then a softened enlarged avatar, then a garden placeholder. The avatar remains independently editable through the existing profile edit workflow and retains its initial-letter fallback. No new cover field is required; custom cover selection is deferred.

Reference setup sits immediately before Danger Zone. Its picker still selects existing private Gallery photos. The overview exposes ready counts, a compact preview, and an expandable section containing the existing status/retry/remove controls. Uploading more source photos remains a separate Gallery upload workflow. Pet deletion retains its original confirmation dialog and server action.

## Verification boundaries

Unit tests cover mixed-owner photo fixtures, confirmed/corrected versus suggested/skipped/Unknown labels, multi-pet membership, pagination before signing, derived albums, and error propagation. UI tests cover cover/initial fallbacks, functional links, empty states, and navigation highlighting. A zero-row anonymous request against the linked Supabase schema validated the new PostgREST relationship/filter syntax without reading private rows or mutating data.

Real signed-in desktop/mobile visual review and interactive mutation regression checks remain pending until a signed-in browser is available. The provided My Pets PNG was actually JSON data and could not be used as a visual reference; the written specification and the two readable profile images guided implementation.

## Redesign file inventory

Changed existing files (in addition to preserved Phase 7 changes):

- `app/layout.tsx`, `components/main-nav.tsx`
- `app/pets/page.tsx`, `app/pets/[id]/page.tsx`, `components/pets/pet-card.tsx`
- `components/references/reference-photos-section.tsx`, `components/weights/weight-chart.tsx`
- `app/actions/albums.ts`, `app/actions/photos.ts`, `app/actions/weights.ts`
- `app/actions/classification.ts` (existing untracked Phase 7 file; only shared-layout invalidation added)
- `tests/main-nav.test.tsx`
- `README.md`, `docs/ARCHITECTURE.md`, `docs/learning/README.md`

Added:

- `app/pets-desktop.css`
- `components/authenticated-sidebar.tsx`
- `components/ui/garden-art.tsx`, `components/ui/outline-icon.tsx`
- `components/pets/metadata-pill.tsx`, `components/pets/pet-profile-hero.tsx`
- `components/pets/pet-profile-aside.tsx`, `components/pets/pet-media-sections.tsx`
- `components/pets/pet-care-overview.tsx`, `components/pets/ai-recognition-setup.tsx`
- `lib/pets/media-queries.ts`, `lib/pets/profile-view.ts`
- `tests/pet-media-queries.test.ts`, `tests/pet-profile.test.tsx`
- This learning document.

## Validation checkpoint

- Next.js: 192 tests across 31 files passed.
- ESLint, standalone TypeScript, scoped Prettier check, production build, and `git diff --check` passed.
- AI service: 10 tests passed; Ruff formatting/lint and mypy passed. The existing Starlette/httpx deprecation warning remains.
- Used installed tool binaries; build required network access for existing Google Fonts.
- Three duplicate generated `.next/types/* 2.ts` files were moved to a temporary backup to resolve duplicate TypeScript declarations. The pre-build `next-env.d.ts` contents were preserved.
- No schema migration, data mutation, commit, push, staging, or branch change occurred.
- The available browser correctly redirected unauthenticated `/pets` access to login. Signed-in pet CRUD, media, care, reference, review, logout, and visual regression checks are still pending; automated coverage is not a substitute for those live checks.
