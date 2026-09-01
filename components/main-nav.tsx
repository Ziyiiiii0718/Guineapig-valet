"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PageContainer } from "@/components/ui/page-container";
import { logoutAction } from "@/app/actions/auth";

const publicLinks = [
  { href: "/", label: "Home" },
  { href: "/login", label: "Log in" },
  { href: "/register", label: "Register" },
];

const authenticatedLinks = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/pets", label: "Pets" },
  { href: "/photos", label: "Photos" },
  { href: "/albums", label: "Albums" },
  { href: "/photos/upload", label: "Upload" },
];

function getInitials(email: string | null | undefined) {
  const localPart = email?.split("@")[0]?.trim();
  return localPart?.slice(0, 2).toUpperCase() || "PV";
}

export function MainNav({ user }: { user: { email?: string | null } | null }) {
  const pathname = usePathname();
  const links = user ? authenticatedLinks : publicLinks;

  return (
    <header className="site-header">
      <nav className="py-4" aria-label="Main navigation">
        <PageContainer className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Link
            href="/"
            className="brand-logo focus-ring rounded-[var(--radius-md)]"
          >
            <span className="brand-logo-mark" aria-hidden="true" />
            <span>
              Piggie<span className="brand-logo-word">Vault</span>
            </span>
          </Link>
          <div className="nav-actions">
            <div className="nav-links">
              {links.map((link) => {
                const isActive =
                  link.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(link.href);

                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={isActive ? "page" : undefined}
                    className="nav-link focus-ring"
                  >
                    {link.label}
                  </Link>
                );
              })}
            </div>
            {user ? (
              <div className="nav-user">
                <span
                  className="nav-user-avatar"
                  aria-label={`Signed in as ${user.email ?? "PiggieVault user"}`}
                  role="img"
                >
                  {getInitials(user.email)}
                </span>
                <form action={logoutAction}>
                  <button type="submit" className="nav-logout focus-ring">
                    Log out
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        </PageContainer>
      </nav>
    </header>
  );
}
