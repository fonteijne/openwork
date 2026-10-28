import { describe, expect, it } from "vitest";

import { closeOpenMarkdown } from "./markdown";

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
