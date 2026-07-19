import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type FormFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
};

export function FormField({ label, id, className, ...props }: FormFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="form-label">
        {label}
      </label>
      <input id={id} className={cn("input", className)} {...props} />
    </div>
  );
}
