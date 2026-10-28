import { afterEach, describe, expect, it, vi } from "vitest";

import { BackendError } from "../types";
import { request } from "./http";

const connection = { baseUrl: "http://127.0.0.1:1", token: "t", hostToken: null };

function serverReplies(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })));
}

async function failure(path: string): Promise<BackendError> {
  try {
    await request(connection, path);
  } catch (error) {
    if (error instanceof BackendError) return error;
    throw error;
  }
  throw new Error("expected the request to fail");
}

describe("server errors", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("says known codes in Dutch and keeps the server's sentence aside", async () => {
    serverReplies(503, { code: "mcp_tools_not_ready", message: "This connection is saved, but its tools are not ready yet. Retry." });
    const error = await failure("/workspace/w/mcp");
    expect(error.code).toBe("mcp_tools_not_ready");
    expect(error.status).toBe(503);
    expect(error.message).toBe("De connectie is opgeslagen, maar de tools zijn nog niet klaar. Probeer het zo opnieuw.");
    expect(error.detail).toContain("not ready");
  });

  it("never shows an unknown code's English sentence", async () => {
    serverReplies(409, { code: "drive_conflict", message: "The Drive file changed" });
    const error = await failure("/x");
    expect(error.message).toBe("De lokale server weigerde dit verzoek (fout 409).");
  });

  it("waits while the engine is still starting, then answers", async () => {
    let calls = 0;
    vi.stubGlobal("fetch", vi.fn(async () => {
      calls += 1;
      return calls < 3
        ? new Response(JSON.stringify({ error: "engine_v2_preview_not_running" }), { status: 503 })
        : new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));
    expect(await request(connection, "/workspace/w/opencode2/api/session")).toEqual({ ok: true });
    expect(calls).toBe(3);
  });

  it("reads a bare 404 as not found", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    expect((await failure("/missing")).code).toBe("not_found");
  });
});
