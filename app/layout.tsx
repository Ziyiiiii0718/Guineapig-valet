import type { Metadata } from "next";
import { Fredoka, Noto_Sans_SC, Nunito } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { MainNav } from "@/components/main-nav";
import { PageContainer } from "@/components/ui/page-container";

const fredoka = Fredoka({
  subsets: ["latin"],
  variable: "--font-fredoka",
  display: "swap",
});

const nunito = Nunito({
  subsets: ["latin"],
  variable: "--font-nunito",
  display: "swap",
});

const notoSansSc = Noto_Sans_SC({
  subsets: ["latin"],
  variable: "--font-noto-sans-sc",
  display: "swap",
});

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
    <html
      lang="en"
      className={`${fredoka.variable} ${nunito.variable} ${notoSansSc.variable}`}
    >
      <body>
        <a
          href="#main-content"
          className="focus-ring sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[var(--color-surface)] focus:px-3 focus:py-2 focus:text-sm focus:shadow-[var(--shadow-sm)]"
        >
          Skip to content
        </a>
        <MainNav />
        <main id="main-content" className="app-main">
          <PageContainer>{children}</PageContainer>
        </main>
        <footer className="app-footer">
          <Link href="/" className="link-primary">
            PiggieVault
          </Link>{" "}
          is in Phase 1B: authenticated pet profiles are live; photos, AI,
          weight, and health remain planned.
        </footer>
      </body>
    </html>
  );
}
