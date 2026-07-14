# 04. PostgreSQL Relational Design

## What This Feature Does

The initial SQL migration designs tables for users, pets, photos, albums, weights, health records, reference photos, and predictions.

## Why It Is Needed

Relational modeling makes ownership, relationships, constraints, and future queries explicit.

## Complete Request and Data Flow

```text
Authenticated user action -> server validates input -> row inserted with user_id -> foreign keys connect related records -> RLS filters access
```

## Important Files

- `supabase/migrations/0001_initial_schema.sql`
- `docs/DATABASE_DESIGN.md`
- `docs/SECURITY_MODEL.md`

## Responsibilities

Tables store domain data. Foreign keys protect relationships. Constraints prevent invalid values. Indexes support common queries. RLS keeps rows private.

## Concepts

Intuitive: tables are spreadsheets with rules and relationships.

PiggieVault example: one user owns many pets; one album contains many photos; one photo can appear in many albums.

Technical: one-to-many relationships use foreign keys, and many-to-many relationships use join tables such as `album_photos`.

Interview explanation: "I used PostgreSQL constraints to make invalid states harder, not just frontend validation."

## Why This Implementation Was Chosen

The schema matches the product requirements while allowing phased implementation.

## Alternatives and Trade-offs

NoSQL: easier flexible documents, weaker relational consistency. Fewer tables: faster setup, but messy later. More normalized schema: precise, but may be too complex for Phase 1A.

## Security, Privacy, Performance, Failure

Every private table includes `user_id`. Indexes support ownership queries. Cascades are documented. Storage deletion still needs application logic later.

## Common Mistakes

- Missing ownership columns.
- Using text IDs instead of UUIDs for core entities.
- Forgetting many-to-many join tables.
- Cascading deletes without documentation.
- Depending only on UI validation.

## Interview Questions

1. Why UUIDs? They are globally unique and work well in distributed systems.
2. Why foreign keys? They protect referential integrity.
3. Why check constraints? They block invalid states at the database layer.
4. Why indexes? They speed up common queries.
5. Why a join table for albums? A photo can belong to multiple albums.

## How I would explain this feature in 60 seconds.

The database is designed around ownership and relationships. A user owns pets, photos, albums, weight records, and health records. Foreign keys connect records, check constraints prevent invalid values, and indexes support common screens like galleries and pet histories. I also planned deletion behavior so a pet delete does not accidentally wipe unrelated photos, while account deletion can remove private user data.

## Glossary

- Table: collection of rows with the same shape.
- Foreign key: a relationship to another table.
- Constraint: database rule for valid data.
- Index: structure that speeds up queries.
- Join table: table connecting many-to-many relationships.
