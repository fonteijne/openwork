/**
 * Before every commit (plan §7.2): files that look like a password or key
 * never get shared. A hit blocks the whole commit; every hit is named at once,
 * with the line, so one chat can fix them all. The matched text itself is never
 * repeated: it would put the key in the message, the chat and the log.
 */
export type SecretHit = { path: string; reason: string; line?: number };

const SECRET_FILE_NAMES: Array<[RegExp, string]> = [
  [/(^|\/)\.env(\.(?!example$|sample$|template$)[^/]+)?$/i, "omgevingsbestand"],
  [/(^|\/)id_(rsa|dsa|ecdsa|ed25519)(_sk)?$/i, "SSH-sleutel"],
  [/\.(pem|key|p12|pfx|keystore|jks)$/i, "sleutelbestand"],
  [/(^|\/)\.(netrc|pgpass|npmrc|pypirc)$/i, "inloggegevens"],
  [/(^|\/)credentials(\.json)?$/i, "inloggegevens"],
];

const SECRET_CONTENT: Array<[RegExp, string]> = [
  [/-----BEGIN (?:RSA |DSA |EC |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY(?: BLOCK)?-----/, "privésleutel"],
  // LiteLLM virtual keys and OpenAI/Anthropic-style keys.
  [/\bsk-(?:ant-|proj-|svcacct-)?[A-Za-z0-9_-]{20,}/, "API-sleutel"],
  [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/, "GitHub-token"],
  [/\bgithub_pat_[A-Za-z0-9_]{60,}\b/, "GitHub-token"],
  [/\bglpat-[A-Za-z0-9_-]{20,}\b/, "GitLab-token"],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/, "AWS-sleutel"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, "Google-sleutel"],
  [/\bxox[abposr]-[A-Za-z0-9-]{10,}/, "Slack-token"],
  [/\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/, "Stripe-sleutel"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, "token"],
];

export function secretInName(path: string): string | null {
  for (const [pattern, reason] of SECRET_FILE_NAMES) if (pattern.test(path)) return reason;
  return null;
}

export function secretInContent(content: string): string | null {
  return findSecretInContent(content)?.reason ?? null;
}

/** The first thing in the text that looks like a key, and the line it is on (1-based). */
function findSecretInContent(content: string): { reason: string; line: number } | null {
  let first: { reason: string; index: number } | null = null;
  for (const [pattern, reason] of SECRET_CONTENT) {
    const index = content.search(pattern);
    if (index >= 0 && (!first || index < first.index)) first = { reason, index };
  }
  if (!first) return null;
  return { reason: first.reason, line: content.slice(0, first.index).split("\n").length };
}

export function scanForSecrets(files: ReadonlyArray<{ path: string; content: string | null }>): SecretHit[] {
  const hits: SecretHit[] = [];
  for (const file of files) {
    const byName = secretInName(file.path);
    if (byName) {
      hits.push({ path: file.path, reason: byName });
      continue;
    }
    const inContent = file.content === null ? null : findSecretInContent(file.content);
    if (inContent) hits.push({ path: file.path, reason: inContent.reason, line: inContent.line });
  }
  return hits;
}
