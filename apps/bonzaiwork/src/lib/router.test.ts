import { describe, expect, it } from "vitest";

import { href, parse, routeTab, settingsGroupOf } from "./router";

describe("routes (brief §3)", () => {
  it("opens on Vandaag and keeps the projects list at #/projecten", () => {
    expect(parse("#/")).toEqual({ name: "home" });
    expect(parse("")).toEqual({ name: "home" });
    expect(parse("#/vandaag")).toEqual({ name: "home" });
    expect(parse("#/projecten")).toEqual({ name: "projects" });
    expect(href({ name: "home" })).toBe("#/");
    expect(href({ name: "projects" })).toBe("#/projecten");
  });

  it("gives a project its tabs", () => {
    expect(parse("#/p/p-offertes")).toEqual({ name: "project-overview", projectId: "p-offertes" });
    expect(parse("#/p/p-offertes/chats")).toEqual({ name: "project", projectId: "p-offertes", chatId: null });
    expect(href({ name: "project", projectId: "p-offertes", chatId: null })).toBe("#/p/p-offertes/chats");
    expect(parse("#/p/p-offertes/todos")).toEqual({ name: "project-todos", projectId: "p-offertes" });
    expect(parse("#/p/p-offertes/afronden")).toEqual({ name: "project-complete", projectId: "p-offertes" });
    expect(routeTab(parse("#/p/p-offertes"))).toBe("overview");
    expect(parse("#/p/p-offertes/c/c-index")).toEqual({ name: "project", projectId: "p-offertes", chatId: "c-index" });
    expect(parse("#/p/p-offertes/bestanden")).toEqual({ name: "project-files", projectId: "p-offertes" });
    expect(parse("#/p/p-offertes/routines/r-week")).toEqual({ name: "project-routines", projectId: "p-offertes", routineId: "r-week" });
    expect(parse("#/p/p-offertes/brein")).toEqual({ name: "project-brain", projectId: "p-offertes" });
    expect(parse("#/p/p-offertes/instellingen/toegang")).toEqual({ name: "project-settings", projectId: "p-offertes", group: "toegang", section: null });
    expect(routeTab(parse("#/p/p-offertes/instellingen"))).toBe("settings");
  });

  it("keeps the old settings sections as aliases (decision S1)", () => {
    expect(parse("#/p/x/instellingen/key")).toEqual({ name: "project-settings", projectId: "x", group: "toegang", section: "key" });
    expect(parse("#/p/x/instellingen/connections")).toEqual({ name: "project-settings", projectId: "x", group: "toegang", section: "connections" });
    expect(parse("#/p/x/instellingen/files")).toEqual({ name: "project-files", projectId: "x" });
    expect(parse("#/p/x/instellingen/brain")).toEqual({ name: "project-brain", projectId: "x" });
    expect(href({ name: "project-settings", projectId: "x", section: "key" })).toBe("#/p/x/instellingen/toegang");
    expect(href({ name: "project-settings", projectId: "x", section: "files" })).toBe("#/p/x/bestanden");
    expect(href({ name: "project-settings", projectId: "x", section: "general" })).toBe("#/p/x/instellingen");
    expect(settingsGroupOf("activity")).toBe("technisch");
  });

  it("has the cockpit's pages, each with a round trip through href", () => {
    const routes = [
      { name: "plan" },
      { name: "agent", chatId: null },
      { name: "agent", chatId: "c-1" },
      { name: "inbox" },
      { name: "runs" },
      { name: "run", runId: "RUN-0417" },
      { name: "delegate", todoId: "t-3" },
      { name: "delegate", todoId: null },
      { name: "approval", approvalId: "OUT-0093" },
      { name: "library" },
      { name: "library-shelf", shelfId: "s-team" },
      { name: "library-page", pageId: "pg-privacy" },
      { name: "library-proposal", proposalId: "vs-12" },
      { name: "activity", view: "all" },
      { name: "activity", view: "sent" },
      { name: "project-new", fromProjectId: null, fromChatId: null },
      { name: "project-new", fromProjectId: "p-mijn-brein", fromChatId: "c-1" },
      { name: "settings", group: "verbindingen" },
    ] as const;
    for (const route of routes) expect(parse(href(route))).toEqual(route);
  });

  it("has app-level pages and a not-found route", () => {
    expect(parse("#/routines")).toEqual({ name: "routines", routineId: null });
    expect(parse("#/brein")).toEqual({ name: "brain" });
    expect(parse("#/instellingen")).toEqual({ name: "settings", group: null });
    expect(parse("#/instellingen/weergave")).toEqual({ name: "settings", group: "weergave" });
    expect(parse("#/welkom")).toEqual({ name: "onboarding" });
    expect(parse("#/bestaat-niet")).toEqual({ name: "not-found" });
    expect(parse("#/p/x/onbekend")).toEqual({ name: "not-found" });
    expect(href({ name: "settings" })).toBe("#/instellingen");
    expect(href({ name: "settings", group: "agenda" })).toBe("#/instellingen/agenda");
  });

  it("encodes ids", () => {
    expect(href({ name: "project", projectId: "a b", chatId: "c/d" })).toBe("#/p/a%20b/c/c%2Fd");
    expect(parse("#/p/a%20b/c/c%2Fd")).toEqual({ name: "project", projectId: "a b", chatId: "c/d" });
  });
});
