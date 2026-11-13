import { afterEach, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { createWorld, type World } from "./world.ts";

/**
 * To-dos in a brain (docs/bonzaiwork/persoonlijke-agent-plan.md §2, §7): the notation with `@name`
 * and a date emoji goes through every check before a commit, and two people ticking boxes in the
 * same file is handled by the sync as it is.
 */
let world: World;
afterEach(async () => { await world?.dispose(); });

const onServer = async (w: World, path: string) => (await w.git.run(["show", `main:${path}`], { cwd: w.bare })).stdout;

const TODOS = "# Taken\n\n- [ ] Offerte sturen @anna 📅 2026-11-20\n- [ ] Reactie van de leverancier @bram ⏳ 2026-11-19\n- [ ] Demo voorbereiden\n";
const concept = "---\ntype: Process\ntitle: Offerteproces\ndescription: Hoe een offerte de deur uit gaat.\n---\n# Offerteproces\n\n- [ ] Voorbeeld toevoegen @anna 📅 2026-12-01\n";

describe("taken in een brein", () => {
  test("de notatie komt door de OKF- en geheimencontrole, ook in een concept en met team.md", async () => {
    world = await createWorld();
    await world.seed({ "knowledge/index.md": "---\nokf_version: \"0.2\"\n---\n# Kennis\n" });
    const a = await world.user("Anna");
    await a.write("taken.md", TODOS);
    await a.write("team.md", "# Team\n\n| Naam | Wie |\n|---|---|\n| @anna | Anna <anna@example.invalid> |\n| @bram | Bram <bram@example.invalid> |\n");
    await a.write("knowledge/offerteproces.md", concept);
    const status = await a.sync.recordOwn();
    expect(status.state).toBe("synced");
    expect(status.error ?? null).toBeNull();
    expect(await onServer(world, "taken.md")).toBe(TODOS);
    expect(await onServer(world, "team.md")).toContain("@bram");
    expect(await onServer(world, "knowledge/offerteproces.md")).toContain("- [ ] Voorbeeld toevoegen @anna 📅 2026-12-01");
  });

  test("een taak afvinken buiten een chat wordt vastgelegd als eigen wijziging; handmatig deelt niet vanzelf", async () => {
    world = await createWorld();
    await world.seed({ "taken.md": TODOS });
    const a = await world.user("Anna");
    await a.write("taken.md", TODOS.replace("- [ ] Offerte sturen", "- [x] Offerte sturen"));
    expect((await a.sync.recordOwn()).state).toBe("synced");
    expect(await onServer(world, "taken.md")).toContain("- [x] Offerte sturen @anna");
    expect((await world.git.ok(["log", "-1", "--format=%an|%s", "main"], { cwd: world.bare })).trim()).toBe("Anna|Eigen wijzigingen");

    const manual = await world.user("Mila", { mode: "manual" });
    await manual.write("taken.md", (await readFile(join(manual.path, "taken.md"), "utf8")).replace("- [ ] Demo voorbereiden", "- [x] Demo voorbereiden"));
    expect((await manual.sync.recordOwn()).state).toBe("ahead");
    expect(await onServer(world, "taken.md")).toContain("- [ ] Demo voorbereiden");
  });

  test("twee mensen vinken dezelfde regel af: geen conflict, één vinkje", async () => {
    world = await createWorld();
    await world.seed({ "taken.md": TODOS });
    const a = await world.user("Anna");
    const b = await world.user("Bram");
    const ticked = TODOS.replace("- [ ] Demo voorbereiden", "- [x] Demo voorbereiden");
    await a.write("taken.md", ticked);
    await b.write("taken.md", ticked);
    expect((await a.sync.recordOwn()).state).toBe("synced");
    const second = await b.sync.recordOwn();
    expect(second.state).toBe("synced");
    expect(await onServer(world, "taken.md")).toBe(ticked);
    expect(await readFile(join(b.path, "taken.md"), "utf8")).toBe(ticked);
  });

  test("twee mensen vinken verschillende regels af in hetzelfde bestand: beide blijven staan", async () => {
    world = await createWorld();
    // Enough lines between the two boxes that git sees two separate changes.
    const spaced = "# Taken\n\n- [ ] Offerte sturen @anna\n\n## Later\n\nNog te plannen.\n\nZie ook de planning.\n\n- [ ] Demo voorbereiden @bram\n";
    await world.seed({ "taken.md": spaced });
    const a = await world.user("Anna");
    const b = await world.user("Bram");
    await a.write("taken.md", spaced.replace("- [ ] Offerte", "- [x] Offerte"));
    await b.write("taken.md", spaced.replace("- [ ] Demo", "- [x] Demo"));
    expect((await a.sync.recordOwn()).state).toBe("synced");
    expect((await b.sync.recordOwn()).state).toBe("synced");
    const merged = await onServer(world, "taken.md");
    expect(merged).toContain("- [x] Offerte sturen @anna");
    expect(merged).toContain("- [x] Demo voorbereiden @bram");
  });

  test("de één vinkt af, de ander herschrijft dezelfde regel: het bestaande conflict, niets gaat verloren", async () => {
    world = await createWorld();
    await world.seed({ "taken.md": TODOS });
    const a = await world.user("Anna");
    const b = await world.user("Bram");
    await a.write("taken.md", TODOS.replace("- [ ] Demo voorbereiden", "- [x] Demo voorbereiden"));
    await b.write("taken.md", TODOS.replace("- [ ] Demo voorbereiden", "- [ ] Demo voorbereiden voor de klantdag @bram 📅 2026-11-25"));
    expect((await a.sync.recordOwn()).state).toBe("synced");
    const second = await b.sync.recordOwn();
    expect(second.state).toBe("conflict");
    expect(second.conflictFiles).toEqual(["taken.md"]);
    expect(second.conflictBy).toBe("Anna");
    // Bram's line is still his own, locally; the server has Anna's.
    expect(await readFile(join(b.path, "taken.md"), "utf8")).toContain("klantdag @bram 📅 2026-11-25");
    expect(await onServer(world, "taken.md")).toContain("- [x] Demo voorbereiden");
  });
});
