import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";

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
    <form action={action} className="card space-y-4">
      {message ? (
        <Alert tone="success" role="status" className="text-sm">
          {message}
        </Alert>
      ) : null}
      {error ? (
        <Alert tone="error" role="alert" className="text-sm">
          {error}
        </Alert>
      ) : null}
      <FormField
        id="email"
        name="email"
        label="Email"
        type="email"
        autoComplete="email"
        required
      />
      <FormField
        id="password"
        name="password"
        label="Password"
        type="password"
        autoComplete={
          buttonLabel === "Register" ? "new-password" : "current-password"
        }
        required
        minLength={8}
      />
      <Button type="submit" className="w-full">
        {buttonLabel}
      </Button>
    </form>
  );
}
