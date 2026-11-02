import { homedir } from "node:os";

/**
 * Cleans text that leaves the machine in a feedback report. Errs on the side
 * of removing too much: a log line without its id is still useful, a leaked
 * key is not.
 */

const SECRET_NAME = /TOKEN|KEY|SECRET|PASSWORD/i;
const PATTERNS: Array<[RegExp, string]> = [
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [redacted]"],
  [/\b(?:sk|bwk_local)[-_][A-Za-z0-9_-]{6,}/g, "[redacted]"],
  // Long random runs (tokens, signatures); `/` is left out so paths survive.
  [/[A-Za-z0-9_+=-]{40,}/g, "[redacted]"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]"],
  [/\/Users\/[^/\s"'`]+/g, "~"],
  [/\/home\/[^/\s"'`]+/g, "~"],
  [/[A-Za-z]:\\Users\\[^\\\s"'`]+/gi, "~"],
];

/** Values of this process's secret-looking environment variables (tokens, keys, passwords). */
export function environmentSecrets(environment: NodeJS.ProcessEnv = process.env): string[] {
  return Object.entries(environment).flatMap(([name, value]) => (SECRET_NAME.test(name) && value && value.trim().length >= 8 ? [value.trim()] : []));
}

export function redactReport(text: string, secrets: readonly string[] = environmentSecrets()): string {
  let result = text;
  for (const secret of secrets) {
    if (secret.length >= 8) result = result.split(secret).join("[redacted]");
  }
  const home = homedir();
  if (home.length > 1) result = result.split(home).join("~");
  for (const [pattern, replacement] of PATTERNS) result = result.replace(pattern, replacement);
  return result;
}
