# Private Pet Health Records

Phase 5 adds private chronological record keeping without diagnosis or medical recommendations.

## Data modeling and relationships

`health_records` is a child table: one pet has many independent events. Separate rows make sorting, filtering, editing, and deletion predictable. A composite foreign key prevents an owner/pet mismatch.

## Controlled categories and safe text

PostgreSQL and Zod accept only `symptom`, `vet_visit`, `medication`, `treatment`, or `general`. Stable machine values are mapped to friendly labels. Titles are trimmed, required, and limited to 120 characters. Optional notes are limited to 4,000 characters, preserve line breaks, and render as text rather than HTML or Markdown.

## Event dates and timezone safety

`record_date` is the calendar day the event occurred; `created_at` is when PiggieVault received the row. PostgreSQL `date` plus UTC-based display formatting prevents August 25 from appearing as August 24.

## Authorization and defense in depth

Server Actions authenticate the user, verify pet ownership, and scope mutations by user, pet, and record ID. RLS repeats the ownership boundary, while the composite foreign key prevents cross-owner pet relationships even if application validation regresses.

## Filtering, ordering, and pagination

The filter lives in `?type=` so links are shareable and server-rendered; unknown values safely become All. History sorts by `record_date DESC`, `created_at DESC`, then `id DESC`, so same-day records stay separate and deterministic. Queries return 25 rows per page and preserve the category filter.

## Editing, deletion, and derived summaries

The inline editor reuses create validation with Save, Cancel, pending state, and retained invalid input. Delete confirmation identifies the title and date, while its query targets one owner/pet/record tuple. Pet detail loads three recent entries and Dashboard shows only the latest title/category/date rather than storing duplicate summary fields.

## Medical interpretation is excluded

PiggieVault organizes observations. It does not infer illness, risk, treatment, or relationships between weight and health. It is not a substitute for veterinary advice.

## Responsive accessibility

The timeline is a semantic ordered list. Category meaning has visible text rather than color alone. Forms have explicit labels and associated errors, notes remain available as text, and wrapping layouts avoid dense medical-dashboard presentation.

## Common bugs and testing strategy

Common bugs include trusting submitted ownership, linking to another user's pet, shifting calendar dates, arbitrary categories, raw database errors, unlimited queries, lost filters, merged same-day records, unsafe HTML, or broad deletes. Tests cover validation, Unicode, dates, filters, ordering, pagination, authorized mutations, and cross-user rejection. Remote rollback-only checks exercise RLS with two generated users.

## Interview questions

**Why a separate table?** A pet has many independently managed dated events.

**Why PostgreSQL `date`?** The product records a calendar day, not an instant with a timezone.

**Why check ownership twice?** Server checks give clear behavior; RLS protects the database if application code is bypassed.

**Why controlled strings?** Stable category values make filtering reliable while labels can evolve.

**Why calculate Dashboard summaries?** Canonical rows stay authoritative and cannot drift from duplicated “latest” fields.

**How is deletion narrow?** It matches record ID, pet ID, and authenticated user ID, with RLS as another boundary.

## How I would explain Health Records in 60 seconds

Each health event is a private child row of one owned pet, with a controlled category, short title, optional notes, and timezone-safe calendar date. Authenticated Server Actions validate input and verify ownership, while RLS and a composite foreign key enforce the same boundary in PostgreSQL. A dedicated route provides filterable, deterministic, paginated history; pet detail and Dashboard show bounded recent summaries. The feature records information without diagnosis or veterinary recommendations.

## Vocabulary

- **Child resource:** a row belonging to a parent pet.
- **Controlled vocabulary:** a fixed set of category values.
- **Calendar date:** a day without time or timezone.
- **RLS:** database rules applied to row operations.
- **Composite foreign key:** a relationship checked through multiple columns.
- **Defense in depth:** independent layers of protection.
- **Deterministic ordering:** stable results when dates tie.
- **Pagination:** bounded result pages.
- **Derived value:** output calculated from canonical rows.
