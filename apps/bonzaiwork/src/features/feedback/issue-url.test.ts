import { describe, expect, test } from "vitest";

import { issueTitle, issueUrl } from "./issue-url";

describe("issueUrl", () => {
  test("opens the category's form with the text and environment filled in", () => {
    const url = new URL(issueUrl({ repo: "acme/app", category: "bug", message: "  Chat blijft hangen\nna Versturen", environment: "- BonzaiWork: 0.1.0" }));
    expect(url.origin + url.pathname).toBe("https://github.com/acme/app/issues/new");
    expect(url.searchParams.get("template")).toBe("bonzaiwork-bug.yml");
    expect(url.searchParams.get("title")).toBe("Chat blijft hangen");
    expect(url.searchParams.get("beschrijving")).toBe("Chat blijft hangen\nna Versturen");
    expect(url.searchParams.get("omgeving")).toBe("- BonzaiWork: 0.1.0");
    expect(new URL(issueUrl({ repo: "acme/app", category: "idea", message: "x", environment: "" })).searchParams.get("template")).toBe("bonzaiwork-idee.yml");
  });

  test("keeps the URL short", () => {
    const url = issueUrl({ repo: "acme/app", category: "idea", message: "a".repeat(10_000), environment: "" });
    expect(url.length).toBeLessThan(2_400);
  });

  test("titles come from the first line", () => {
    expect(issueTitle("\n\n  Eerste   regel \nTweede")).toBe("Eerste regel");
    expect(issueTitle("")).toBe("Feedback");
    expect(issueTitle("b".repeat(200))).toHaveLength(80);
  });
});
