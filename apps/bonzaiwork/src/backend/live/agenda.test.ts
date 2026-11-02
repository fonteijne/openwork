import { describe, expect, it } from "vitest";

import { createAgendaClient, readDay, readSettings } from "./agenda";

describe("agenda readers", () => {
  it("reads a day view and drops what is not a quarter", () => {
    const day = readDay(
      {
        date: "2026-11-02",
        now: { workspaceId: "w-a", label: "Project A", since: 1 },
        quarters: [
          { key: "2026-11-02T09:00", start: 1, end: 2, kind: "project", workspaceId: "w-a", projectName: "Project A", label: "Project A", bridgePost: { entityId: "<ENTITY_ID_A>", label: null }, source: "measured", shared: ["Project B", 3], chats: [], note: null, reference: null, appClosed: false, current: true },
          { key: "kapot" },
        ],
        blocks: [{ start: 1, end: 2, quarters: 1, kind: "weird", label: "Away from BonzaiWork" }],
        totals: [{ bridgePost: null, label: "Project D", minutes: 30 }],
        missingPosts: 2,
      },
      "2026-11-02",
    );
    expect(day.now).toEqual({ workspaceId: "w-a", label: "Project A", since: 1 });
    expect(day.quarters).toHaveLength(1);
    expect(day.quarters[0]?.shared).toEqual(["Project B"]);
    expect(day.quarters[0]?.bridgePost).toEqual({ entityId: "<ENTITY_ID_A>", label: null });
    expect(day.blocks[0]?.kind).toBe("away");
    expect(day.missingPosts).toBe(2);
  });

  it("reads settings with projects and recent posts", () => {
    const settings = readSettings({ enabled: false, projects: [{ workspaceId: "w-a", name: "Project A", bridgePost: null }, { name: "zonder id" }], recentPosts: [{ entityId: "<ENTITY_ID_B>", label: "Intern overleg" }, {}] });
    expect(settings).toEqual({ enabled: false, projects: [{ workspaceId: "w-a", name: "Project A", bridgePost: null }], recentPosts: [{ entityId: "<ENTITY_ID_B>", label: "Intern overleg" }] });
  });

  it("sends presence with the client token and never throws", async () => {
    const calls: Array<{ path: string; options: unknown }> = [];
    const client = createAgendaClient(async (path, options) => {
      calls.push({ path, options });
      throw new Error("offline");
    }, { available: true });
    await expect(client.reportPresence({ projectId: "w-a", name: "Project A" })).resolves.toBeUndefined();
    expect(calls[0]?.path).toBe("/bonzaiwork/agenda/presence");
    expect(calls[0]?.options).toMatchObject({ method: "POST", body: { workspaceId: "w-a", name: "Project A" } });
    expect(calls[0]?.options).not.toHaveProperty("host");
  });

  it("explains a server without the agenda instead of calling it", async () => {
    let called = false;
    const client = createAgendaClient(async () => {
      called = true;
      return null;
    }, { available: false });
    await expect(client.day()).rejects.toMatchObject({ code: "agenda_unavailable" });
    await client.reportPresence({ projectId: null, name: null });
    expect(called).toBe(false);
  });
});
