// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BackendProvider } from "~/backend/context";
import { createDemoBackend } from "~/backend/demo";
import type { DayItem } from "~/backend/types";
import { copy } from "~/copy";

import { WorldCard } from "./world-cards";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

type MessageItem = Extract<DayItem, { kind: "message" }>;

const withReply: MessageItem = {
  kind: "message", key: "slack:C1:1.0", source: "slack", title: "Terugkoppeling over Michiel", from: "Elies Goes", at: Date.now() - 44 * 60_000,
  why: "Elies vraagt of je nog op Michiel hebt gereageerd", link: null, reply: { via: "slack", channel: "C1", threadTs: "1.0" },
  draft: "Ja, ik bel hem vandaag.",
};
const withoutReply: MessageItem = { ...withReply, key: "slack:C2:2.0", reply: null, draft: null };

let host: HTMLElement;
let root: Root;

function setup(item: MessageItem) {
  const backend = createDemoBackend({ empty: false, keyMode: "workspace", engineV2: false, noPreferred: false });
  const dismiss = vi.spyOn(backend.today, "dismiss").mockResolvedValue(undefined);
  const send = vi.spyOn(backend.today, "send").mockResolvedValue(undefined);
  const later = vi.spyOn(backend.today, "later").mockResolvedValue(undefined);
  const onResolved = vi.fn();
  act(() => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <BackendProvider backend={backend}>
          <WorldCard item={item} isFocal onResolved={onResolved} cardRef={() => undefined} />
        </BackendProvider>
      </QueryClientProvider>,
    );
  });
  return { dismiss, send, later, onResolved };
}

const button = (label: string) => Array.from(host.querySelectorAll("button")).find((candidate) => candidate.textContent?.startsWith(label)) ?? null;
const card = () => host.querySelector<HTMLElement>('[data-testid="attention-world-slack"]');
const press = (target: Element, key: string) => act(() => void target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })));
const click = async (target: HTMLElement) => act(async () => void target.click());

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("the Slack card with a reply", () => {
  it("offers Afgehandeld only after the reply is opened, as the only way to close it besides Versturen and Later", () => {
    setup(withReply);
    expect(button(copy.today.message.handled)).toBeNull();
    act(() => void button(copy.today.message.review)?.click());
    expect(Array.from(host.querySelectorAll("button")).map((candidate) => candidate.textContent?.replace("⏎", "").replace("esc", "").trim())).toEqual([
      copy.today.message.send,
      copy.today.message.later,
      copy.today.message.handled,
    ]);
  });

  it("sets the card aside with a click on Afgehandeld, and sends nothing", async () => {
    const { dismiss, send, onResolved } = setup(withReply);
    act(() => void button(copy.today.message.review)?.click());
    const handled = button(copy.today.message.handled);
    if (!handled) throw new Error("Afgehandeld is missing");
    await click(handled);
    expect(dismiss).toHaveBeenCalledExactlyOnceWith(withReply.key);
    expect(send).not.toHaveBeenCalled();
    expect(onResolved).toHaveBeenCalledOnce();
  });

  it("keeps ⏎ on a focused Afgehandeld for the button itself, so the card does not also answer", () => {
    const { dismiss, send } = setup(withReply);
    act(() => void button(copy.today.message.review)?.click());
    const handled = button(copy.today.message.handled);
    if (!handled) throw new Error("Afgehandeld is missing");
    press(handled, "Enter");
    expect(send).not.toHaveBeenCalled();
    expect(dismiss).not.toHaveBeenCalled();
  });

  it("does not take over esc: that still sets the card aside until tomorrow", async () => {
    const { dismiss, later } = setup(withReply);
    act(() => void button(copy.today.message.review)?.click());
    const element = card();
    if (!element) throw new Error("card is missing");
    await act(async () => void press(element, "Escape"));
    expect(later).toHaveBeenCalledExactlyOnceWith(withReply.key);
    expect(dismiss).not.toHaveBeenCalled();
  });

  it("is a real, enabled button that Tab can reach", () => {
    setup(withReply);
    act(() => void button(copy.today.message.review)?.click());
    const handled = button(copy.today.message.handled);
    expect(handled?.tagName).toBe("BUTTON");
    expect(handled?.disabled).toBe(false);
    expect(handled?.tabIndex).toBe(0);
  });
});

describe("the Slack card without a reply", () => {
  it("keeps Gelezen as its one way to finish and has no Afgehandeld", () => {
    setup(withoutReply);
    expect(button(copy.today.message.seen)).not.toBeNull();
    expect(button(copy.today.message.handled)).toBeNull();
  });
});
