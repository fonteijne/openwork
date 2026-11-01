/**
 * Before every commit (plan §7.2): files that look like a password or key
 * never get shared. A hit blocks the whole commit and names the file.
 */
export type SecretHit = { path: string; reason: string };

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
  for (const [pattern, reason] of SECRET_CONTENT) if (pattern.test(content)) return reason;
  return null;
}

export function scanForSecrets(files: ReadonlyArray<{ path: string; content: string | null }>): SecretHit[] {
  const hits: SecretHit[] = [];
  for (const file of files) {
    const reason = secretInName(file.path) ?? (file.content === null ? null : secretInContent(file.content));
    if (reason) hits.push({ path: file.path, reason });
  }
  return hits;
}
