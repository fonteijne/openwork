import { BackendError } from "../types";

import { str } from "./read";

export type Connection = {
  baseUrl: string;
  token: string;
  hostToken: string | null;
  /** Resolves once the engine serves requests; rejects with a readable error when it cannot. */
  whenStarting?: () => Promise<void>;
};

export type RequestOptions = {
  method?: string;
  body?: unknown;
  form?: FormData;
  /** Host actions need the host token (create/rename/remove projects, keys, env). */
  host?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
};

function trim(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

export function headers(connection: Connection, options: { host?: boolean; json?: boolean } = {}): Headers {
  const result = new Headers({ Accept: "application/json" });
  result.set("Authorization", `Bearer ${connection.token}`);
  if (connection.hostToken) result.set("X-OpenWork-Host-Token", connection.hostToken);
  else if (options.host) throw new BackendError("read_only", "Dit apparaat is alleen-lezen.", 403);
  if (options.json) result.set("Content-Type", "application/json");
  return result;
}

/**
 * The server's own sentences are English and technical; the codes a person can
 * run into get ours (DESIGN.md C6). The server's sentence stays on `detail`.
 */
const SERVER_MESSAGES: Record<string, string> = {
  unauthorized: "De lokale server herkent deze app niet. Start BonzaiWork opnieuw.",
  forbidden: "De lokale server staat dit niet toe.",
  read_only: "Dit apparaat is alleen-lezen.",
  write_denied: "De lokale server heeft deze wijziging niet toegestaan.",
  workspace_unauthorized: "Deze app heeft geen toegang tot dit project.",
  organization_policy_denied: "Het beleid van je organisatie staat dit niet toe.",
  organization_model_denied: "Het beleid van je organisatie staat dit model niet toe.",
  policy_unavailable: "Het beleid van je organisatie is nu niet op te halen. Probeer het zo opnieuw.",
  invalid_key: "Plak een LiteLLM-key.",
  key_rejected: "LiteLLM accepteert deze key niet. Controleer de key en probeer het opnieuw.",
  litellm_unreachable: "LiteLLM is niet bereikbaar. Controleer je verbinding en probeer het opnieuw.",
  not_found: "Dit bestaat niet meer. Ververs de lijst.",
  workspace_not_found: "Dit project bestaat niet meer.",
  session_not_found: "Deze chat bestaat niet meer.",
  file_not_found: "Dit bestand bestaat niet meer.",
  skill_not_found: "Deze skill bestaat niet meer.",
  env_not_found: "Deze variabele bestaat niet meer.",
  conflict: "Iemand anders wijzigde dit tegelijk. Ververs en probeer opnieuw.",
  file_changed: "Dit bestand is intussen gewijzigd. Ververs en probeer opnieuw.",
  workspace_changed: "Dit project is intussen gewijzigd. Ververs en probeer opnieuw.",
  path_exists: "Er staat al iets met die naam.",
  file_too_large: "Dit bestand is te groot om te uploaden.",
  invalid_path: "Dit pad is niet geldig.",
  path_outside_workspace: "Dit pad valt buiten de projectmap.",
  invalid_skill_name: "Gebruik kleine letters, cijfers en streepjes in de naam.",
  invalid_mcp_name: "Gebruik kleine letters, cijfers en streepjes in de naam.",
  invalid_mcp_config: "Deze connectie klopt niet. Controleer de URL of het commando.",
  invalid_env_key: "Gebruik hoofdletters, cijfers en lage streepjes in de naam.",
  invalid_payload: "Deze gegevens kloppen niet. Controleer wat je invulde.",
  invalid_json: "Deze gegevens kloppen niet. Controleer wat je invulde.",
  workspace_run_mode_unsupported: "Deze stand voor uitvoeren is in deze versie niet beschikbaar.",
  opencode_unreachable: "De AI-engine reageert niet. Probeer het zo opnieuw.",
  opencode_request_failed: "De AI-engine kon dit niet uitvoeren. Probeer het opnieuw.",
  invalid_engine_response: "De AI-engine gaf een onleesbaar antwoord. Probeer het opnieuw.",
  engine_v2_preview_not_running: "De AI-engine start nog. Probeer het over een halve minuut opnieuw.",
  starting: "BonzaiWork start nog. Probeer het over een halve minuut opnieuw.",
  engine_failed: "De AI-engine start niet. Sluit BonzaiWork en open de app opnieuw.",
  mcp_tools_not_ready: "De connectie is opgeslagen, maar de tools zijn nog niet klaar. Probeer het zo opnieuw.",
  request_aborted: "Het verzoek is afgebroken.",
  internal_error: "De lokale server liep vast. Probeer het opnieuw.",
};

/**
 * One JSON request to the local server. Failures become BackendErrors with the
 * server's code and a Dutch sentence, never a stack trace or provider body.
 */
export async function request(connection: Connection, path: string, options: RequestOptions = {}): Promise<unknown> {
  // The server can answer before its engine (or BonzaiWork's hooks) is up.
  // Those 503s mean nothing was done, so the request waits and tries again:
  // with the backend's readiness check when it has one, else with a backoff.
  const started = Date.now();
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await attemptRequest(connection, path, options);
    } catch (failure) {
      const starting = failure instanceof BackendError && failure.status === 503 && STARTING_CODES.has(failure.code);
      if (!starting || options.signal?.aborted) throw failure;
      if (connection.whenStarting) {
        if (attempt >= 2) throw failure;
        await connection.whenStarting();
      } else {
        if (Date.now() - started > STARTING_PATIENCE_MS) throw failure;
        await new Promise((resolve) => setTimeout(resolve, Math.min(500 * 2 ** attempt, 2_000)));
      }
    }
  }
}

const STARTING_CODES = new Set(["engine_v2_preview_not_running", "starting"]);
const STARTING_PATIENCE_MS = 45_000;

async function attemptRequest(connection: Connection, path: string, options: RequestOptions): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
  options.signal?.addEventListener("abort", () => controller.abort(), { once: true });
  let response: Response;
  try {
    response = await fetch(`${trim(connection.baseUrl)}${path}`, {
      method: options.method ?? "GET",
      headers: headers(connection, { host: options.host, json: options.body !== undefined }),
      body: options.form ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
      signal: controller.signal,
    });
  } catch (failure) {
    if (failure instanceof BackendError) throw failure;
    throw new BackendError("network", "De lokale server is niet bereikbaar.", null);
  } finally {
    clearTimeout(timer);
  }
  const text = response.status === 204 ? "" : await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!response.ok) {
    // Most routes send { code, message }; a few send only { error: "some_code" }.
    const bare = str(payload, "error");
    const code = str(payload, "code") ?? str(payload, "name") ?? (bare && /^[a-z0-9_]+$/.test(bare) ? bare : null) ?? (response.status === 404 ? "not_found" : "request_failed");
    const detail = str(payload, "message") ?? str(payload, "error");
    throw new BackendError(code, SERVER_MESSAGES[code] ?? `De lokale server weigerde dit verzoek (fout ${response.status}).`, response.status, detail);
  }
  return payload;
}

/** True when the route exists (anything but 404/405). */
export async function probe(connection: Connection, path: string): Promise<boolean> {
  try {
    await request(connection, path, { timeoutMs: 5_000 });
    return true;
  } catch (failure) {
    return failure instanceof BackendError && failure.status !== null && failure.status !== 404 && failure.status !== 405;
  }
}

export const enc = encodeURIComponent;
