import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { MainNav } from "@/components/main-nav";

export const metadata: Metadata = {
  title: "PiggieVault",
  description: "Private guinea pig photo albums and care tracking.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow"
        >
          Skip to content
        </a>
        <MainNav />
        <main
          id="main-content"
          className="mx-auto min-h-[calc(100vh-8rem)] w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8"
        >
          {children}
        </main>
        <footer className="border-t border-stone-200 px-4 py-6 text-center text-sm text-stone-600">
          <Link href="/" className="font-medium text-stone-800">
            PiggieVault
          </Link>{" "}
          is in Phase 1A: authentication-ready foundation and placeholder
          dashboard.
        </footer>
      </body>
    </html>
  );
}
