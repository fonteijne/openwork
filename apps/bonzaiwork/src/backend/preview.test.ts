import { describe, expect, it } from "vitest";

import { chatPreview, cutAt, plainText } from "./preview";
import type { Message } from "./types";

const assistant = (id: string, text: string | null, error = false): Message => ({
  id,
  chatId: "c",
  role: "assistant",
  createdAt: 1,
  completedAt: 2,
  parts: text === null ? [] : [{ type: "text", id: `${id}:t`, text }],
  model: null,
  tokens: null,
  error: error ? { kind: "budget_exceeded", detail: null } : null,
});
const user = (id: string, text: string): Message => ({ id, chatId: "c", role: "user", createdAt: 1, completedAt: 1, parts: [{ type: "text", id: `${id}:t`, text }], model: null, tokens: null, error: null });

describe("plainText", () => {
  it("drops headings, tables, code and markup but keeps the words", () => {
    const text = plainText("**Week 44: 4 offertes verstuurd, 1 akkoord**\n\n| Klant | Bedrag |\n|---|---|\n| A | 1 |\n\n```\ncode\n```\n\n- De *grootste* is [Mertens](https://x).\n\n---\n\n> Zal ik `opvolgmails` voorbereiden?");
    expect(text).toBe("Week 44: 4 offertes verstuurd, 1 akkoord. De grootste is Mertens. Zal ik opvolgmails voorbereiden?");
  });
});

describe("plainText joins paragraphs as sentences", () => {
  it("puts a boundary after a heading and after a paragraph without closing punctuation", () => {
    const week = "**Week 44: 4 offertes verstuurd, 1 akkoord**\n\n| Klant |\n|---|\n| A |\n\n**Opvallend**\n\n- De offerte voor Mertens is de grootste.\n\n**Openstaand:** 2 offertes";
    expect(plainText(week)).toBe("Week 44: 4 offertes verstuurd, 1 akkoord. Opvallend: De offerte voor Mertens is de grootste. Openstaand: 2 offertes");
    expect(plainText("Hier is een voorstel:\n\nOnderwerp: Offerte webshop\n\nBeste Marieke,\n\nDank voor je vraag.")).toBe("Hier is een voorstel: Onderwerp: Offerte webshop. Beste Marieke, Dank voor je vraag.");
  });
});

describe("cutAt", () => {
  it("cuts at a word boundary with an ellipsis", () => {
    expect(cutAt("Een korte zin.", 20)).toBe("Een korte zin.");
    expect(cutAt("Ik heb de offerte opgesteld volgens het sjabloon en opgeslagen, zoals gevraagd.", 40)).toBe("Ik heb de offerte opgesteld volgens het…");
  });
});

describe("chatPreview", () => {
  it("reads the last assistant text, skipping turns without text", () => {
    expect(chatPreview([user("u", "Hoi"), assistant("a1", "Eerste **antwoord**."), user("u2", "Nog een"), assistant("a2", "## Kop\n\nTweede antwoord.")])).toBe("Kop: Tweede antwoord.");
    expect(chatPreview([user("u", "Hoi"), assistant("a1", "Eerste antwoord."), assistant("a2", null)])).toBe("Eerste antwoord.");
  });

  it("is null for a chat that only failed or has no assistant turn", () => {
    expect(chatPreview([user("u", "Hoi"), assistant("a1", null, true)])).toBeNull();
    expect(chatPreview([user("u", "Hoi")])).toBeNull();
    expect(chatPreview([])).toBeNull();
  });
});
