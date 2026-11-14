import { readChatStart, readConnectors, readFocus, readSettings, readTodo, readView } from "@bonzaiwork/today/model";

import { BackendError, type TodayBackend, type TodaySettingsView } from "../types";

import { enc, type request } from "./http";
import { bool, field } from "./read";

/**
 * The Vandaag routes of packages/bonzaiwork-today (docs/bonzaiwork/persoonlijke-agent-plan.md).
 * Reading with the client token, changing with the host token. The answers are read with the
 * package's own readers, so the app and the server agree on every shape.
 */
type Request = (path: string, options?: Parameters<typeof request>[2]) => Promise<unknown>;

const BASE = "/bonzaiwork/today";

function settingsView(value: unknown): TodaySettingsView {
  return { settings: readSettings(field(value, "settings")), killed: bool(value, "killed") ?? false };
}

const invalid = () => new BackendError("invalid_response", "De lokale server gaf een onverwacht antwoord. Probeer het opnieuw.");

export function createTodayClient(req: Request, options: { available: boolean }): TodayBackend {
  const host = { host: true };
  const unavailable = () => new BackendError("today_unavailable", "Deze versie van de lokale server heeft de persoonlijke agent nog niet. Werk BonzaiWork bij.", 404);
  const guard = <T>(run: () => Promise<T>): Promise<T> => (options.available ? run() : Promise.reject(unavailable()));
  const post = (path: string, body: unknown = {}, timeoutMs?: number) => req(`${BASE}${path}`, { method: "POST", body, ...host, ...(timeoutMs ? { timeoutMs } : {}) });
  const todo = (value: unknown) => {
    const found = readTodo(field(value, "todo"));
    if (!found) throw invalid();
    return found;
  };
  const chat = (value: unknown) => {
    const found = readChatStart(value);
    if (!found) throw invalid();
    return found;
  };
  return {
    view: () => guard(async () => readView(await req(BASE))),
    settings: () => guard(async () => settingsView(await req(`${BASE}/settings`))),
    setSettings: (patch) => guard(async () => settingsView(await req(`${BASE}/settings`, { method: "PUT", body: patch, ...host }))),
    // The first call may start the MS365 server and the Slack script: give them time.
    checkConnectors: () => guard(async () => readConnectors(field(await post("/connectors/check", {}, 90_000), "connectors"))),
    addTodo: (input) => guard(async () => todo(await post("/todos", input))),
    setDone: (todoId, done) => guard(async () => void (await post(`/todos/${enc(todoId)}/done`, { done }))),
    skip: (todoId) => guard(async () => void (await post(`/todos/${enc(todoId)}/skip`))),
    park: (text) => guard(async () => void (await post("/park", { text }))),
    focus: (todoId, chatId) =>
      guard(async () => {
        const answer = await post("/focus", { todoId, ...(chatId ? { chatId } : {}) });
        const focus = readFocus(field(answer, "focus"));
        if (!focus) throw invalid();
        return { focus, chat: chat(field(answer, "chat")) };
      }),
    stopFocus: () => guard(async () => void (await req(`${BASE}/focus`, { method: "DELETE", ...host }))),
    send: (key, text) => guard(async () => void (await post("/items/send", { key, ...(text === null ? {} : { text }) }, 90_000))),
    dismiss: (key) => guard(async () => void (await post("/items/dismiss", { key }))),
    later: (key) => guard(async () => void (await post("/items/later", { key }))),
    accept: (key) => guard(async () => todo(await post("/items/accept", { key }))),
    decidePlan: (decision) => guard(async () => void (await post("/plan", { decision }))),
    closeDay: (todoId) => guard(async () => void (await post("/close", todoId ? { todoId } : {}))),
    cleanup: (brainId) => guard(async () => chat(await post("/cleanup", { brainId }))),
    runRound: (system) => guard(async () => void (await post("/rounds/run", { system }, 60_000))),
  };
}
