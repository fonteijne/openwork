import { describe, expect, it } from "vitest";

import type { Project } from "~/backend/types";

import { pickerProjects, rowForDigit } from "./new-chat-model";

const project = (id: string, name = id, description: string | null = null): Project => ({
  id,
  name,
  path: `/p/${id}`,
  description,
  color: "jade",
  icon: "folder",
  pinned: false,
  archivedAt: null,
  key: { hasKey: true, keyHint: "…1234" },
  defaultModel: null,
  allowedModels: null,
});

const ids = (rows: readonly Project[]) => rows.map((row) => row.id);

describe("pickerProjects", () => {
  const projects = [project("a", "Offertes 2026"), project("b", "Financiën", "Kwartaalcijfers"), project("c", "Werving")];

  it("puts the current project first and keeps the sidebar order for the rest", () => {
    expect(ids(pickerProjects(projects, "c", ""))).toEqual(["c", "a", "b"]);
    expect(ids(pickerProjects(projects, null, ""))).toEqual(["a", "b", "c"]);
    expect(ids(pickerProjects(projects, "gone", ""))).toEqual(["a", "b", "c"]);
  });

  it("filters on every typed word, in the name or the description, without accents", () => {
    expect(ids(pickerProjects(projects, null, "financien"))).toEqual(["b"]);
    expect(ids(pickerProjects(projects, null, "kwartaal fin"))).toEqual(["b"]);
    expect(ids(pickerProjects(projects, "c", "2026 werving"))).toEqual([]);
    expect(ids(pickerProjects(projects, "c", "  "))).toEqual(["c", "a", "b"]);
  });
});

describe("rowForDigit", () => {
  const rows = [project("a"), project("b")];

  it("chooses the row at that position", () => {
    expect(rowForDigit("Digit1", rows)?.id).toBe("a");
    expect(rowForDigit("Digit2", rows)?.id).toBe("b");
  });
  it("ignores a digit without a row and any other key", () => {
    expect(rowForDigit("Digit3", rows)).toBeNull();
    expect(rowForDigit("Digit0", rows)).toBeNull();
    expect(rowForDigit("KeyN", rows)).toBeNull();
  });
});
