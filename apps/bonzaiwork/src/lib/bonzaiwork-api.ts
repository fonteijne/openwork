import { trimTrailingSlashes } from "@bonzaiwork/policy";
import { z } from "zod";

import type { ServerConnection } from "./connection";

/** Client for the /bonzaiwork routes the server hooks add (packages/bonzaiwork-litellm). */

const keyStateSchema = z.object({ hasKey: z.boolean(), keyHint: z.string().nullable() });

export const statusSchema = z.object({
  provider: z.string(),
  litellmBaseUrl: z.string(),
  keyMode: z.enum(["user", "workspace"]),
  keyStorePersistent: z.boolean(),
  user: keyStateSchema,
  workspaces: z.array(keyStateSchema.extend({ id: z.string() })),
  models: z.array(z.object({ id: z.string(), name: z.string().optional() })),
  defaultModel: z.string().nullable(),
  lastError: z.string().nullable(),
});

export type BonzaiworkStatus = z.infer<typeof statusSchema>;

const failureSchema = z.object({ code: z.string().optional(), message: z.string() });

/** Server codes the UI explains in its own words (DESIGN.md C6, T2: no raw provider text). */
const FAILURE_COPY: Record<string, string> = {
  key_rejected: "LiteLLM accepteert deze key niet. Controleer de key en probeer het opnieuw.",
  litellm_unreachable: "LiteLLM is niet bereikbaar. Controleer je verbinding en probeer het opnieuw.",
  invalid_key: "Plak een LiteLLM-key.",
  read_only: "Dit apparaat is alleen-lezen.",
};

export class BonzaiworkApiError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string) {
    super(message);
  }
}

async function call(connection: ServerConnection, path: string, init: { method?: string; body?: unknown; host?: boolean } = {}): Promise<BonzaiworkStatus> {
  const headers = new Headers({ Accept: "application/json" });
  if (init.host) {
    if (!connection.hostToken) throw new BonzaiworkApiError(403, "Deze sessie mag geen keys beheren.");
    headers.set("X-OpenWork-Host-Token", connection.hostToken);
  } else {
    headers.set("Authorization", `Bearer ${connection.token}`);
  }
  if (init.body !== undefined) headers.set("Content-Type", "application/json");
  const response = await fetch(`${trimTrailingSlashes(connection.baseUrl)}${path}`, {
    method: init.method ?? "GET",
    headers,
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = failureSchema.safeParse(payload);
    const code = failure.success ? failure.data.code : undefined;
    throw new BonzaiworkApiError(response.status, (code && FAILURE_COPY[code]) || `De lokale server gaf fout ${response.status}.`, code);
  }
  return statusSchema.parse(payload);
}

export const bonzaiworkApi = {
  status: (connection: ServerConnection) => call(connection, "/bonzaiwork/status"),
  refreshModels: (connection: ServerConnection) => call(connection, "/bonzaiwork/models/refresh", { method: "POST" }),
  /** The key travels once, straight to the server; nothing here keeps it. */
  linkUserKey: (connection: ServerConnection, key: string) =>
    call(connection, "/bonzaiwork/keys/user", { method: "PUT", body: { key }, host: true }),
  linkWorkspaceKey: (connection: ServerConnection, workspaceId: string, key: string) =>
    call(connection, `/bonzaiwork/keys/workspace/${encodeURIComponent(workspaceId)}`, { method: "PUT", body: { key }, host: true }),
};
