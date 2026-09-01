import { ConfigNotice } from "@/components/config-notice";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getPublicEnvStatus } from "@/lib/env";

const projectFeatures = [
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
      <section className="hero-shell grid gap-8 lg:grid-cols-[1.16fr_0.84fr] lg:items-center">
        <div className="max-w-3xl">
          <p className="section-kicker">Private pet-care workspace</p>
          <h1 className="heading-hero mt-3">
            PiggieVault keeps guinea pig memories and care notes in one safe
            place.
          </h1>
          <p className="text-secondary mt-5 max-w-2xl text-lg leading-8">
            This portfolio project is starting with a secure full-stack
            foundation: Supabase Auth, server-side session handling, PostgreSQL
            planning with Row Level Security, and a simple dashboard that names
            the features still under construction.
          </p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/register" className="sm:min-w-36">
              Create account
            </ButtonLink>
            <ButtonLink
              href="/login"
              variant="secondary"
              className="sm:min-w-28"
            >
              Log in
            </ButtonLink>
          </div>
        </div>
        <Card as="aside" soft className="hero-visual">
          <div className="flex items-start justify-between gap-4">
            <h2 className="heading-section">Current project</h2>
            <Badge tone="success">Private care</Badge>
          </div>
          <div className="meadow-strip mt-5" aria-hidden="true" />
          <ul className="mt-4 space-y-3">
            {projectFeatures.map((feature) => (
              <li
                key={feature}
                className="text-secondary flex items-start gap-3 text-sm"
              >
                <span className="feature-dot mt-1.5" aria-hidden="true" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
          <p className="text-secondary mt-5 text-sm">
            Pet profiles, photos, albums, weight, and health records are live.
            AI classification remains planned and is not presented as working.
          </p>
        </Card>
      </section>
    </div>
  );
}
