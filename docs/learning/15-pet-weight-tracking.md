# Pet Weight Tracking

Weight history belongs in a separate one-to-many table because one pet can have many measurements while the pet profile remains one row. Each record stores integer grams, a date-only measurement day, ownership, and audit timestamps.

## Canonical Unit and Constraints

Grams are the single source of truth: no formatted strings or second pound value can drift. PostgreSQL and Zod enforce whole numbers from 100–5000 g. This broad integrity range is not a medical judgment.

## Measurement Date and Timezones

`recorded_at` is PostgreSQL `date`, representing a calendar day rather than an instant. Formatting constructs a UTC calendar date from its parts, preventing August 25 from becoming August 24 across timezones. `created_at` records when the row was entered. Multiple same-day measurements are allowed and sort by measurement date, creation time, then UUID.

## Ownership and RLS

Server Actions derive the authenticated user, verify the pet by `id` and owner, and scope record mutations by user. RLS independently enforces ownership. A composite `(pet_id, user_id)` foreign key prevents User A records from referencing User B pets.

## Derived Values

Latest weight, previous weight, and their difference are calculated from history rather than stored. This prevents stale summaries after edits or deletion. The difference is mathematical only and never labels a result healthy or dangerous.

## Chart Transformation and Accessibility

Database/history display is newest-first. Recharts receives a reversed oldest-first copy and draws straight segments between actual points without smoothing or animation. The numeric history and textual summary remain the accessible source of exact values if the chart is unavailable. Responsive containers prevent mobile overflow.

## Common Bugs

- Storing `"1.4 kg"` instead of an integer.
- Treating a calendar day as a local timestamp.
- Trusting a browser-submitted owner.
- Updating a record without verifying its pet.
- Persisting a derived latest value that becomes stale.
- Silently overwriting same-day measurements.
- Showing chart color without exact text.
- Making veterinary conclusions from arithmetic.

## Interview Questions

**Why a separate table?** One-to-many history remains normalized and independently editable.

**Why integer grams?** It is precise for this product, easy to validate, and avoids floating-point/unit drift.

**Why use a date instead of timestamp?** The user records a calendar measurement day, not an exact instant.

**How is cross-user insertion blocked?** Server ownership checks, RLS, and a composite pet-owner foreign key reinforce each other.

**Why calculate change?** Derived values stay correct after any history edit or deletion.

**Why keep a list beside the chart?** Exact text is more accessible and prevents visual approximation from being the only representation.

## How I Would Explain Weight Tracking in 60 Seconds

“Each pet has private one-to-many weight records stored as integer grams and PostgreSQL calendar dates. The server authenticates the user, verifies pet ownership, and RLS plus a composite foreign key prevents cross-account relationships. Shared helpers deterministically sort same-day records, calculate latest and previous values, and format a simple signed difference without medical claims. Pet detail shows an accessible numeric history and a responsive Recharts line using chronological data, while Dashboard reuses the same summary calculations. Derived values are calculated, not stored, so edits and deletions cannot leave stale summaries.”

## Vocabulary

- **Canonical unit:** The one stored representation used as truth.
- **One-to-many:** One pet relates to many measurements.
- **Calendar date:** A day without timezone or time-of-day meaning.
- **Derived value:** A result calculated from source rows.
- **Composite foreign key:** Multiple columns proving a valid parent relationship.
- **Deterministic ordering:** Stable ordering even when primary values tie.
- **Responsive chart:** Visualization sized by its container.
