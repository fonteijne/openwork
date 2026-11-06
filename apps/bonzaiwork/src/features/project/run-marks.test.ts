import { describe, expect, it } from "vitest";

import { markRunText } from "./run-marks";

describe("markRunText", () => {
  it("turns an unsure sentence into a flagged mark", () => {
    expect(markRunText("| Lars | Toegang | [[let op: geen datum]] |")).toBe('| Lars | Toegang | <mark><span class="sr-only">Let op: </span>geen datum</mark> |');
  });

  it("underlines an addition and escapes what is inside", () => {
    expect(markRunText("Eén ++<b>nieuwe</b> zin++.")).toBe('Eén <ins><span class="sr-only">Toegevoegd: </span>&lt;b&gt;nieuwe&lt;/b&gt; zin</ins>.');
  });

  it("leaves plain Markdown alone", () => {
    expect(markRunText("1 + 1 = 2, **vet**")).toBe("1 + 1 = 2, **vet**");
  });
});
