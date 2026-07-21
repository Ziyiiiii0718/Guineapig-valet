"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PageContainer } from "@/components/ui/page-container";

const links = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/pets", label: "Pets" },
  { href: "/login", label: "Log in" },
  { href: "/register", label: "Register" },
];

export function MainNav() {
  const pathname = usePathname();

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
          <div className="flex flex-wrap gap-2 sm:justify-end">
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
        </PageContainer>
      </nav>
    </header>
  );
}
