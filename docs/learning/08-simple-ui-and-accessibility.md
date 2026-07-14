# 08. Simple UI and Accessibility

## What This Feature Does

The first UI provides a clean landing page, auth forms, navigation, error/loading states, and dashboard placeholders.

## Why It Is Needed

Early UI should make the app usable without distracting from architecture, security, and data isolation.

## Complete Request and Data Flow

```text
User visits page -> sees clear navigation -> submits accessible form -> receives success, error, loading, or missing-config state
```

## Important Files

- `app/page.tsx`
- `app/layout.tsx`
- `app/loading.tsx`
- `app/error.tsx`
- `components/main-nav.tsx`
- `components/auth-form.tsx`
- `components/placeholder-section.tsx`

## Responsibilities

Navigation exposes routes. Forms use labels and required fields. Placeholder sections clearly say features are planned. Error and loading pages provide feedback.

## Concepts

Intuitive: accessibility means more people can use the app.

PiggieVault example: login inputs have labels so screen readers can identify them.

Technical: semantic HTML, focus states, responsive layouts, labels, and status roles improve usability and accessibility.

Interview explanation: "I kept the UI simple but professional, with semantic forms, responsive layout, and honest placeholder states."

## Why This Implementation Was Chosen

The requirements prioritize correct architecture and working functionality before visual polish.

## Alternatives and Trade-offs

Large UI library: faster components but more dependency weight. Custom design system: polished but premature. No styling: fast but unprofessional.

## Security, Privacy, Performance, Failure

The UI does not fake private data. It communicates missing Supabase configuration. Simple CSS keeps performance predictable.

## Common Mistakes

- Inputs without labels.
- Buttons with unclear purpose.
- Placeholder content that looks real.
- Desktop-only layouts.
- Spending too much time on animations before core features work.

## Interview Questions

1. Why simple UI first? It keeps attention on architecture and correctness.
2. What accessibility features exist? Labels, semantic sections, focus states, status messages.
3. How is mobile handled? Layouts use responsive Tailwind classes.
4. Why show placeholders? To communicate planned scope honestly.
5. Why avoid a component library now? It is unnecessary for Phase 1A.

## How I would explain this feature in 60 seconds.

The Phase 1A UI is intentionally simple but not careless. It has a readable landing page, accessible login and registration forms, responsive navigation, and a dashboard that clearly labels planned features. I included loading, error, empty, and missing-configuration states so the app behaves honestly even before Supabase is configured. Visual polish is planned later after the secure foundation is working.

## Glossary

- Semantic HTML: tags that describe meaning.
- Accessibility: design that supports users with different abilities.
- Focus state: visible indication of keyboard focus.
- Responsive design: layout adapting to screen size.
- Empty state: UI shown when no data exists.
