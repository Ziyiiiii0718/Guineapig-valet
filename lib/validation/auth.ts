import { z } from "zod";

export const authFormSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export type AuthFormInput = z.infer<typeof authFormSchema>;
