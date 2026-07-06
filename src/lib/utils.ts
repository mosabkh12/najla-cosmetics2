import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Safely derive a human-readable message from a caught value of unknown
 * shape. `catch` blocks receive `unknown` (not `Error`) — server functions in
 * this app throw plain `Error`s with codes as their `message` (e.g.
 * "INVALID_STATUS_TRANSITION"), so that's the common case, but this never
 * assumes it.
 */
export function getErrorMessage(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return fallback;
}
