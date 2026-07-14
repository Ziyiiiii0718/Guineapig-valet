type AuthFormProps = {
  action: (formData: FormData) => Promise<void>;
  buttonLabel: string;
  error?: string;
  message?: string;
};

export function AuthForm({
  action,
  buttonLabel,
  error,
  message,
}: AuthFormProps) {
  return (
    <form
      action={action}
      className="space-y-4 rounded-lg border border-stone-200 bg-white p-6 shadow-sm"
    >
      {message ? (
        <p
          className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900"
          role="status"
        >
          {message}
        </p>
      ) : null}
      {error ? (
        <p
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div>
        <label
          htmlFor="email"
          className="block text-sm font-medium text-stone-800"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="mt-2 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-stone-950 shadow-sm focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700"
        />
      </div>
      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-stone-800"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={
            buttonLabel === "Register" ? "new-password" : "current-password"
          }
          required
          minLength={8}
          className="mt-2 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-stone-950 shadow-sm focus:border-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-700"
        />
      </div>
      <button
        type="submit"
        className="w-full rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2"
      >
        {buttonLabel}
      </button>
    </form>
  );
}
