# 01. Project Architecture

## What This Feature Does

This foundation defines PiggieVault as a Next.js web app connected to Supabase Auth and a planned PostgreSQL database with Row Level Security. It also draws a clear future boundary for the Python/FastAPI AI service.

## Why It Is Needed

Architecture keeps the project understandable. For interviews, it lets you explain where UI code, server logic, database rules, and future AI processing belong.

## Complete Request and Data Flow

Current flow:

```text
Browser -> Next.js page/server action -> Supabase Auth -> PostgreSQL with RLS
```

Future AI flow:

```text
Browser -> Next.js -> Private Storage -> AI service -> Embedding comparison -> Prediction -> Review queue
```

## Important Files

- `app/`: pages and server actions.
- `components/`: reusable UI.
- `lib/env.ts`: configuration validation.
- `lib/supabase/`: Supabase clients.
- `lib/ai/types.ts`: future AI boundary.
- `docs/ARCHITECTURE.md`: system overview.

## Responsibilities

Next.js renders pages and handles server actions. Supabase Auth manages identity. PostgreSQL stores private data. RLS enforces ownership. The future AI service will process images without becoming part of the core web app.

## Concepts

Intuitive: architecture is the map of the system.

PiggieVault example: login happens in Supabase, dashboard rendering happens in Next.js, private records live in PostgreSQL.

Technical: this is a layered web architecture with client, server, database, and future service boundaries.

Interview explanation: "I separated the web app from the AI service so authentication and CRUD can work independently before model processing is added."

## Why This Implementation Was Chosen

Next.js and Supabase provide a fast portfolio-friendly foundation with real authentication, relational data, and deployment paths.

## Alternatives and Trade-offs

Custom backend: more control, more work. Firebase: simpler NoSQL, weaker relational modeling for this project. Monolithic Python app: good backend learning, less aligned with modern React portfolio expectations.

## Security, Privacy, Performance, Failure

Security depends on server checks plus RLS. Privacy requires private storage later. Performance comes from indexes and not blocking UI on AI work. If AI fails later, photos should remain and enter review.

## Common Mistakes

- Putting service-role keys in browser code.
- Letting frontend filters be the only authorization.
- Building AI before core data ownership is stable.
- Creating vague diagrams that do not match code.
- Hiding planned features as if they work.

## Interview Questions

1. Why separate the AI service? Because model dependencies and scaling differ from the web app.
2. What does RLS add? Database-level user isolation.
3. Why Next.js? It supports React UI and server-side logic in one project.
4. What is the first production risk? Misconfigured auth or RLS.
5. How does the app avoid fake functionality? Placeholder UI labels planned features clearly.

## How I would explain this feature in 60 seconds.

PiggieVault starts with a simple full-stack architecture: the browser talks to a Next.js app, Next.js uses Supabase Auth for identity, and PostgreSQL with Row Level Security protects user-owned data. I deliberately kept the future AI classifier behind a service boundary, because login, profiles, photos, and storage should work even if the AI service is offline. This makes the project easier to build in phases and easier to explain in interviews.

## Glossary

- Architecture: the high-level structure of a software system.
- Boundary: the line between responsibilities.
- RLS: database rules that limit row access.
- Service: a separately deployable piece of backend logic.
- Placeholder: UI that honestly shows a future feature is not ready.
