import { afterEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { BrainCloneError } from "../src/sync.ts";
import { createWorld, fail, failing, type World } from "./world.ts";

let world: World;
afterEach(async () => { await world?.dispose(); });

const log = async (w: World, format = "%an|%s") => (await w.git.ok(["log", "--format=" + format, "main"], { cwd: w.bare })).trim().split("\n");
const onServer = async (w: World, path: string) => (await w.git.run(["show", `main:${path}`], { cwd: w.bare })).stdout;

describe("twee gebruikers op één brein", () => {
  test("A deelt na een beurt, B ziet het vóór zijn beurt", async () => {
    world = await createWorld();
    const a = await world.user("Anna");
    const b = await world.user("Bram");
    await a.write("knowledge/offertes.md", "Offertes gaan via de teamleider.\n");
    const turn = await a.sync.finishTurn({ title: "Offerteproces  vastleggen", chatId: "ses_1" });
    expect(turn).toMatchObject({ committed: true, shared: true });
    expect(turn.status.state).toBe("synced");
    const [message] = (await world.git.ok(["log", "-1", "--format=%B", "main"], { cwd: world.bare })).split("\n\n");
    expect(message).toBe("Offerteproces vastleggen");
    expect(await world.git.ok(["log", "-1", "--format=%an <%ae>%n%(trailers:key=BonzaiWork-Chat,valueonly)", "main"], { cwd: world.bare }))
      .toContain("Anna <anna@example.invalid>\nses_1");

    const before = await b.sync.prepareTurn();
    expect(before.state).toBe("synced");
    expect(await readFile(join(b.path, "knowledge/offertes.md"), "utf8")).toContain("teamleider");
  });

  test("eigen wijzigingen en die van de AI komen in aparte commits", async () => {
    world = await createWorld();
    const a = await world.user("Anna");
    await a.write("knowledge/eigen.md", "Zelf getypt in Obsidian.\n");
    await a.sync.prepareTurn();
    await a.write("knowledge/ai.md", "Door de AI.\n");
    await a.sync.finishTurn({ title: "Beurt", chatId: "ses_2" });
    expect((await log(world, "%s")).slice(0, 2)).toEqual(["Beurt", "Eigen wijzigingen"]);
    expect(await world.git.ok(["show", "--name-only", "--format=", "main~1"], { cwd: world.bare })).toContain("knowledge/eigen.md");
  });

  test("wie later deelt, haalt eerst op en deelt dan ook", async () => {
    world = await createWorld();
    const a = await world.user("Anna");
    const b = await world.user("Bram");
    await a.write("knowledge/a.md", "A\n");
    await b.write("knowledge/b.md", "B\n");
    await a.sync.finishTurn({ title: "A", chatId: "ses_a" });
    const second = await b.sync.finishTurn({ title: "B", chatId: "ses_b" });
    expect(second.shared).toBe(true);
    expect(await onServer(world, "knowledge/a.md")).toBe("A\n");
    expect(await onServer(world, "knowledge/b.md")).toBe("B\n");
  });
});

describe("conflict", () => {
  test("niets gaat verloren, en 'Bewaar mijn versie apart' zet de map terug", async () => {
    world = await createWorld();
    await world.seed({ "knowledge/korting.md": "Korting: 10%\n" });
    const a = await world.user("Anna");
    const b = await world.user("Bram");
    await a.write("knowledge/korting.md", "Korting: 15%\n");
    await a.sync.finishTurn({ title: "A", chatId: "ses_a" });
    await b.write("knowledge/korting.md", "Korting: 20%\n");
    const turn = await b.sync.finishTurn({ title: "B", chatId: "ses_b" });
    expect(turn.shared).toBe(false);
    expect(turn.status.state).toBe("conflict");
    expect(turn.status.conflictFiles).toEqual(["knowledge/korting.md"]);
    expect(turn.status.conflictBy).toBe("Anna");
    // B's version is still committed locally.
    expect(await world.git.ok(["show", "HEAD:knowledge/korting.md"], { cwd: b.path })).toBe("Korting: 20%\n");
    // Updating pauses; the folder keeps B's version meanwhile.
    expect((await b.sync.prepareTurn()).state).toBe("conflict");

    const apart = await b.sync.keepMineApart();
    expect(apart.branch).toMatch(/^bonzaiwork\/bram\/\d{8}-\d{4}$/);
    expect((await world.git.ok(["show", `${apart.branch}:knowledge/korting.md`], { cwd: world.bare }))).toBe("Korting: 20%\n");
    expect(await readFile(join(b.path, "knowledge/korting.md"), "utf8")).toBe("Korting: 15%\n");
    expect(apart.status.state).toBe("synced");
  });
});

describe("offline en zonder schrijfrechten", () => {
  test("offline blijven commits lokaal en worden later vanzelf gedeeld", async () => {
    world = await createWorld();
    let offline = true;
    const git = failing(world.git, (args) => offline && (args.includes("push") || args.includes("fetch"))
      ? fail("ssh: Could not resolve hostname gitlab.com: Name or service not known\nfatal: Could not read from remote repository.") : null);
    const a = await world.user("Anna", { git, retryDelaysMs: [50] });
    await a.write("knowledge/trein.md", "Geschreven in de trein.\n");
    const turn = await a.sync.finishTurn({ title: "Trein", chatId: "ses_t" });
    expect(turn).toMatchObject({ committed: true, shared: false });
    expect(turn.status).toMatchObject({ state: "offline", ahead: 1 });
    expect(turn.status.error).toContain("weer online");
    offline = false;
    for (let attempt = 0; attempt < 80 && (await a.sync.status()).state !== "synced"; attempt += 1) await Bun.sleep(25);
    expect((await a.sync.status()).state).toBe("synced");
    expect(await onServer(world, "knowledge/trein.md")).toBe("Geschreven in de trein.\n");
    a.sync.dispose();
  });

  test("een beschermde branch geeft 'alleen lezen', de commit blijft", async () => {
    world = await createWorld();
    let protectedBranch = true;
    const git = failing(world.git, (args) => protectedBranch && args.includes("push")
      ? fail("remote: GitLab: You are not allowed to push code to protected branches on this project.\nTo gitlab.com:team/brein.git\n ! [remote rejected] HEAD -> main (pre-receive hook declined)") : null);
    const a = await world.user("Anna", { git });
    await a.write("knowledge/x.md", "x\n");
    const turn = await a.sync.finishTurn({ title: "X", chatId: "ses_x" });
    expect(turn.status).toMatchObject({ state: "read_only", ahead: 1 });
    protectedBranch = false;
    expect((await a.sync.share()).state).toBe("synced");
  });

  test("modus alleen lezen: bijwerken wel, vastleggen nooit", async () => {
    world = await createWorld();
    const a = await world.user("Anna", { mode: "read_only" });
    await a.write("knowledge/lokaal.md", "lokaal\n");
    await world.seed({ "knowledge/nieuw.md": "nieuw\n" });
    expect((await a.sync.prepareTurn()).state).toBe("read_only");
    expect(existsSync(join(a.path, "knowledge/nieuw.md"))).toBe(true);
    expect(await readFile(join(a.path, "knowledge/lokaal.md"), "utf8")).toBe("lokaal\n");
    expect((await a.sync.finishTurn({ title: "x", chatId: "s" })).committed).toBe(false);
    expect(await onServer(world, "knowledge/lokaal.md")).toBe("");
  });
});

describe("wat er meegaat", () => {
  test("alleen Markdown vanzelf, gewijzigde gedeelde bestanden wel, inbox en te groot nooit", async () => {
    world = await createWorld();
    await world.seed({ ".opencode/skills/pptx/maak.py": "print(1)\n" });
    const a = await world.user("Anna", { sizeLimitBytes: 1000 });
    await a.write("knowledge/ok.md", "ok\n");
    await a.write("presentatie.pptx", "binary");
    await a.write(".opencode/skills/pptx/maak.py", "print(2)\n");
    await a.write(".opencode/openwork/inbox/bijlage.md", "privé\n");
    await a.write("knowledge/groot.md", "x".repeat(2000));
    await a.write("workflows/offerte/01_intake/output/run.md", "per run\n");
    const turn = await a.sync.finishTurn({ title: "Mix", chatId: "ses_m" });
    expect(turn.shared).toBe(true);
    const files = (await world.git.ok(["show", "--name-only", "--format=", "main"], { cwd: world.bare })).trim().split("\n").sort();
    expect(files).toEqual([".opencode/skills/pptx/maak.py", "knowledge/ok.md"]);
    expect(turn.status.unshared).toEqual([
      { path: "knowledge/groot.md", reason: "too_large" },
      { path: "presentatie.pptx", reason: "not_markdown" },
    ]);
  });

  test("een geheim blokkeert de hele commit", async () => {
    world = await createWorld();
    const a = await world.user("Anna");
    await a.write("knowledge/ok.md", "ok\n");
    await a.write("knowledge/notitie.md", "sleutel:\n-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n");
    const turn = await a.sync.finishTurn({ title: "Geheim", chatId: "ses_g" });
    expect(turn).toMatchObject({ committed: false, shared: false, blockedBy: "knowledge/notitie.md" });
    expect(turn.status.state).toBe("error");
    expect(turn.status.error).toContain("knowledge/notitie.md");
    expect(await onServer(world, "knowledge/ok.md")).toBe("");
    // Removing it clears the problem with the next turn.
    await a.write("knowledge/notitie.md", "zonder sleutel\n");
    expect((await a.sync.finishTurn({ title: "Opgeruimd", chatId: "ses_g" })).status.state).toBe("synced");
  });
});

describe("vertrouwen (plan §7.1)", () => {
  test("riskante onderdelen staan pas in de map na akkoord, en opnieuw na een wijziging", async () => {
    world = await createWorld();
    await world.seed({
      ".opencode/plugins/p.js": "export default {}\n",
      "opencode.json": JSON.stringify({ mcp: { rogue: { type: "local", command: ["x"] } } }),
      ".opencode/commands/shell.md": "Uit: !`ls`\n",
      ".opencode/commands/verwerk.md": "Verwerk $ARGUMENTS\n",
      ".opencode/agents/ruim.md": "agent\n",
    });
    const a = await world.user("Anna");
    const status = await a.sync.status();
    expect(status.state).toBe("needs_trust");
    expect(status.pendingTrust.map((item) => `${item.kind}:${item.path}`).sort()).toEqual([
      "agent:.opencode/agents/ruim.md", "command:.opencode/commands/shell.md", "config:opencode.json", "plugin:.opencode/plugins/p.js",
    ]);
    expect(a.sync.untrustedMcpServers).toEqual(["rogue"]);
    for (const path of [".opencode/plugins/p.js", "opencode.json", ".opencode/commands/shell.md", ".opencode/agents/ruim.md"]) {
      expect(existsSync(join(a.path, path))).toBe(false);
    }
    expect(existsSync(join(a.path, ".opencode/commands/verwerk.md"))).toBe(true);

    // Sharing still works and keeps the excluded files on the server.
    await a.write("knowledge/x.md", "x\n");
    await a.sync.finishTurn({ title: "x", chatId: "s" });
    expect(await onServer(world, ".opencode/plugins/p.js")).toBe("export default {}\n");

    const trusted = await a.sync.trust(status.pendingTrust.map((item) => item.path));
    expect(trusted.pendingTrust).toEqual([]);
    expect(existsSync(join(a.path, ".opencode/plugins/p.js"))).toBe(true);
    expect(a.sync.untrustedMcpServers).toEqual([]);

    await world.seed({ ".opencode/plugins/p.js": "export default { changed: true }\n" });
    const after = await a.sync.prepareTurn();
    expect(after.pendingTrust.map((item) => item.path)).toEqual([".opencode/plugins/p.js"]);
    expect(existsSync(join(a.path, ".opencode/plugins/p.js"))).toBe(false);
    expect(existsSync(join(a.path, "opencode.json"))).toBe(true);
  });

  test("een plugin die de AI zelf maakt, gaat niet vanzelf mee", async () => {
    world = await createWorld();
    const a = await world.user("Anna");
    await a.write(".opencode/plugins/nieuw.js", "export default {}\n");
    await a.write(".opencode/agents/nieuw.md", "agent\n");
    await a.write("knowledge/x.md", "x\n");
    const turn = await a.sync.finishTurn({ title: "x", chatId: "s" });
    expect(turn.shared).toBe(true);
    expect(await onServer(world, ".opencode/agents/nieuw.md")).toBe("");
  });
});

describe("git-veiligheid (plan §7.4)", () => {
  test("hooks in .git draaien niet bij de sync", async () => {
    world = await createWorld();
    const a = await world.user("Anna");
    const marker = join(world.root, "hook-ran");
    await writeFile(join(a.path, ".git/hooks/pre-commit"), `#!/bin/sh\ntouch "${marker}"\n`);
    await chmod(join(a.path, ".git/hooks/pre-commit"), 0o755);
    await a.write("knowledge/x.md", "x\n");
    expect((await a.sync.finishTurn({ title: "x", chatId: "s" })).shared).toBe(true);
    expect(existsSync(marker)).toBe(false);
  });

  test("een gewijzigde .git/config stopt alles tot 'Herstellen'", async () => {
    world = await createWorld();
    const a = await world.user("Anna");
    const config = join(a.path, ".git/config");
    await writeFile(config, `${await readFile(config, "utf8")}[core]\n\tfsmonitor = /tmp/evil\n`);
    await world.seed({ "knowledge/nieuw.md": "nieuw\n" });
    const stopped = await a.sync.prepareTurn();
    expect(stopped.state).toBe("error");
    expect(stopped.error).toContain("Herstellen");
    expect(existsSync(join(a.path, "knowledge/nieuw.md"))).toBe(false);
    expect((await a.sync.repair()).state).not.toBe("error");
    expect(await readFile(config, "utf8")).not.toContain("evil");
    await a.sync.prepareTurn();
    expect(existsSync(join(a.path, "knowledge/nieuw.md"))).toBe(true);
  });

  test("een andere remote of branch stopt de sync", async () => {
    world = await createWorld();
    const a = await world.user("Anna");
    await world.git.ok(["checkout", "-q", "-b", "ander"], { cwd: a.path });
    expect((await a.sync.prepareTurn()).error).toContain("andere versie");
    expect((await a.sync.repair()).state).toBe("synced");
  });

  test("een herschreven gedeelde geschiedenis: niets wordt verstuurd", async () => {
    world = await createWorld();
    await world.seed({ "knowledge/a.md": "a\n" }, "tweede");
    const a = await world.user("Anna");
    // Someone force-pushes the server back one commit, outside BonzaiWork.
    const shared = (await world.raw(["rev-parse", "HEAD"])).stdout.trim();
    await world.raw(["reset", "-q", "--hard", "HEAD~1"]);
    await world.raw(["push", "-q", "--force", "origin", "HEAD:refs/heads/main"]);
    await a.write("knowledge/b.md", "b\n");
    const before = await a.sync.prepareTurn();
    expect(before.state).toBe("error");
    expect(before.error).toContain("herschreven");
    const turn = await a.sync.finishTurn({ title: "b", chatId: "s" });
    expect(turn.shared).toBe(false);
    expect(await onServer(world, "knowledge/b.md")).toBe("");
    expect(await onServer(world, "knowledge/a.md")).toBe("");
    // "Herstellen" checks again: still rewritten, still stopped.
    await a.sync.repair();
    expect((await a.sync.prepareTurn()).error).toContain("herschreven");
    // The administrator puts the history back; after "Herstellen" it is shared again.
    await world.raw(["push", "-q", "--force", "origin", `${shared}:refs/heads/main`]);
    await a.sync.repair();
    const after = await a.sync.prepareTurn();
    expect(after.error).toBeNull();
    expect((await a.sync.finishTurn({ title: "b", chatId: "s" })).shared).toBe(true);
    expect(await onServer(world, "knowledge/a.md")).toBe("a\n");
  });
});

describe("toevoegen", () => {
  test("niet in een map die al iets bevat", async () => {
    world = await createWorld();
    const target = join(world.root, "kapot");
    await mkdir(target, { recursive: true });
    await writeFile(join(target, "iets.md"), "x");
    const notEmpty = await world.user("kapot").catch((error: unknown) => error);
    expect(notEmpty).toBeInstanceOf(BrainCloneError);
    expect(notEmpty instanceof BrainCloneError && notEmpty.problem).toBe("not_empty");
  });

  test("een lege repo: de eerste beurt maakt de eerste commit", async () => {
    world = await createWorld({ empty: true });
    const a = await world.user("Anna");
    expect((await a.sync.status()).state).toBe("synced");
    await a.write("AGENTS.md", "# Nieuw brein\n");
    const turn = await a.sync.finishTurn({ title: "Begin", chatId: "s" });
    expect(turn.shared).toBe(true);
    expect(await onServer(world, "AGENTS.md")).toBe("# Nieuw brein\n");
  });

  test("clonen van een plek die niet bestaat", async () => {
    world = await createWorld();
    const error = await createWorldUserFrom(world, `file://${join(world.root, "bestaat-niet.git")}`).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BrainCloneError);
    expect(error instanceof BrainCloneError && error.problem).toBe("not_found");
    expect(existsSync(join(world.root, "nergens"))).toBe(false);
  });
});

async function createWorldUserFrom(w: World, remote: string) {
  const { BrainSync } = await import("../src/sync.ts");
  return BrainSync.clone({
    git: w.git, id: "x", kind: "project", mode: "auto", remote, path: join(w.root, "nergens"),
    author: () => ({ name: "x", email: "x@example.invalid" }), save: async () => {},
  });
}
