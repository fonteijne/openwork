import { useEffect, useRef, useState } from "react";
import { BookOpen } from "lucide-react";

import { useBrains, useProjects, useReads } from "~/backend/queries";
import type { Message, PermissionReply, PermissionRequest } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { copy } from "~/copy";
import { readLocalJson, writeLocalJson } from "~/lib/storage";

import { brainIdByName, brainName } from "./brain-picker";

const KEY = "bonzaiwork.brainReads";

/** Reading another brain asks first (brains plan §5.2, N2); the engine names it `breinen_brein_*`. */
export function isBrainRead(request: PermissionRequest): boolean {
  return /^breinen_brein_(lezen|zoeken)$/.test(request.action);
}

/**
 * The engine says only "*", never which brain (fase 0 §4.3): the brain is the
 * `brein` argument of the newest matching tool call in this chat.
 */
export function brainOfRequest(request: PermissionRequest, messages: readonly Message[]): string | null {
  for (const message of [...messages].reverse()) {
    for (const part of [...message.parts].reverse()) {
      if (part.type !== "tool" || (part.tool !== request.action && !part.tool.endsWith(`_${request.action}`))) continue;
      const brain = part.input.brein;
      if (typeof brain === "string" && brain.trim()) return brain.trim();
    }
  }
  return null;
}

/**
 * The user asked for it themselves: the last thing they wrote names the brain (N2), as a whole word
 * and by one of its real names (project or folder), never by what the model called it: "HR" must
 * not match "schrijf" (review #5).
 */
export function userNamedBrain(names: readonly string[], messages: readonly Message[]): boolean {
  const last = [...messages].reverse().find((message) => message.role === "user");
  if (!last) return false;
  const text = last.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join(" ");
  return names.some((raw) => {
    const name = raw.trim().replace(/[-_ ]?brein$/i, "").trim();
    if (name.length < 3) return false;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "iu").test(text);
  });
}

function allowedInChat(chatId: string): string[] {
  const stored = readLocalJson(KEY);
  const value: unknown = stored && typeof stored === "object" ? Reflect.get(stored, chatId) : null;
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function allowInChat(chatId: string, brain: string): void {
  const stored = readLocalJson(KEY);
  const all: Record<string, string[]> = {};
  if (stored && typeof stored === "object") {
    for (const [id, value] of Object.entries(stored)) {
      if (Array.isArray(value)) all[id] = value.filter((entry): entry is string => typeof entry === "string");
    }
  }
  all[chatId] = [...new Set([...(all[chatId] ?? []), brain.toLowerCase()])];
  writeLocalJson(KEY, all);
}

/**
 * "Mag BonzaiWork in het Sales-brein kijken?" The same consent card shape
 * (DESIGN.md T4). "Altijd in dit gesprek" is remembered here per brain, never
 * in the engine: that would open every brain (fase 0 §4.3). When the user
 * named the brain, or allowed it earlier in this chat, it is allowed once
 * without a click.
 */
export function BrainPermissionCard(props: { projectId: string; request: PermissionRequest; messages: readonly Message[]; onReply: (reply: PermissionReply) => Promise<void> }) {
  const reads = useReads(props.projectId);
  const brains = useBrains();
  const projects = useProjects();
  const [busy, setBusy] = useState(false);
  const brain = brainOfRequest(props.request, props.messages);
  const brainId = brain ? brainIdByName(brain, brains.data ?? [], projects.data) : null;
  const known = (brains.data ?? []).find((entry) => entry.projectId === brainId) ?? null;
  const names = known ? [brainName(known, projects.data), known.path.split(/[\\/]/).filter(Boolean).at(-1) ?? ""] : [];
  const automatic = brainId !== null && (userNamedBrain(names, props.messages) || allowedInChat(props.request.chatId).includes(brainId));
  const answered = useRef(false);

  const reply = async (value: PermissionReply, always = false) => {
    if (busy || answered.current) return;
    answered.current = true;
    setBusy(true);
    if (always && brainId) allowInChat(props.request.chatId, brainId);
    try {
      await props.onReply(value);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (automatic) void reply("once");
  });

  if (automatic) return null;
  // A brain this project may always consult: the server allows it (Projectinstellingen → Brein).
  if (brainId && reads.data?.includes(brainId)) return null;
  const name = brain ?? copy.brain.otherBrain;
  return (
    <section aria-label={copy.brain.readTitle(name)} data-testid="brain-read" className="bw-enter rounded-window bg-background p-5 ring-1 ring-amber-9/60">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-3 text-amber-11 [&_svg]:size-4"><BookOpen /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{copy.brain.readTitle(name)}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{copy.brain.readBody}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 sm:ps-10">
        <Button variant="primary" disabled={busy} onClick={() => void reply("once")}>{copy.permission.allow}</Button>
        {brain ? <Button variant="secondary" disabled={busy} onClick={() => void reply("once", true)}>{copy.brain.readAlways}</Button> : null}
        <Button variant="quiet" disabled={busy} onClick={() => void reply("reject")}>{copy.permission.deny}</Button>
      </div>
    </section>
  );
}
