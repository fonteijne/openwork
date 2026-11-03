import { describe, expect, it } from "vitest";

import { copy } from "./copy";

/** Every user-visible string in the copy table, with its path ("settings.usageLocked"). */
function strings(value: unknown, path: string, out: Array<[string, string]>): Array<[string, string]> {
  if (typeof value === "string") out.push([path, value]);
  else if (typeof value === "function") {
    // Call with plain arguments: most copy functions take a name, a count or both.
    try {
      const result: unknown = value("x", 2, "y");
      if (typeof result === "string") out.push([path, result]);
    } catch {
      // A function that needs a specific argument shape is checked by its own feature test.
    }
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) strings(child, path ? `${path}.${key}` : key, out);
  }
  return out;
}

describe("copy", () => {
  it("never names the vendor, the workspace or MCP to the person (brief §10, C3)", () => {
    // Keys may carry engine names (`litellm_unreachable` is an error kind); values never do.
    const offending = strings(copy, "", []).filter(([, text]) => /litellm|\bworkspace\b|\bMCP\b/i.test(text));
    expect(offending).toEqual([]);
  });
});
