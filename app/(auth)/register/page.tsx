import Link from "next/link";
import { AuthForm } from "@/components/auth-form";
import { ConfigNotice } from "@/components/config-notice";
import { signUpAction } from "@/app/actions/auth";
import { getPublicEnvStatus } from "@/lib/env";

export default async function RegisterPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="mx-auto max-w-md space-y-6">
      <ConfigNotice status={getPublicEnvStatus()} />
      <div>
        <h1 className="heading-page">Create account</h1>
        <p className="text-secondary mt-2 text-sm">
          Registration is wired for Supabase Auth and needs real environment
          variables.
        </p>
      </div>
      <AuthForm
        action={signUpAction}
        buttonLabel="Register"
        error={params?.error}
        message={params?.message}
      />
      <p className="text-secondary text-sm">
        Already have an account?{" "}
        <Link
          href="/login"
          className="focus-ring rounded-sm font-semibold text-[var(--color-primary-hover)] underline"
        >
          Log in
        </Link>
      </p>
    </div>
  );
}
