// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BackendProvider } from "~/backend/context";
import { createDemoBackend } from "~/backend/demo";
import { localDate, type SlackTodo, type SlackTodos } from "~/backend/types";
import { copy } from "~/copy";

import { slackTodoLate, slackTodosShown } from "./model";
import { SlackTodosSection } from "./today-sections";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

const today = localDate(Date.now());
const todo = (id: string, patch: Partial<SlackTodo> = {}): SlackTodo => ({
  id, kind: "message", text: `To-do ${id}`, author: "Mila Bakker", channel: "#sales", due: null, link: "https://team.slack.com/archives/C1/p1", createdAt: 0, ...patch,
});

let host: HTMLElement;
let root: Root;

function setup(todos: SlackTodos, compact = false) {
  const backend = createDemoBackend({ empty: false, keyMode: "workspace", engineV2: false, noPreferred: false });
  const done = vi.spyOn(backend.today, "setSlackTodoDone").mockResolvedValue(undefined);
  act(() => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <BackendProvider backend={backend}>
          <SlackTodosSection todos={todos} compact={compact} />
        </BackendProvider>
      </QueryClientProvider>,
    );
  });
  return { done };
}

const rows = () => Array.from(host.querySelectorAll('[data-testid="today-slack-todo"]'));

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("To-do's in Slack op Vandaag", () => {
  it("toont niets zonder to-do's en zonder fout", () => {
    setup({ items: [], error: null });
    expect(host.querySelector('[data-testid="home-slack-todos"]')).toBeNull();
  });

  it("een rij per to-do: tekst, wie en waar, de datum, en een link die opent", () => {
    setup({ items: [todo("message:C1:1.0", { due: "2020-01-01" }), todo("reminder:Sa1", { kind: "reminder", author: null, channel: null, link: null, text: "Zelf geschreven" })], error: null });
    expect(rows()).toHaveLength(2);
    expect(rows()[0]?.textContent).toContain("Mila Bakker in #sales");
    expect(rows()[0]?.textContent).toContain(copy.today.late);
    expect(rows()[0]?.querySelector(`button[aria-label="${copy.today.slackTodos.openLabel("To-do message:C1:1.0")}"]`)).not.toBeNull();
    expect(rows()[1]?.textContent).toContain("Eigen to-do");
    // No link for a to-do the person wrote: no dead "Openen".
    expect(rows()[1]?.textContent).not.toContain(copy.today.slackTodos.open);
  });

  it("afvinken vinkt in Slack af", async () => {
    const { done } = setup({ items: [todo("message:C1:1.0")], error: null });
    const box = host.querySelector<HTMLElement>(`[aria-label="${copy.today.slackTodos.checkOff("To-do message:C1:1.0")}"]`);
    expect(box).not.toBeNull();
    await act(async () => void box?.click());
    expect(done).toHaveBeenCalledWith("message:C1:1.0", true);
  });

  it("een fout zegt wat er is en waar je kijkt; de oude lijst blijft staan", () => {
    setup({ items: [todo("reminder:Sa1")], error: "Slack session expired" });
    const error = host.querySelector('[data-testid="today-slack-todos-error"]');
    expect(error?.textContent).toContain(copy.today.slackTodos.failed("Slack session expired"));
    expect(error?.textContent).toContain(copy.today.slackTodos.stale);
    expect(error?.querySelector("a")?.getAttribute("href")).toContain("instellingen");
    expect(rows()).toHaveLength(1);
  });

  it("in één kolom drie rijen, de rest achter Nog n", () => {
    setup({ items: ["a", "b", "c", "d", "e"].map((id) => todo(`reminder:Sa${id}`)), error: null }, true);
    expect(rows()).toHaveLength(3);
    expect(host.textContent).toContain(copy.home.more(2));
  });
});

describe("de keuzes achter de lijst", () => {
  it("te laat is vóór vandaag; vandaag en zonder datum niet", () => {
    expect(slackTodoLate({ due: "2020-01-01" }, today)).toBe(true);
    expect(slackTodoLate({ due: today }, today)).toBe(false);
    expect(slackTodoLate({ due: null }, today)).toBe(false);
  });

  it("vijf naast elkaar, drie in één kolom", () => {
    const items = [1, 2, 3, 4, 5, 6];
    expect(slackTodosShown(items, false)).toEqual({ first: [1, 2, 3, 4, 5], more: [6] });
    expect(slackTodosShown(items, true)).toEqual({ first: [1, 2, 3], more: [4, 5, 6] });
  });
});

describe("wie en waar", () => {
  it("een privébericht noemt de naam één keer", () => {
    expect(copy.today.slackTodos.from("Sam Jansen", "@Sam Jansen")).toBe("Privébericht van Sam Jansen");
    expect(copy.today.slackTodos.from("Mila", "#sales")).toBe("Mila in #sales");
    expect(copy.today.slackTodos.from(null, null)).toBe("Eigen to-do");
  });
});
