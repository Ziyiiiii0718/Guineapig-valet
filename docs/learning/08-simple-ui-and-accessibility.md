# 08. Simple UI and Accessibility

## What This Feature Does

The first UI provides a clean landing page, auth forms, navigation, error/loading states, dashboard placeholders, centralized design tokens, and a small set of reusable components.

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
- `components/ui/button.tsx`
- `components/ui/card.tsx`
- `components/ui/form-field.tsx`
- `components/ui/badge.tsx`
- `components/ui/alert.tsx`
- `app/globals.css`

## Responsibilities

Navigation exposes routes. Forms use labels and required fields. Placeholder sections clearly say features are planned. Error and loading pages provide feedback. Global CSS variables define the warm oatmeal, green, orange, brown text, radius, shadow, and font system in one place.

## Concepts

Intuitive: accessibility means more people can use the app.

PiggieVault example: login inputs have labels so screen readers can identify them.

Technical: semantic HTML, focus states, responsive layouts, labels, status roles, and centralized design tokens improve usability and maintainability.

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
6. Why use design tokens? They make color, radius, shadow, and typography changes consistent.

## How I would explain this feature in 60 seconds.

The Phase 1A UI is intentionally simple but not careless. It uses centralized design tokens for the warm oatmeal background, green brand color, soft cards, rounded buttons, and visible focus states. The landing page, auth forms, navigation, dashboard placeholders, loading state, and error state share the same small component foundation. It stays honest about unimplemented features and leaves complex visual polish for later.

## Glossary

- Semantic HTML: tags that describe meaning.
- Accessibility: design that supports users with different abilities.
- Focus state: visible indication of keyboard focus.
- Responsive design: layout adapting to screen size.
- Empty state: UI shown when no data exists.
- Design token: named style value such as a color, radius, or shadow.
- Component: reusable UI building block.
