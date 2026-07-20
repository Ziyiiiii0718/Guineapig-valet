import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { ConfigNotice } from "@/components/config-notice";
import { signInAction } from "@/app/actions/auth";
import { getPublicEnvStatus } from "@/lib/env";

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="auth-shell space-y-6">
      <ConfigNotice status={getPublicEnvStatus()} />
      <div className="auth-intro">
        <p className="section-kicker">Welcome back</p>
        <h1 className="heading-page">Log in</h1>
        <p className="text-secondary mt-2 text-sm">
          Use your Supabase Auth email and password once the project is
          configured.
        </p>
      </div>
      <AuthForm
        action={signInAction}
        buttonLabel="Log in"
        error={params?.error}
        message={params?.message}
      />
      <p className="text-secondary text-sm">
        New to PiggieVault?{" "}
        <Link href="/register" className="link-primary focus-ring rounded-sm">
          Create an account
        </Link>
      </p>
    </div>
  );
}
