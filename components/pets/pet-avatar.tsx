/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/utils";

type PetAvatarProps = {
  className?: string;
  name: string;
  src?: string | null;
};

export function PetAvatar({ className, name, src }: PetAvatarProps) {
  const initial = name.trim().charAt(0).toUpperCase() || "P";

  if (src) {
    return (
      <img
        alt={`${name} profile photo`}
        className={cn("pet-avatar pet-avatar-image", className)}
        src={src}
      />
    );
  }

  return (
    <div className={cn("pet-avatar", className)} aria-hidden="true">
      <span>{initial}</span>
    </div>
  );
}
