import { describe, expect, it } from "vitest";

import { folderOf, markdownLinkTarget, projectRelativePath } from "./file-links";

const ROOT = "/Users/sam/Brain";

describe("markdownLinkTarget", () => {
  it("opens relative links to Markdown files in the project", () => {
    expect(markdownLinkTarget("Notes/Strategy%20-%20OpenCode%20Ready.md", ROOT)).toBe("Notes/Strategy - OpenCode Ready.md");
    expect(markdownLinkTarget("./README.md", ROOT)).toBe("README.md");
    expect(markdownLinkTarget("notes/plan.markdown#week-2", ROOT)).toBe("notes/plan.markdown");
  });

  it("opens absolute paths and file URLs inside the project folder", () => {
    expect(markdownLinkTarget("/Users/sam/Brain/Notes/Plan.md", ROOT)).toBe("Notes/Plan.md");
    expect(markdownLinkTarget("file:///Users/sam/Brain/Notes/Plan%20B.md", ROOT)).toBe("Notes/Plan B.md");
    expect(markdownLinkTarget("file:///C:/Users/Sam/Brain/Notes/Plan.md", "C:\\Users\\sam\\Brain")).toBe("Notes/Plan.md");
    expect(markdownLinkTarget("C:\\Users\\sam\\Brain\\Notes\\Plan.md", "C:\\Users\\sam\\Brain")).toBe("Notes/Plan.md");
  });

  it("resolves relative links from the folder of the file they are in", () => {
    expect(markdownLinkTarget("../Ideas.md", ROOT, "Notes/2026")).toBe("Notes/Ideas.md");
    expect(markdownLinkTarget("Week.md", ROOT, "Notes")).toBe("Notes/Week.md");
  });

  it("leaves websites, anchors, other files and paths outside the project alone", () => {
    expect(markdownLinkTarget("https://example.com/readme.md", ROOT)).toBeNull();
    expect(markdownLinkTarget("mailto:sam@example.com", ROOT)).toBeNull();
    expect(markdownLinkTarget("#week-2", ROOT)).toBeNull();
    expect(markdownLinkTarget("Notes/budget.xlsx", ROOT)).toBeNull();
    expect(markdownLinkTarget("/Users/sam/Other/Plan.md", ROOT)).toBeNull();
    expect(markdownLinkTarget("/Users/sam/Brainstorm/Plan.md", ROOT)).toBeNull();
    expect(markdownLinkTarget("../secrets.md", ROOT)).toBeNull();
    expect(markdownLinkTarget(null, ROOT)).toBeNull();
  });
});

describe("projectRelativePath", () => {
  it("keeps relative paths and strips the project folder from absolute ones", () => {
    expect(projectRelativePath("offertes/2026-034.md", ROOT)).toBe("offertes/2026-034.md");
    expect(projectRelativePath("/Users/sam/Brain/src/app.ts", ROOT)).toBe("src/app.ts");
    expect(projectRelativePath("/Users/sam/Brain/", ROOT)).toBeNull();
    expect(projectRelativePath("/etc/hosts", ROOT)).toBeNull();
  });
});

describe("folderOf", () => {
  it("gives the folder of a project path", () => {
    expect(folderOf("Notes/2026/Plan.md")).toBe("Notes/2026");
    expect(folderOf("Plan.md")).toBe("");
  });
});
