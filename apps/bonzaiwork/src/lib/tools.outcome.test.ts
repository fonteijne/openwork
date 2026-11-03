import { describe, expect, it } from "vitest";

import type { Message, ToolPart } from "~/backend/types";

import { deliveredFiles, describeTool, isRecoveredStep, patchFiles, touchedFiles, isFailedStep, isStoppedStep, isStoppedTurn, stepFixKind, unresolvedFailures } from "./tools";

const tool = (overrides: Partial<ToolPart>): ToolPart => ({
  type: "tool", id: "t", tool: "read", status: "completed", input: {}, output: null, error: null, startedAt: null, endedAt: null, childChatId: null, ...overrides,
});
const message = (parts: ToolPart[], error: Message["error"] = null): Message => ({ id: "m", chatId: "c", role: "assistant", createdAt: 0, completedAt: 1, parts, model: null, tokens: null, error });

describe("how a step ended", () => {
  it("tells a stop from a failure", () => {
    expect(isStoppedStep(tool({ status: "error", error: "Gestopt" }))).toBe(true);
    expect(isStoppedStep(tool({ status: "error", error: "aborted by user" }))).toBe(true);
    expect(isFailedStep(tool({ status: "error", error: "Gestopt" }))).toBe(false);
    expect(isFailedStep(tool({ status: "error", error: "Geweigerd" }))).toBe(false);
    expect(isFailedStep(tool({ status: "error", error: "ENOENT: no such file" }))).toBe(true);
  });

  it("calls a turn stopped only when nothing failed and a step was cut short", () => {
    expect(isStoppedTurn([message([tool({ status: "error", error: "Gestopt" })])])).toBe(true);
    expect(isStoppedTurn([message([tool({ status: "error", error: "Gestopt" }), tool({ status: "error", error: "boom" })])])).toBe(false);
    expect(isStoppedTurn([message([tool({ status: "error", error: "Gestopt" })], { kind: "unknown", detail: null })])).toBe(false);
    expect(isStoppedTurn([message([tool({})])])).toBe(false);
  });

  it("names the fix for common failures, nothing for the rest", () => {
    expect(stepFixKind(tool({ status: "error", error: "The file is password protected" }))).toBe("locked");
    expect(stepFixKind(tool({ status: "error", error: "ENOENT: no such file or directory" }))).toBe("missing");
    expect(stepFixKind(tool({ status: "error", error: "EACCES: permission denied" }))).toBe("access");
    expect(stepFixKind(tool({ status: "error", error: "401 Unauthorized" }))).toBe("signIn");
    expect(stepFixKind(tool({ status: "error", error: "Request timed out" }))).toBe("timeout");
    expect(stepFixKind(tool({ status: "error", error: "Something odd" }))).toBeNull();
  });
});

describe("what a turn delivered", () => {
  it("lists written and edited files, not the ones only read", () => {
    const files = deliveredFiles([
      message([tool({ tool: "read", input: { filePath: "a/sjabloon.md" } }), tool({ tool: "write", input: { filePath: "offertes/2026-031.md" } }), tool({ tool: "edit", input: { filePath: "prijslijst.md" } })]),
    ]);
    expect(files.map((file) => file.name)).toEqual(["2026-031.md", "prijslijst.md"]);
  });

  it("leaves out a write that failed", () => {
    expect(deliveredFiles([message([tool({ tool: "write", status: "error", error: "EACCES", input: { filePath: "x.md" } })])])).toEqual([]);
  });

  it("does not call a file changed while its write waits for permission or still runs", () => {
    const waiting = [message([tool({ tool: "read", input: { filePath: "prijslijst-2027.md" } }), tool({ tool: "write", status: "pending", input: { filePath: "prijslijst-2027.md" } })])];
    expect(deliveredFiles(waiting)).toEqual([]);
    expect(touchedFiles(waiting)).toEqual([{ path: "prijslijst-2027.md", name: "prijslijst-2027.md", changed: false }]);
    expect(deliveredFiles([message([tool({ tool: "edit", status: "running", input: { filePath: "x.md" } })])])).toEqual([]);
  });
});

describe("a patch", () => {
  const note = ".hermes/skills/agent/references/native-mcp.md";
  const patchText = `*** Begin Patch\n*** Update File: ${note}\n@@\n-      SOME_API_KEY: "value"\n+      SOME_API_KEY: "REDACTED"\n*** End Patch`;
  const failed = tool({ id: "p1", tool: "apply_patch", status: "error", input: { patchText }, error: `patch verification failed: Failed to find expected lines in ${note}` });
  const worked = tool({ id: "p2", tool: "apply_patch", status: "completed", input: { patchText }, output: "Success" });

  it("names the files of the patch", () => {
    expect(patchFiles(`*** Begin Patch\n*** Add File: a.md\n+x\n*** Update File: b.md\n*** Move to: c.md\n*** Delete File: d.md\n*** End Patch`)).toEqual(["a.md", "b.md", "c.md", "d.md"]);
    expect(describeTool(worked)).toMatchObject({ verb: "Wijzigde", object: "native-mcp.md", code: true });
    expect(describeTool(tool({ tool: "apply_patch", input: { patchText: "*** Update File: a.md\n*** Update File: b.md" } }))).toMatchObject({ object: "2 bestanden", code: false });
  });

  it("counts a patch that worked as a changed file", () => {
    expect(deliveredFiles([message([tool({ tool: "read", input: { filePath: note } }), worked])]).map((file) => file.name)).toEqual(["native-mcp.md"]);
    expect(deliveredFiles([message([failed])])).toEqual([]);
  });

  it("no longer shows a failed patch as the outcome once a later one changed the same file", () => {
    const steps = [failed, worked];
    expect(isRecoveredStep(failed, steps)).toBe(true);
    expect(unresolvedFailures(steps)).toEqual([]);
    // Failed last, or nothing changed the file afterwards: the failure stands.
    expect(unresolvedFailures([worked, failed])).toEqual([failed]);
    expect(unresolvedFailures([failed, tool({ tool: "read", input: { filePath: note } })])).toEqual([failed]);
    // A failure that is no file change is never "made good" by one.
    const shell = tool({ id: "s", tool: "bash", status: "error", error: "boom", input: { command: "ls" } });
    expect(unresolvedFailures([shell, worked])).toEqual([shell]);
  });
});
