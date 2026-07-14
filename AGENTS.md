# PiggieVault Codex Working Rules

Future Codex tasks in this repository must:

- Inspect existing code and documentation before editing.
- Read the relevant requirements before implementation.
- Work in small, reviewable phases.
- Avoid implementing unrelated features.
- Avoid unnecessary refactors.
- Preserve existing working behavior.
- Update relevant learning documentation whenever behavior or architecture changes.
- Explain major architectural decisions and trade-offs.
- Explain difficult concepts in beginner-friendly language.
- Never expose secrets.
- Never place real credentials in source files.
- Validate authentication and authorization on the server.
- Preserve user data isolation.
- Validate untrusted input.
- Write tests for important business logic.
- Run linting, type checking, tests, and production builds before declaring a task complete.
- Report failures honestly.
- Avoid claiming that something was tested when it was not.
- Avoid committing or pushing changes unless the user explicitly requests it.
- Avoid force pushes.
- Avoid destructive Git commands unless the user explicitly approves them.
- Prioritize simple functional UI during early phases.
- Avoid premature visual polish or overengineering.

The project is PiggieVault: a private guinea pig photo album and pet-care tracking platform. The current architecture target is Next.js App Router, React, TypeScript, Tailwind CSS, pnpm, Supabase Auth, Supabase PostgreSQL, Supabase Storage, PostgreSQL Row Level Security, and a future separate Python/FastAPI AI service.
