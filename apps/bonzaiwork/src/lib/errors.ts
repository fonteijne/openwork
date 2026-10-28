import { BackendError } from "~/backend/types";
import { copy } from "~/copy";

/**
 * One readable sentence for any failure (DESIGN.md C6, T2). Backends write
 * their BackendError messages in Dutch (the live client translates server
 * codes), so those show as written; never raw provider text or stack traces.
 */
export function errorText(error: unknown): string {
  if (error instanceof BackendError) return error.code === "network" ? copy.errors.network : error.message;
  if (error instanceof TypeError) return copy.errors.network;
  return copy.errors.generic;
}
