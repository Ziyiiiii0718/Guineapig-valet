import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ConfigNotice } from "@/components/config-notice";
import { PetAvatar } from "@/components/pets/pet-avatar";
import { PlaceholderSection } from "@/components/placeholder-section";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { listRecentAlbumsForDashboard } from "@/lib/albums/queries";
import { getPublicEnvStatus } from "@/lib/env";
import { formatHealthDate, HEALTH_TYPE_LABELS } from "@/lib/health/core";
import { listRecentHealthForDashboard } from "@/lib/health/queries";
import { formatPetAge } from "@/lib/pets/age";
import type { PetWithAvatarUrl } from "@/lib/pets/avatar-urls";
import { listPetsForUser } from "@/lib/pets/queries";
import { formatPetSex } from "@/lib/pets/view";
import { getPhotoDisplayName } from "@/lib/photos/display-name";
import type { PhotoWithSignedUrl } from "@/lib/photos/queries";
import { listRecentPhotosForDashboard } from "@/lib/photos/queries";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatWeightGrams } from "@/lib/weights/core";
import { listWeightSummariesForDashboard } from "@/lib/weights/queries";

function getFriendlyUserName(metadata: Record<string, unknown> | undefined) {
  const candidates = [
    metadata?.full_name,
    metadata?.display_name,
    metadata?.name,
  ];

  return candidates.find(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  );
}

function getPetActivityCopy(pets: PetWithAvatarUrl[]) {
  if (pets.length === 0) {
    return "Your private memories and care notes are ready when you are.";
  }

  if (pets.length === 1) {
    return `Here’s what ${pets[0].name} has been up to.`;
  }

  if (pets.length === 2) {
    return `Here’s what ${pets[0].name} and ${pets[1].name} have been up to.`;
  }

  return `Here’s what ${pets[0].name}, ${pets[1].name}, and your other piggies have been up to.`;
}

function DashboardPetPreview({
  error,
  pets,
}: {
  error: unknown;
  pets: PetWithAvatarUrl[];
}) {
  const previewPets = pets.slice(0, 2);

  return (
    <section
      className="dashboard-pets-section"
      aria-labelledby="dashboard-pets-title"
    >
      <div className="dashboard-section-heading">
        <div>
          <p className="section-kicker">Your piggies</p>
          <h2 id="dashboard-pets-title" className="sr-only">
            Pet profiles
          </h2>
        </div>
        <Link className="dashboard-text-link focus-ring" href="/pets">
          View all pets <span aria-hidden="true">→</span>
        </Link>
      </div>

      {error ? (
        <Alert tone="error" role="alert" className="text-sm">
          We could not load your pet profiles. Please try again.
        </Alert>
      ) : null}

      {!error && pets.length === 0 ? (
        <div className="dashboard-empty-prompt">
          <p>Create your first pet profile to see it here.</p>
          <ButtonLink href="/pets/new" variant="secondary">
            Create pet
          </ButtonLink>
        </div>
      ) : null}

      {!error && previewPets.length > 0 ? (
        <div className="dashboard-pets-composition">
          {previewPets.map((pet) => (
            <Link
              key={pet.id}
              className="dashboard-pet-showcase focus-ring"
              href={`/pets/${pet.id}`}
              aria-label={`View ${pet.name}'s profile`}
            >
              <PetAvatar
                className="dashboard-pet-avatar"
                name={pet.name}
                src={pet.profile_photo_url}
              />
              <div className="dashboard-pet-details">
                <div>
                  <h3>{pet.name}</h3>
                  <Badge tone="success">{formatPetSex(pet.sex)}</Badge>
                </div>
                <p>{formatPetAge(pet.birth_date)}</p>
                <span>
                  View profile <span aria-hidden="true">→</span>
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function RecentMoments({
  error,
  photos,
}: {
  error: unknown;
  photos: PhotoWithSignedUrl[];
}) {
  return (
    <section
      className="dashboard-moments"
      aria-labelledby="recent-moments-title"
    >
      <div className="dashboard-section-heading dashboard-moments-heading">
        <div>
          <p className="section-kicker">Private memories</p>
          <h2 id="recent-moments-title">Recent moments</h2>
          <p>Your newest uploaded photos</p>
        </div>
        <Link className="dashboard-text-link focus-ring" href="/photos">
          View all photos <span aria-hidden="true">→</span>
        </Link>
      </div>

      {error ? (
        <Alert tone="error" role="alert" className="text-sm">
          We could not load your recent photos. Please try again.
        </Alert>
      ) : null}

      {!error && photos.length === 0 ? (
        <div className="dashboard-empty-prompt dashboard-moments-empty">
          <p>Upload a private photo to start your recent moments.</p>
          <ButtonLink href="/photos/upload">Upload photos</ButtonLink>
        </div>
      ) : null}

      {!error && photos.length > 0 ? (
        <div className="dashboard-moments-surface">
          <div className="dashboard-moments-grid">
            {photos.map((photo, index) => {
              const displayName = getPhotoDisplayName(photo);
              return (
                <Link
                  key={photo.id}
                  className="dashboard-moment focus-ring"
                  href={`/photos/${photo.id}`}
                  aria-label={`View ${displayName}`}
                >
                  {photo.signed_url ? (
                    <Image
                      alt=""
                      className="dashboard-moment-image"
                      fill
                      priority={index === 0}
                      sizes="(min-width: 900px) 25vw, (min-width: 560px) 50vw, 100vw"
                      src={photo.signed_url}
                      unoptimized
                    />
                  ) : (
                    <span>Image unavailable</span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

type QuickAction = {
  description: string;
  href: string;
  icon: string;
  title: string;
  tone: "green" | "gold";
};

function DashboardQuickActions({ actions }: { actions: QuickAction[] }) {
  return (
    <section
      className="dashboard-quick-section"
      aria-labelledby="quick-actions-title"
    >
      <h2 id="quick-actions-title">Quick access</h2>
      <div className="dashboard-quick-grid">
        {actions.map((action) => (
          <Link
            key={action.title}
            className="dashboard-quick-action focus-ring"
            href={action.href}
          >
            <span
              className={`dashboard-quick-icon dashboard-quick-icon-${action.tone}`}
              aria-hidden="true"
            >
              {action.icon}
            </span>
            <span className="dashboard-quick-copy">
              <strong>{action.title}</strong>
              <span>{action.description}</span>
            </span>
            <span className="dashboard-quick-arrow" aria-hidden="true">
              →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export default async function DashboardPage() {
  const envStatus = getPublicEnvStatus();

  if (!envStatus.isConfigured) {
    return (
      <div className="space-y-6">
        <ConfigNotice status={envStatus} />
        <PlaceholderSection
          title="Dashboard unavailable"
          description="Add Supabase environment variables to enable authenticated dashboard access."
        />
      </div>
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      "/login?message=Please%20log%20in%20to%20view%20your%20dashboard.",
    );
  }

  const [petSummary, recentPhotos, recentAlbums] = await Promise.all([
    listPetsForUser(user.id),
    listRecentPhotosForDashboard(user.id),
    listRecentAlbumsForDashboard(user.id),
  ]);
  const petIds = petSummary.pets.map((pet) => pet.id);
  const [weightSummaries, healthRecords] = await Promise.all([
    listWeightSummariesForDashboard(user.id, petIds),
    listRecentHealthForDashboard(user.id, petIds),
  ]);
  const primaryPet = petSummary.pets[0];
  const primaryWeight = primaryPet
    ? weightSummaries.get(primaryPet.id)?.latest
    : null;
  const primaryHealth = primaryPet ? healthRecords.get(primaryPet.id) : null;
  const friendlyName = getFriendlyUserName(user.user_metadata);
  const quickActions: QuickAction[] = [
    {
      description:
        !recentAlbums.error && recentAlbums.albums.length > 0
          ? `${recentAlbums.albums.length} recently updated`
          : "Organize private memories",
      href: "/albums",
      icon: "▧",
      title: "Albums",
      tone: "green",
    },
    {
      description:
        primaryPet && primaryWeight
          ? `${primaryPet.name}: ${formatWeightGrams(primaryWeight.weight_grams)}`
          : "Track weight and growth",
      href: primaryPet ? `/pets/${primaryPet.id}` : "/pets/new",
      icon: "◫",
      title: "Weight tracker",
      tone: "gold",
    },
    {
      description:
        primaryPet && primaryHealth
          ? `${primaryPet.name}: ${HEALTH_TYPE_LABELS[primaryHealth.record_type]} · ${formatHealthDate(primaryHealth.record_date)}`
          : "Keep care notes together",
      href: primaryPet ? `/pets/${primaryPet.id}/health` : "/pets/new",
      icon: "+",
      title: "Health records",
      tone: "green",
    },
    {
      description: "Browse your private library",
      href: "/photos",
      icon: "♡",
      title: "All photos",
      tone: "gold",
    },
  ];

  return (
    <div className="dashboard-page">
      <header className="dashboard-welcome">
        <div>
          <h1>
            {friendlyName ? `Welcome back, ${friendlyName}` : "Welcome back"}{" "}
            <span aria-hidden="true">👋</span>
          </h1>
          <p>{getPetActivityCopy(petSummary.pets)}</p>
        </div>
        <Link className="dashboard-upload-cta focus-ring" href="/photos/upload">
          <span className="dashboard-upload-heart" aria-hidden="true">
            ♥
          </span>
          <span>
            <strong>Add a new moment</strong>
            <small>Upload a photo of your piggies</small>
          </span>
          <span className="dashboard-upload-arrow" aria-hidden="true">
            ↑
          </span>
        </Link>
      </header>

      <DashboardPetPreview error={petSummary.error} pets={petSummary.pets} />
      <RecentMoments error={recentPhotos.error} photos={recentPhotos.photos} />
      <DashboardQuickActions actions={quickActions} />
    </div>
  );
}
