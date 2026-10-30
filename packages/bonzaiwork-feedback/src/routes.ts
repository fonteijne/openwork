import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, open, writeFile } from "node:fs/promises";
import { release } from "node:os";
import { basename, join } from "node:path";

import { headlessDiagnosticsSource, registeredDiagnosticsSource, type DiagnosticsSource } from "./diagnostics.ts";
import { environmentSecrets, redactReport } from "./redact.ts";

/**
 * openwork-server hook routes for issue #9 (docs/bonzaiwork/feedback.md): the
 * UI collects a report before its dialog opens, shows it, and saves it to a
 * folder the person drags into the GitHub form. Nothing leaves the machine
 * from here; the person submits the issue themselves.
 */

export type FeedbackRoute = {
  method: string;
  path: string;
  auth: "client";
  handle(request: Request, params: Record<string, string>): Promise<Response>;
};

export type FeedbackRoutesOptions = {
  source?: DiagnosticsSource;
  /** Extra values to remove besides the environment's secrets (tests). */
  secrets?: () => readonly string[];
  now?: () => Date;
};

type Report = { id: string; createdAt: number; logs: string; screenshot: Uint8Array | null };

const TAIL_BYTES = 256 * 1024;
const TAIL_LINES = 300;
const NOTES_LIMIT = 16_000;
const BODY_LIMIT = 64 * 1024;
const KEEP_REPORTS = 5;
const REPORT_TTL_MS = 30 * 60_000;

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { "cache-control": "no-store" } });
}

function failure(status: number, code: string, message: string): Response {
  return json({ code, message }, status);
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text || text.length > BODY_LIMIT) return {};
  try {
    const body: unknown = JSON.parse(text);
    return typeof body === "object" && body !== null && !Array.isArray(body) ? Object.fromEntries(Object.entries(body)) : {};
  } catch {
    return {};
  }
}

/** The last lines of a log file, without the line the byte window cut in half. */
export async function tailFile(path: string, bytes = TAIL_BYTES, lines = TAIL_LINES): Promise<string | null> {
  let handle;
  try {
    handle = await open(path, "r");
    const { size } = await handle.stat();
    const start = Math.max(0, size - bytes);
    const buffer = Buffer.alloc(size - start);
    await handle.read(buffer, 0, buffer.length, start);
    const all = buffer.toString("utf8").split(/\r?\n/);
    if (start > 0) all.shift();
    while (all.length && !all[all.length - 1]) all.pop();
    return all.slice(-lines).join("\n");
  } catch {
    return null;
  } finally {
    await handle?.close();
  }
}

async function collectLogs(files: readonly string[]): Promise<string> {
  const sections: string[] = [];
  for (const file of files) {
    const content = await tailFile(file);
    if (content !== null) sections.push(`== ${basename(file)} (laatste ${TAIL_LINES} regels) ==\n${content || "(leeg)"}`);
  }
  return sections.length ? sections.join("\n\n") : "Geen logbestanden gevonden.";
}

const PLATFORMS: Record<string, string> = { darwin: "macOS", win32: "Windows", linux: "Linux" };

/** "macOS 15.1 (arm64), Electron 43.7.5": Electron knows the marketing version, Node only the kernel's. */
export function systemSummary(): string {
  const systemVersion = Reflect.get(process, "getSystemVersion");
  const version = typeof systemVersion === "function" ? String(Reflect.apply(systemVersion, process, [])) : release();
  const electron = process.versions.electron;
  return `${PLATFORMS[process.platform] ?? process.platform} ${version} (${process.arch})${electron ? `, Electron ${electron}` : ""}`;
}

function stamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

async function freshFolder(parent: string, name: string): Promise<string> {
  for (let attempt = 1; ; attempt += 1) {
    const folder = join(parent, attempt === 1 ? name : `${name}-${attempt}`);
    if (!existsSync(folder)) {
      await mkdir(folder, { recursive: true });
      return folder;
    }
  }
}

export function createFeedbackRoutes(options: FeedbackRoutesOptions = {}): FeedbackRoute[] {
  // Resolved per request: the Electron entry registers its source before the server starts, tests pass one.
  const source = () => options.source ?? registeredDiagnosticsSource() ?? headlessDiagnosticsSource;
  const secrets = () => [...environmentSecrets(), ...(options.secrets?.() ?? [])];
  const now = options.now ?? (() => new Date());
  const reports = new Map<string, Report>();

  function remember(report: Report) {
    for (const [id, stored] of reports) {
      if (report.createdAt - stored.createdAt > REPORT_TTL_MS) reports.delete(id);
    }
    reports.set(report.id, report);
    while (reports.size > KEEP_REPORTS) reports.delete(reports.keys().next().value ?? "");
  }

  async function collect(request: Request): Promise<Response> {
    const body = await readBody(request);
    const notes = typeof body.notes === "string" ? body.notes.slice(0, NOTES_LIMIT).trim() : "";
    const diagnostics = source();
    const [screenshot, logs] = await Promise.all([
      diagnostics.captureWindow().catch(() => null),
      collectLogs(diagnostics.logFiles()),
    ]);
    const system = systemSummary();
    const report: Report = {
      id: randomUUID(),
      createdAt: now().getTime(),
      logs: redactReport([`Systeem: ${system}`, notes, logs].filter(Boolean).join("\n\n"), secrets()),
      screenshot: screenshot && screenshot.byteLength ? screenshot : null,
    };
    remember(report);
    return json({
      id: report.id,
      system,
      logs: report.logs,
      screenshot: report.screenshot ? `data:image/png;base64,${Buffer.from(report.screenshot).toString("base64")}` : null,
    });
  }

  async function save(request: Request, id: string): Promise<Response> {
    const report = reports.get(id);
    if (!report) return failure(404, "feedback_not_found", "This feedback report expired; collect a new one.");
    const body = await readBody(request);
    const withScreenshot = body.screenshot !== false && report.screenshot !== null;
    try {
      const folder = await freshFolder(source().saveDirectory(), `BonzaiWork-feedback-${stamp(new Date(report.createdAt))}`);
      await writeFile(join(folder, "logs.txt"), `${report.logs}\n`, "utf8");
      if (withScreenshot && report.screenshot) await writeFile(join(folder, "screenshot.png"), report.screenshot);
      return json({ folder, files: withScreenshot ? ["screenshot.png", "logs.txt"] : ["logs.txt"] });
    } catch {
      return failure(500, "feedback_save_failed", "The feedback files could not be written.");
    }
  }

  return [
    { method: "POST", path: "/bonzaiwork/feedback/collect", auth: "client", handle: (request) => collect(request) },
    { method: "POST", path: "/bonzaiwork/feedback/:id/save", auth: "client", handle: (request, params) => save(request, params.id ?? "") },
  ];
}
