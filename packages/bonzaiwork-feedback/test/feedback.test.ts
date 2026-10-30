import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import { createFeedbackRoutes, type DiagnosticsSource } from "../src/index.ts";
import { environmentSecrets, redactReport } from "../src/redact.ts";
import { tailFile } from "../src/routes.ts";

const root = mkdtempSync(join(tmpdir(), "bonzaiwork-feedback-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const SERVER_TOKEN = "owner-token-value-123456";

function source(files: string[], screenshot: Uint8Array | null = PNG): DiagnosticsSource {
  return { captureWindow: async () => screenshot, logFiles: () => files, saveDirectory: () => root };
}

function call(routes: ReturnType<typeof createFeedbackRoutes>, path: string, body: unknown, params: Record<string, string> = {}) {
  const route = routes.find((candidate) => candidate.path === path);
  if (!route) throw new Error(`no route ${path}`);
  return route.handle(new Request(`http://127.0.0.1${path}`, { method: "POST", body: JSON.stringify(body) }), params);
}

describe("redactReport", () => {
  test("removes keys, tokens, mails and the home folder", () => {
    const text = [
      "key sk-live-virtual-key-0001 used",
      "authorization: Bearer abc.def-ghi",
      `token ${SERVER_TOKEN}`,
      "mail susan@example.nl",
      `path ${join(homedir(), "Projecten", "offerte.docx")}`,
      "mac /Users/susan/Documents, linux /home/susan/x, windows C:\\Users\\Susan\\Desktop",
      `random ${"a1B2".repeat(12)}`,
    ].join("\n");
    const clean = redactReport(text, [SERVER_TOKEN]);
    expect(clean).not.toContain("sk-live");
    expect(clean).not.toContain("abc.def");
    expect(clean).not.toContain(SERVER_TOKEN);
    expect(clean).not.toContain("susan@example.nl");
    expect(clean).not.toContain(homedir());
    expect(clean).not.toMatch(/susan/i);
    expect(clean).not.toContain("a1B2a1B2");
    expect(clean).toContain("Bearer [redacted]");
    expect(clean).toContain("[email]");
    expect(clean).toContain("~/Documents");
  });

  test("keeps ordinary log lines and paths readable", () => {
    const line = "2026-10-30T10:00:00Z info engine started at /opt/bonzaiwork/resources/app.asar/electron/main.mjs (ses_01HXYZ)";
    expect(redactReport(line, [])).toBe(line);
  });

  test("reads secret-looking environment variables", () => {
    expect(environmentSecrets({ OPENWORK_TOKEN: "abcdefgh12", HOME: "/home/x", API_KEY: "short" })).toEqual(["abcdefgh12"]);
  });
});

describe("tailFile", () => {
  test("returns the last lines without a half line", async () => {
    const file = join(root, "long.log");
    writeFileSync(file, Array.from({ length: 1000 }, (_, index) => `line ${index}`).join("\n"));
    const tail = await tailFile(file, 64, 3);
    expect(tail).toBe("line 997\nline 998\nline 999");
    expect(await tailFile(join(root, "missing.log"))).toBeNull();
  });
});

describe("feedback routes", () => {
  test("collect returns a redacted report and save writes it with the screenshot", async () => {
    const log = join(root, "openwork-server.log");
    writeFileSync(log, `started\nupstream rejected sk-user-virtual-key-0001\ntoken ${SERVER_TOKEN}\n`);
    const routes = createFeedbackRoutes({ source: source([log, join(root, "absent.log")]), secrets: () => [SERVER_TOKEN] });

    const collected = await call(routes, "/bonzaiwork/feedback/collect", { notes: "BonzaiWork 0.1.0\nUI-fout voor susan@example.nl" });
    expect(collected.status).toBe(200);
    const report = (await collected.json()) as { id: string; logs: string; screenshot: string | null };
    expect(report.screenshot).toStartWith("data:image/png;base64,");
    expect(report.logs).toStartWith("Systeem: ");
    expect(report.logs).toContain("BonzaiWork 0.1.0");
    expect(report.logs).toContain("== openwork-server.log");
    expect(report.logs).not.toContain("absent.log");
    expect(report.logs).not.toContain("sk-user");
    expect(report.logs).not.toContain(SERVER_TOKEN);
    expect(report.logs).not.toContain("susan@example.nl");

    const saved = await call(routes, "/bonzaiwork/feedback/:id/save", { screenshot: true }, { id: report.id });
    const { folder, files } = (await saved.json()) as { folder: string; files: string[] };
    expect(files).toEqual(["screenshot.png", "logs.txt"]);
    expect(folder.startsWith(root)).toBe(true);
    expect(readFileSync(join(folder, "logs.txt"), "utf8")).toBe(`${report.logs}\n`);
    expect(new Uint8Array(readFileSync(join(folder, "screenshot.png")))).toEqual(PNG);

    // Saving twice never overwrites the first folder.
    const again = (await (await call(routes, "/bonzaiwork/feedback/:id/save", { screenshot: false }, { id: report.id })).json()) as { folder: string; files: string[] };
    expect(again.folder).not.toBe(folder);
    expect(again.files).toEqual(["logs.txt"]);
    expect(existsSync(join(again.folder, "screenshot.png"))).toBe(false);
  });

  test("works without a window or logs, and rejects an unknown report", async () => {
    const routes = createFeedbackRoutes({ source: source([], null) });
    const report = (await (await call(routes, "/bonzaiwork/feedback/collect", {})).json()) as { id: string; logs: string; screenshot: string | null };
    expect(report.screenshot).toBeNull();
    expect(report.logs).toEndWith("Geen logbestanden gevonden.");
    const missing = await call(routes, "/bonzaiwork/feedback/:id/save", {}, { id: "nope" });
    expect(missing.status).toBe(404);
  });
});
