import type { Metadata } from "next";
import { Fredoka, Noto_Sans_SC, Nunito } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { MainNav } from "@/components/main-nav";
import { PageContainer } from "@/components/ui/page-container";
import { getPublicEnvStatus } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { safeDisplayName } from "@/lib/pets/profile-view";
import { countPhotosNeedingReview } from "@/lib/ai/prediction-queries";
import "./pets-desktop.css";

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let user: { email?: string | null; displayName?: string | null } | null =
    null;
  let reviewCount: number | null = null;
  if (getPublicEnvStatus().isConfigured) {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      user = {
        email: data.user.email,
        displayName: safeDisplayName(data.user.user_metadata),
      };
      const review = await countPhotosNeedingReview(data.user.id);
      reviewCount = review.error ? null : review.count;
    }
  }

  return (
    <html
      lang="en"
      className={`${fredoka.variable} ${nunito.variable} ${notoSansSc.variable}`}
    >
      <body className={user ? "authenticated-app" : undefined}>
        <a
          href="#main-content"
          className="focus-ring sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[var(--color-surface)] focus:px-3 focus:py-2 focus:text-sm focus:shadow-[var(--shadow-sm)]"
        >
          Skip to content
        </a>
        <MainNav user={user} reviewCount={reviewCount} />
        <main id="main-content" className="app-main">
          <PageContainer>{children}</PageContainer>
        </main>
        {!user ? (
          <footer className="app-footer">
            <Link href="/" className="link-primary">
              PiggieVault
            </Link>{" "}
            has authenticated pet profiles, private avatars, photo upload,
            gallery browsing, private albums, weight tracking, and private
            health records live, with private AI photo suggestions kept under
            human review.
          </footer>
        ) : null}
      </body>
    </html>
  );
}
