import Link from "next/link";

const links = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/login", label: "Log in" },
  { href: "/register", label: "Register" },
];

export function MainNav() {
  return (
    <header className="border-b border-stone-200 bg-white">
      <nav
        className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8"
        aria-label="Main navigation"
      >
        <Link href="/" className="text-lg font-bold text-stone-950">
          PiggieVault
        </Link>
        <div className="flex flex-wrap gap-2">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100 hover:text-stone-950 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
