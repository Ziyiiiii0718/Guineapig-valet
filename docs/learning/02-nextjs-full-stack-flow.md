# 02. Next.js Full-Stack Flow

## What This Feature Does

The app uses Next.js App Router pages, layouts, server actions, a proxy route guard, and reusable components to create a runnable web foundation.

## Why It Is Needed

PiggieVault needs both frontend pages and backend-adjacent logic. Next.js lets one TypeScript project handle both during early phases.

## Complete Request and Data Flow

```text
User opens page -> Next.js route renders -> form submits to server action -> Supabase call happens on server -> redirect or error message
```

## Important Files

- `app/layout.tsx`
- `app/page.tsx`
- `app/(auth)/login/page.tsx`
- `app/(auth)/register/page.tsx`
- `app/dashboard/page.tsx`
- `app/actions/auth.ts`
- `proxy.ts`

## Responsibilities

Pages define routes. Components keep UI reusable. Server actions process form submissions. The proxy refreshes sessions and protects dashboard routes when configuration exists.

## Concepts

Intuitive: App Router maps folders to web pages.

PiggieVault example: `/login` renders a login form and sends the form to `signInAction`.

Technical: Server Components can run on the server; client components run in the browser. Server actions execute trusted server-side logic.

Interview explanation: "I use server actions for authentication form handling so sensitive logic stays off the client."

## Why This Implementation Was Chosen

It is small, readable, and avoids creating an API layer before the app needs one.

## Alternatives and Trade-offs

API routes: explicit HTTP endpoints, more boilerplate. Client-only Supabase auth: quick, but less useful for teaching server-side protection. Separate backend now: more complexity before Phase 1 needs it.

## Security, Privacy, Performance, Failure

Server actions keep auth calls centralized. The proxy prevents direct dashboard visits when logged out. Missing config shows a clear message instead of crashing pages.

## Common Mistakes

- Importing server-only modules in client components.
- Assuming the route guard is the only authorization.
- Forgetting loading and error states.
- Returning fake dashboard data.
- Overbuilding routing before core flows are known.

## Interview Questions

1. What is App Router? Next.js folder-based routing with layouts and server components.
2. Why server actions? They process form logic on the server.
3. What does the proxy do here? It refreshes sessions and protects dashboard routes.
4. What happens without Supabase config? The app displays a setup notice.
5. Why avoid fake dashboard data? It prevents misleading reviewers.

## How I would explain this feature in 60 seconds.

The Next.js foundation gives PiggieVault a real web structure: a root layout, landing page, auth pages, and protected dashboard. Forms submit to server actions, which validate inputs and call Supabase Auth. The proxy adds a second route-level guard for the dashboard. The UI is intentionally simple, but the request flow is realistic and ready for real data once Supabase is configured.

## Glossary

- App Router: Next.js routing system based on the `app` directory.
- Server action: a function invoked from the UI but executed on the server.
- Proxy: Next.js route-level code that can run before matching routes.
- Redirect: sending the user to another page.
- Server Component: React component rendered on the server.
