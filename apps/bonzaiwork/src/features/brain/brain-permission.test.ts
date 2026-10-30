import { describe, expect, it } from "vitest";

import type { Message, PermissionRequest, ToolPart } from "~/backend/types";
import { describeTool } from "~/lib/tools";

import { brainOfRequest, isBrainRead, userNamedBrain } from "./brain-permission";

const tool = (name: string, input: Record<string, unknown>, status: ToolPart["status"] = "running"): ToolPart => ({
  type: "tool", id: name, tool: name, status, input, output: null, error: null, startedAt: null, endedAt: null, childChatId: null,
});
const message = (role: Message["role"], parts: Message["parts"]): Message => ({
  id: `${role}-${parts.length}`, chatId: "c", role, createdAt: 0, completedAt: null, parts, model: null, tokens: null, error: null,
});
const request: PermissionRequest = { id: "p", chatId: "c", action: "breinen_brein_lezen", resources: ["*"], canAlways: true, message: null };

describe("reading another brain", () => {
  it("is recognised by the engine action, not the personal brain", () => {
    expect(isBrainRead(request)).toBe(true);
    expect(isBrainRead({ ...request, action: "breinen_brein_zoeken" })).toBe(true);
    expect(isBrainRead({ ...request, action: "breinen_persoonlijk_brein_lezen" })).toBe(false);
    expect(isBrainRead({ ...request, action: "edit" })).toBe(false);
  });

  it("takes the brain from the newest matching tool call", () => {
    const messages = [
      message("user", [{ type: "text", id: "t", text: "Hoe maken we een offerte?" }]),
      message("assistant", [
        tool("breinen_persoonlijk_brein_lezen", { pad: "x.md" }, "completed"),
        tool("breinen_brein_lezen", { brein: "Klantenservice", pad: "a.md" }, "completed"),
        tool("breinen_brein_lezen", { brein: "Sales", pad: "knowledge/offerteproces.md" }),
      ]),
    ];
    expect(brainOfRequest(request, messages)).toBe("Sales");
    expect(userNamedBrain("Sales", messages)).toBe(false);
    expect(userNamedBrain("Sales", [message("user", [{ type: "text", id: "t", text: "Kijk in het sales-brein" }])])).toBe(true);
  });

  it("says in words what was read, and where", () => {
    expect(describeTool(tool("breinen_brein_lezen", { brein: "Sales", pad: "knowledge/offerteproces.md" }, "completed"))).toMatchObject({ verb: "Las", object: "offerteproces.md in het brein Sales" });
    expect(describeTool(tool("breinen_brein_zoeken", { brein: "Sales", vraag: "korting" }))).toMatchObject({ verb: "Zoekt in het brein Sales naar", object: '"korting"' });
    expect(describeTool(tool("breinen_persoonlijk_brein_lezen", { pad: "Projecten/a.md" }, "completed"))).toMatchObject({ object: "a.md in je persoonlijke brein" });
  });
});
