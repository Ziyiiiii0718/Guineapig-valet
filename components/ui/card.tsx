import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type CardProps = HTMLAttributes<HTMLElement> & {
  as?: "div" | "section" | "aside";
  interactive?: boolean;
  soft?: boolean;
};

export function Card({
  as: Component = "section",
  interactive = false,
  soft = false,
  className,
  ...props
}: CardProps) {
  return (
    <Component
      className={cn(
        "card",
        soft && "card-soft",
        interactive && "card-interactive",
        className,
      )}
      {...props}
    />
  );
}
