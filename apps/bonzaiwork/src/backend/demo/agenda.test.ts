import { describe, expect, it } from "vitest";

import { createDemoAgenda, DEMO_AGENDA } from "./agenda";

const PROJECTS = [
  { id: DEMO_AGENDA.main, name: "Project A" },
  { id: DEMO_AGENDA.second, name: "Project C" },
  { id: DEMO_AGENDA.withoutPost, name: "Project D" },
];

/** Thursday 2026-11-05, 15:40 local time. */
const NOW = new Date(2026, 10, 5, 15, 40).getTime();

function demo() {
  return createDemoAgenda({ storageKey: "test", withProjects: true, projects: () => PROJECTS, now: () => NOW });
}

describe("demo agenda", () => {
  it("has a day with away, a meeting, a shared quarter and a project without a post", async () => {
    const day = await demo().day("2026-11-04");
    const labels = day.blocks.map((block) => block.label);
    expect(labels).toContain("Away from BonzaiWork");
    expect(labels).toContain("Project D");
    expect(day.quarters.some((quarter) => quarter.shared.includes("Project C"))).toBe(true);
    expect(day.missingPosts).toBeGreaterThan(0);
    expect(day.blocks.some((block) => block.kind === "away" && block.appClosed)).toBe(true);
    expect(day.blocks.some((block) => block.kind === "away" && !block.appClosed)).toBe(true);
    // Monday of this week has the meeting as a correction with a post.
    const monday = await demo().day("2026-11-02");
    expect(monday.blocks.find((block) => block.kind === "other")).toMatchObject({ label: "Meeting sprintplanning", source: "user", bridgePost: { entityId: "<ENTITY_ID_B>" } });
  });

  it("stops today at now and shows what is current", async () => {
    const agenda = demo();
    await agenda.reportPresence({ projectId: DEMO_AGENDA.second, name: "Project C" });
    const today = await agenda.day();
    expect(today.date).toBe("2026-11-05");
    expect(today.quarters.at(-1)?.current).toBe(true);
    expect(today.now).toMatchObject({ workspaceId: DEMO_AGENDA.second, label: "Project C" });
  });

  it("changes quarters and undoes the change", async () => {
    const agenda = demo();
    const { undoId } = await agenda.setQuarters({
      date: "2026-11-04",
      from: "2026-11-04T11:00",
      to: "2026-11-04T11:45",
      correction: { kind: "other", label: "Meeting team", bridgePost: { entityId: "<ENTITY_ID_B>", label: "Intern overleg" } },
      note: "Planning",
    });
    let day = await agenda.day("2026-11-04");
    const meeting = day.blocks.find((block) => block.label === "Meeting team");
    expect(meeting).toMatchObject({ quarters: 4, source: "user", notes: ["Planning"] });
    await agenda.undo(undoId);
    day = await agenda.day("2026-11-04");
    expect(day.blocks.some((block) => block.label === "Meeting team")).toBe(false);
    await expect(agenda.undo(undoId)).rejects.toMatchObject({ code: "undo_not_found" });
  });

  it("rejects quarters of another day and posts with spaces", async () => {
    const agenda = demo();
    await expect(agenda.setQuarters({ date: "2026-11-04", from: "2026-11-03T11:00", to: "2026-11-04T11:00", correction: { kind: "away" } })).rejects.toMatchObject({ code: "invalid_quarters" });
    await expect(agenda.setProjectPost(DEMO_AGENDA.withoutPost, { entityId: "met spatie", label: null })).rejects.toMatchObject({ code: "invalid_post" });
  });

  it("writes the booking document of fase 1, with placeholders only", async () => {
    const text = await demo().bookingDocument("2026-11-02", "2026-11-05");
    expect(text).toContain("# Uren uit BonzaiWork: 2026-11-02 t/m 2026-11-05");
    expect(text).toContain("## Instructies voor de assistent");
    expect(text).toContain("`<ENTITY_ID_A>`");
    expect(text).toContain("Zonder Bridge-post");
    const json = /```json\n([\s\S]+?)\n```/.exec(text)?.[1] ?? "";
    expect(() => JSON.parse(json)).not.toThrow();
    await expect(demo().bookingDocument("2026-10-01", "2026-11-05")).rejects.toMatchObject({ code: "period_too_long" });
  });
});
