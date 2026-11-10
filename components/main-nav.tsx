"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PageContainer } from "@/components/ui/page-container";
import { AuthenticatedSidebar } from "@/components/authenticated-sidebar";

const publicLinks = [
  { href: "/", label: "Home" },
  { href: "/login", label: "Log in" },
  { href: "/register", label: "Register" },
];

export function MainNav({
  user,
  reviewCount,
}: {
  user: { email?: string | null; displayName?: string | null } | null;
  reviewCount?: number | null;
}) {
  const pathname = usePathname();
  if (user)
    return <AuthenticatedSidebar user={user} reviewCount={reviewCount} />;
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
          <div className="nav-links">
            {publicLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={pathname === link.href ? "page" : undefined}
                className="nav-link focus-ring"
              >
                {link.label}
              </Link>
            ))}
          </div>
        </PageContainer>
      </nav>
    </header>
  );
}
