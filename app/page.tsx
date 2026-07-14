import Link from "next/link";
import { ConfigNotice } from "@/components/config-notice";
import { getPublicEnvStatus } from "@/lib/env";

const plannedFeatures = [
  "Private pet profiles",
  "Secure photo storage",
  "Albums and timelines",
  "Weight and health tracking",
  "Future AI photo review queue",
];

export default function HomePage() {
  const envStatus = getPublicEnvStatus();

  return (
    <div className="space-y-10">
      <ConfigNotice status={envStatus} />
      <section className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
            Private pet-care workspace
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-stone-950 sm:text-5xl">
            PiggieVault keeps guinea pig memories and care notes in one safe
            place.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-stone-700">
            This portfolio project is starting with a secure full-stack
            foundation: Supabase Auth, server-side session handling, PostgreSQL
            planning with Row Level Security, and a simple dashboard that names
            the features still under construction.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/register"
              className="rounded-md bg-emerald-700 px-5 py-3 text-center text-sm font-semibold text-white hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2"
            >
              Create account
            </Link>
            <Link
              href="/login"
              className="rounded-md border border-stone-300 bg-white px-5 py-3 text-center text-sm font-semibold text-stone-800 hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-500 focus:ring-offset-2"
            >
              Log in
            </Link>
          </div>
        </div>
        <aside className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-stone-950">
            Phase 1A status
          </h2>
          <ul className="mt-4 space-y-3">
            {plannedFeatures.map((feature) => (
              <li key={feature} className="flex gap-3 text-sm text-stone-700">
                <span
                  className="mt-1 h-2 w-2 rounded-full bg-emerald-600"
                  aria-hidden="true"
                />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-sm text-stone-600">
            AI classification, uploads, albums, and health records are planned.
            They are not pretending to work yet.
          </p>
        </aside>
      </section>
    </div>
  );
}
