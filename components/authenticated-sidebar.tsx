"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";
import { GardenArt } from "@/components/ui/garden-art";
import { OutlineIcon, type IconName } from "@/components/ui/outline-icon";

const links: Array<{ href: string; label: string; icon: IconName }> = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/pets", label: "Pets", icon: "pets" },
  { href: "/photos", label: "Photos", icon: "photos" },
  { href: "/albums", label: "Albums", icon: "albums" },
  { href: "/photos/upload", label: "Upload", icon: "upload" },
  { href: "/review", label: "Review Queue", icon: "review" },
];

export function AuthenticatedSidebar({
  user,
  reviewCount,
}: {
  user: { email?: string | null; displayName?: string | null };
  reviewCount?: number | null;
}) {
  const pathname = usePathname();
  const name = user.displayName || user.email?.split("@")[0] || "Your account";
  return (
    <header className="authenticated-sidebar">
      <Link href="/dashboard" className="sidebar-brand focus-ring">
        <OutlineIcon name="leaf" />
        PiggieVault
      </Link>
      <nav className="sidebar-links" aria-label="Main navigation">
        {links.map(({ href, label, icon }) => {
          const active =
            href === "/photos"
              ? pathname.startsWith("/photos") && pathname !== "/photos/upload"
              : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              href={href}
              key={href}
              className="sidebar-link focus-ring"
              aria-current={active ? "page" : undefined}
            >
              <OutlineIcon name={icon} />
              <span>{label}</span>
              {href === "/review" &&
              typeof reviewCount === "number" &&
              reviewCount > 0 ? (
                <span
                  className="sidebar-review-count"
                  aria-label={`${reviewCount} photos need review`}
                >
                  {reviewCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      <div className="sidebar-garden">
        <p aria-hidden="true">
          Happy Piggies
          <br />
          Happier Days ♡
        </p>
        <GardenArt />
      </div>
      <div className="sidebar-user">
        <span
          className="nav-user-avatar"
          role="img"
          aria-label={`Signed in as ${user.email || name}`}
        >
          {name.slice(0, 2).toUpperCase()}
        </span>
        <div>
          <span className="sidebar-user-name">{name}</span>
          <form action={logoutAction}>
            <button className="nav-logout focus-ring" type="submit">
              Log out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
