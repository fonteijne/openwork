import { describe, expect, it } from "vitest";

import type { ToolPart } from "~/backend/types";

import { describeTool, toolSentence } from "./tools";

const execute = (code: string, status: ToolPart["status"] = "completed", tool = "execute"): ToolPart => ({
  type: "tool", id: "call", tool, status, input: { code }, output: null, error: null, startedAt: null, endedAt: null, childChatId: null,
});

describe("connection activity in Code Mode", () => {
  it("names the connection and the action that ran", () => {
    const label = describeTool(execute(`const r = await tools.ms365["list-calendar-events"]({ top: 10 }); return r`));
    expect(label).toMatchObject({ kind: "connection", verb: "Gebruikte Microsoft 365:", object: "list calendar events", service: "Microsoft 365" });
    expect(describeTool(execute(`return tools["linear"].list_issues({})`, "running"))).toMatchObject({ verb: "Gebruikt Linear:", object: "list issues" });
  });

  it("counts further distinct actions instead of listing them", () => {
    const code = `const a = await tools.ms365.list_mail({}); const b = await tools.ms365.list_mail({}); await tools.slack['post-message']({}); await tools.github.get_issue({})`;
    expect(toolSentence(execute(code, "completed", "openwork_execute"))).toBe("Gebruikte Microsoft 365: list mail en 2 andere acties");
  });

  it("says where it looked when it only searched", () => {
    expect(toolSentence(execute(`const r = search({query:"list calendar events", namespace:"ms365", limit:10}); return r`))).toBe('Zocht in Microsoft 365 naar "list calendar events"');
    expect(describeTool(execute(`return search({ query: 'open issues' })`, "running"))).toMatchObject({ verb: "Zoekt in je connecties naar", object: '"open issues"', service: null });
  });

  it("keeps the general sentence when the script says nothing recognisable", () => {
    expect(toolSentence(execute("return 1 + 1"))).toBe("Werkte met je connecties");
    expect(toolSentence({ ...execute(""), input: { id: "automation.propose" } })).toBe("Werkte met je connecties");
  });
});
