import { twMerge } from "tailwind-merge";

type ClassValue = string | false | null | undefined;

/** Joins class names; later Tailwind utilities win over earlier ones. */
export function cn(...values: ClassValue[]): string {
  return twMerge(values.filter(Boolean).join(" "));
}
