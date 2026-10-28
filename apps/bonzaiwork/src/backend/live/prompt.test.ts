import { describe, expect, it } from "vitest";

import { decodePrompt, encodePrompt } from "./prompt";

describe("v2 prompt encoding", () => {
  it("round-trips words and attachments in OpenWork's format", () => {
    const text = encodePrompt("Vat dit samen", [
      { filename: "offerte.pdf", workspacePath: ".opencode/openwork/inbox/chat-attachments/c1/x-offerte.pdf", url: "file:///p/.opencode/openwork/inbox/chat-attachments/c1/x-offerte.pdf", bytes: 20_480 },
    ]);
    expect(text).toContain("<attachment>offerte.pdf</attachment>");
    expect(text).toContain("<openwork-context>");
    expect(text).toContain("- offerte.pdf (20 KB): .opencode/openwork/inbox/chat-attachments/c1/x-offerte.pdf (file:///p/");
    expect(decodePrompt(text)).toEqual({ words: "Vat dit samen", files: ["offerte.pdf"] });
  });

  it("keeps plain prompts as they are and unwraps pasted text", () => {
    expect(encodePrompt("Hallo", [])).toBe("Hallo");
    expect(decodePrompt("Kijk: <pasted-text>\nregel 1\n</pasted-text> klaar")).toEqual({ words: "Kijk: regel 1 klaar", files: [] });
  });
});
