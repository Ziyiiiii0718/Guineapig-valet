import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { ConfigNotice } from "@/components/config-notice";
import { signInAction } from "@/app/actions/auth";
import { getPublicEnvStatus } from "@/lib/env";

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { error?: string; message?: string };
}) {
  return (
    <div className="mx-auto max-w-md space-y-6">
      <ConfigNotice status={getPublicEnvStatus()} />
      <div>
        <h1 className="text-3xl font-bold text-stone-950">Log in</h1>
        <p className="mt-2 text-sm text-stone-600">
          Use your Supabase Auth email and password once the project is
          configured.
        </p>
      </div>
      <AuthForm
        action={signInAction}
        buttonLabel="Log in"
        error={searchParams?.error}
        message={searchParams?.message}
      />
      <p className="text-sm text-stone-600">
        New to PiggieVault?{" "}
        <Link
          href="/register"
          className="font-medium text-emerald-700 underline"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
