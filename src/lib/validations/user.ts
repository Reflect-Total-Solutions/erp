import { z } from "zod";

const PHONE_REGEX = /^(?:0|\+94|\+)?(?:[1-9]\d{1}|7[0-8]\d{1})\s?\d{3}\s?\d{4}$|^[+]?[\d\s-]{7,20}$/;
const NO_HTML_REGEX = /^[^<>]*$/;

export const userRoleEnum = z.enum(["admin", "supervisor", "employee"], {
  message: "Job role must strictly be Employee, Supervisor, or Admin.",
});

export const userCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Full name must be at least 2 characters.")
    .max(100, "Full name cannot exceed 100 characters.")
    .regex(NO_HTML_REGEX, "Name contains invalid characters."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Enter a valid work email address (e.g. user@company.com).")
    .max(120, "Email address cannot exceed 120 characters."),
  phone: z
    .string()
    .trim()
    .min(7, "Mobile number must be at least 7 digits.")
    .max(20, "Mobile number cannot exceed 20 digits.")
    .regex(PHONE_REGEX, "Enter a valid mobile phone number (e.g. 077 123 4567 or +94 77 123 4567)."),
  role: userRoleEnum,
  jobTitle: z.string().optional().nullable(),
});

export const changePasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  currentPassword: z.string().min(1, "Current/temporary password is required."),
  newPassword: z
    .string()
    .min(8, "New password must be at least 8 characters.")
    .max(100, "New password cannot exceed 100 characters."),
});

export const resetPasswordSchema = z.object({
  newPassword: z
    .string()
    .min(8, "Temporary password must be at least 8 characters.")
    .max(100, "Password cannot exceed 100 characters.")
    .optional(),
});

export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
