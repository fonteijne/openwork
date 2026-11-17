import { describe, expect, it } from "vitest";

import { closeOpenMarkdown, externalLinkHref, webLinkHref } from "./markdown";

describe("closeOpenMarkdown", () => {
  it("closes emphasis and code the stream has not closed yet", () => {
    expect(closeOpenMarkdown("Je vroeg: *zeg")).toBe("Je vroeg: *zeg*");
    expect(closeOpenMarkdown("Een **vet")).toBe("Een **vet**");
    expect(closeOpenMarkdown("Draai `pnpm")).toBe("Draai `pnpm`");
    expect(closeOpenMarkdown("```ts\nconst a = 1")).toBe("```ts\nconst a = 1\n```");
  });

  it("leaves finished text and list bullets alone", () => {
    expect(closeOpenMarkdown("Een **vet** woord")).toBe("Een **vet** woord");
    expect(closeOpenMarkdown("Lijst:\n* eerste")).toBe("Lijst:\n* eerste");
    expect(closeOpenMarkdown("Klaar.")).toBe("Klaar.");
  });
});

describe("externalLinkHref", () => {
  it("opens web and mail links", () => {
    expect(externalLinkHref("https://forms.office.com/r/abc?x=1")).toBe("https://forms.office.com/r/abc?x=1");
    expect(externalLinkHref(" http://example.com ")).toBe("http://example.com/");
    expect(externalLinkHref("mailto:party@example.com")).toBe("mailto:party@example.com");
  });

  it("ignores anchors, relative paths and other schemes", () => {
    expect(externalLinkHref(null)).toBeNull();
    expect(externalLinkHref("")).toBeNull();
    expect(externalLinkHref("#kop")).toBeNull();
    expect(externalLinkHref("./notities.md")).toBeNull();
    expect(externalLinkHref("javascript:alert(1)")).toBeNull();
    expect(externalLinkHref("file:///etc/passwd")).toBeNull();
  });
});

describe("webLinkHref", () => {
  it("takes web pages, the links the desktop shell would take over", () => {
    expect(webLinkHref("https://team.slack.com/archives/C1/p1700000000000100")).toBe("https://team.slack.com/archives/C1/p1700000000000100");
    expect(webLinkHref(" http://example.com ")).toBe("http://example.com/");
  });

  it("leaves mail, anchors, files and other schemes alone", () => {
    for (const other of ["mailto:party@example.com", "#kop", "./notities.md", "slack://channel?id=C1", "javascript:alert(1)", "", null, undefined]) {
      expect(webLinkHref(other)).toBeNull();
    }
  });
});
