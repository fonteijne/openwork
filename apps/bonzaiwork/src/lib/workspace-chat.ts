import { LITELLM_PROVIDER_ID } from "@bonzaiwork/policy";

import { pickDirectory } from "@/app/lib/desktop";
import { createClientV2 } from "@/app/lib/opencode-v2-adapter";
import { createOpenworkServerClient, type OpenworkWorkspaceInfo } from "@/app/lib/openwork-server";
import { isElectronRuntime } from "@/app/lib/runtime-env";
import { resolveWorkspaceEndpoint } from "@/app/lib/workspace-endpoint";

import type { ServerConnection } from "./connection";

/**
 * Workspaces and chat on top of upstream's framework-free clients
 * (apps/app/src/app/lib). Nothing here imports their React tree, Den or
 * analytics code.
 */

export type Workspace = Pick<OpenworkWorkspaceInfo, "id" | "name" | "path" | "displayName">;

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  pending: boolean;
  failed: boolean;
};

function serverClient(connection: ServerConnection) {
  return createOpenworkServerClient({ baseUrl: connection.baseUrl, token: connection.token, hostToken: connection.hostToken ?? undefined });
}

export async function listWorkspaces(connection: ServerConnection): Promise<Workspace[]> {
  const list = await serverClient(connection).listWorkspaces();
  return list.items.filter((item) => item.workspaceType === "local");
}

/** Asks for a folder (desktop) and registers it as a workspace. */
export async function chooseWorkspaceFolder(): Promise<string | null> {
  if (!isElectronRuntime()) return null;
  const picked = await pickDirectory({ title: "Map van de workspace" });
  return Array.isArray(picked) ? picked[0] ?? null : picked;
}

export async function createWorkspace(connection: ServerConnection, folderPath: string): Promise<Workspace[]> {
  const name = folderPath.split(/[\\/]/).filter(Boolean).at(-1) ?? "Workspace";
  await serverClient(connection).createLocalWorkspace({ folderPath, name, preset: "starter" });
  return listWorkspaces(connection);
}

/**
 * The workspace's OpenCode v2 engine. `/opencode` is upstream's v1 mount;
 * only v2 enforces the LiteLLM-only policy, so chat never goes there.
 */
function engineBaseUrl(connection: ServerConnection, workspace: Workspace): string | null {
  const endpoint = resolveWorkspaceEndpoint(workspace, { baseUrl: connection.baseUrl, token: connection.token });
  return endpoint ? `${endpoint.mountedBaseUrl}/opencode2` : null;
}

function engineClient(connection: ServerConnection, workspace: Workspace) {
  const baseUrl = engineBaseUrl(connection, workspace);
  if (!baseUrl) throw new Error("De workspace is niet bereikbaar.");
  return createClientV2(baseUrl, workspace.path, { token: connection.token });
}

function readError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    const data = Reflect.get(error, "data");
    const message = typeof data === "object" && data !== null ? Reflect.get(data, "message") : Reflect.get(error, "message");
    if (typeof message === "string") return message;
  }
  return "Onbekende fout";
}

type EngineMessage = {
  info: { id: string; role: string; time: { created: number; completed?: number }; error?: unknown };
  parts: ReadonlyArray<{ type: string; text?: string; synthetic?: boolean }>;
};

function toChatMessage(message: EngineMessage): ChatMessage {
  const text = message.parts.flatMap((part) => (part.type === "text" && !part.synthetic && part.text ? [part.text] : [])).join("");
  const assistant = message.info.role === "assistant";
  return {
    id: message.info.id,
    role: assistant ? "assistant" : "user",
    text,
    pending: assistant && message.info.time.completed === undefined && !message.info.error,
    failed: Boolean(message.info.error),
  };
}

export async function startChat(connection: ServerConnection, workspace: Workspace, modelId: string): Promise<string> {
  const result = await engineClient(connection, workspace).session.create({
    directory: workspace.path,
    model: { providerID: LITELLM_PROVIDER_ID, id: modelId },
  });
  if (!result.data) throw new Error(readError(result.error));
  return result.data.id;
}

export async function sendMessage(connection: ServerConnection, workspace: Workspace, sessionId: string, modelId: string, text: string): Promise<void> {
  const client = engineClient(connection, workspace);
  const result = await client.session.promptAsync({
    sessionID: sessionId,
    directory: workspace.path,
    model: { providerID: LITELLM_PROVIDER_ID, modelID: modelId },
    parts: [{ type: "text", text }],
  });
  if (result.error) throw new Error(readError(result.error));
}

/** The newest engine entry says whether the run is still going: an `idle` entry closes it. */
async function readRunState(connection: ServerConnection, workspace: Workspace, sessionId: string): Promise<{ busy: boolean; failed: boolean }> {
  const baseUrl = engineBaseUrl(connection, workspace);
  if (!baseUrl) return { busy: false, failed: false };
  const response = await fetch(`${baseUrl}/api/session/${encodeURIComponent(sessionId)}/message?limit=1`, {
    headers: { Authorization: `Bearer ${connection.token}` },
  });
  const payload: unknown = await response.json().catch(() => null);
  const data = typeof payload === "object" && payload !== null ? Reflect.get(payload, "data") : undefined;
  const newest: unknown = Array.isArray(data) ? data[0] : undefined;
  const type = typeof newest === "object" && newest !== null ? Reflect.get(newest, "type") : undefined;
  const outcome = typeof newest === "object" && newest !== null ? Reflect.get(newest, "outcome") : undefined;
  if (type === "idle") return { busy: false, failed: outcome === "failed" };
  return { busy: newest !== undefined, failed: false };
}

export async function readMessages(connection: ServerConnection, workspace: Workspace, sessionId: string): Promise<{ messages: ChatMessage[]; busy: boolean; failed: boolean }> {
  const client = engineClient(connection, workspace);
  const [history, run] = await Promise.all([
    client.session.messages({ sessionID: sessionId, directory: workspace.path }),
    readRunState(connection, workspace, sessionId),
  ]);
  if (!history.data) throw new Error(readError(history.error));
  const messages = history.data.map(toChatMessage).filter((message) => message.text || message.failed || (run.busy && message.pending));
  return { messages, busy: run.busy, failed: run.failed };
}
