import { describe, expect, test } from "bun:test";

import { parseBridgePost, rememberPost, validEntityId } from "../src/bridge.ts";
import type { BridgePost } from "../src/types.ts";

describe("Bridge-post", () => {
  test("geldige en ongeldige entity-ID's", () => {
    expect(validEntityId("<ENTITY_ID_A>")).toBe(true);
    expect(validEntityId("x".repeat(64))).toBe(true);
    expect(validEntityId("x".repeat(65))).toBe(false);
    expect(validEntityId("")).toBe(false);
    expect(validEntityId("met spatie")).toBe(false);
    expect(validEntityId("regel\neinde")).toBe(false);
  });

  test("invoer: id getrimd, label op één regel, leeg label is geen label", () => {
    expect(parseBridgePost({ entityId: "  <ENTITY_ID_A> ", label: " Project A,\n ontwikkeling " })).toEqual({ entityId: "<ENTITY_ID_A>", label: "Project A, ontwikkeling" });
    expect(parseBridgePost({ entityId: "<ENTITY_ID_A>", label: "   " })).toEqual({ entityId: "<ENTITY_ID_A>", label: null });
    expect(parseBridgePost({ entityId: "<ENTITY_ID_A>" })).toEqual({ entityId: "<ENTITY_ID_A>", label: null });
    expect(parseBridgePost({ entityId: "<ENTITY_ID_A>", label: "x".repeat(121) })).toBeNull();
    expect(parseBridgePost({ entityId: "<ENTITY_ID_A>", label: 3 })).toBeNull();
    expect(parseBridgePost({ entityId: 3 })).toBeNull();
    expect(parseBridgePost(null)).toBeNull();
  });

  test("recente posten: nieuwste eerst, ontdubbeld op entity-ID, max 10", () => {
    let recent: BridgePost[] = Array.from({ length: 10 }, (_, index) => ({ entityId: `<ENTITY_ID_${index}>`, label: null }));
    recent = rememberPost(recent, { entityId: "<ENTITY_ID_5>", label: "nieuw label" });
    expect(recent).toHaveLength(10);
    expect(recent[0]).toEqual({ entityId: "<ENTITY_ID_5>", label: "nieuw label" });
    expect(recent.filter((post) => post.entityId === "<ENTITY_ID_5>")).toHaveLength(1);
    recent = rememberPost(recent, { entityId: "<ENTITY_ID_NEW>", label: null });
    expect(recent).toHaveLength(10);
    expect(recent.map((post) => post.entityId)).not.toContain("<ENTITY_ID_9>");
  });
});
