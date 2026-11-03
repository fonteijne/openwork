import { useSyncExternalStore } from "react";

import type { BrainHistoryEntry, BrainStatus, ConceptView, WorkflowStage } from "~/backend/types";
import type { ChipStatus } from "~/components/ui/chip";
import { copy } from "~/copy";
import { relativeTime } from "~/lib/format";
import { readLocalJson, writeLocalJson } from "~/lib/storage";
import { fileName } from "~/lib/tools";


// ---------------------------------------------------------------------------
// State in words
// ---------------------------------------------------------------------------

/** The status in the pill's words (brains plan §8.2); the Details column and the tab share it. */
export function brainStateLabel(status: BrainStatus, now = Date.now()): string {
  const states = copy.brain.states;
  if (status.proposal && status.state === "ahead") return status.proposal.manual ? copy.brain.proposalMake : copy.brain.proposalOpen;
  switch (status.state) {
    case "synced":
      return states.synced(status.lastSyncAt ? relativeTime(status.lastSyncAt, now) : null);
    case "syncing":
      return states.syncing;
    case "behind":
      return states.behind(status.behind);
    case "ahead":
      return states.ahead(status.ahead);
    case "offline":
      return states.offline(status.ahead);
    case "conflict":
      return states.conflict;
    case "read_only":
      return states.read_only;
    case "local_only":
      return states.local_only;
    case "needs_trust":
      return states.needs_trust;
    case "error":
      return states.error;
  }
}

export type BrainAttentionKind = "conflict" | "needs_trust" | "error";

/** The one reason the user has to act, or null (brief §8: conflict, trust, error). */
export function attentionKind(status: BrainStatus): BrainAttentionKind | null {
  if (status.state === "conflict") return "conflict";
  if (status.state === "needs_trust" && status.pendingTrust.length) return "needs_trust";
  if (status.state === "error") return "error";
  return null;
}

/**
 * The state as a `StatusChip` (icon + word, never hue alone; V2, C5): amber while a decision is
 * open, electric while sharing, red on an error, a lock for read-only, otherwise a neutral word.
 */
export function brainChip(status: BrainStatus, now = Date.now()): { status: ChipStatus; label: string } {
  const label = brainStateLabel(status, now);
  if (status.state === "syncing") return { status: "running", label };
  if (status.state === "error") return { status: "failed", label };
  if (attentionKind(status) || status.proposal?.manual) return { status: "waiting", label };
  if (status.state === "read_only") return { status: "locked", label };
  return { status: "idle", label };
}

// ---------------------------------------------------------------------------
// "Nu niet" on the trust card is remembered per device (brief §8, assessment P-7)
// ---------------------------------------------------------------------------

const TRUST_LATER_KEY = "bonzaiwork.brainTrustLater";

/** What the card asked about; a new or changed item asks again (brein-beheer §6). */
export function trustSignature(status: BrainStatus): string {
  return status.pendingTrust.map((item) => item.path).sort().join("|");
}

function trustLaterAll(): Record<string, string> {
  const stored = readLocalJson(TRUST_LATER_KEY);
  const all: Record<string, string> = {};
  if (stored && typeof stored === "object") {
    for (const [projectId, value] of Object.entries(stored)) {
      if (typeof value === "string") all[projectId] = value;
    }
  }
  return all;
}

export function trustDismissed(projectId: string, status: BrainStatus): boolean {
  return status.pendingTrust.length > 0 && trustLaterAll()[projectId] === trustSignature(status);
}

/** The card, the row and the chat dock all read this; a change in one re-renders the others. */
const trustListeners = new Set<() => void>();
let trustVersion = 0;
function notifyTrust() {
  trustVersion += 1;
  for (const listener of trustListeners) listener();
}
function subscribeTrust(listener: () => void) {
  trustListeners.add(listener);
  return () => {
    trustListeners.delete(listener);
  };
}

export function dismissTrust(projectId: string, status: BrainStatus): void {
  writeLocalJson(TRUST_LATER_KEY, { ...trustLaterAll(), [projectId]: trustSignature(status) });
  notifyTrust();
}

export function recallTrust(projectId: string): void {
  const all = trustLaterAll();
  delete all[projectId];
  writeLocalJson(TRUST_LATER_KEY, all);
  notifyTrust();
}

/** Whether the user put this brain's trust question aside; live across every component that asks. */
export function useTrustDismissed(projectId: string, status: BrainStatus | null): boolean {
  useSyncExternalStore(subscribeTrust, () => trustVersion, () => 0);
  return status !== null && trustDismissed(projectId, status);
}

// ---------------------------------------------------------------------------
// Team and history
// ---------------------------------------------------------------------------

/** Colleagues in the history, most recent first, without the user ("Jij" or the configured name). */
export function teamOf(history: readonly BrainHistoryEntry[], me: string | null): string[] {
  const names: string[] = [];
  for (const entry of [...history].sort((a, b) => b.at - a.at)) {
    const author = entry.author.trim();
    if (!author || author === me || author.toLowerCase() === "jij" || names.includes(author)) continue;
    names.push(author);
  }
  return names;
}

/** The sync writes these itself (plan §6.5); a person never changed them. */
const GENERATED = new Set(["knowledge/index.md", "knowledge/log.md"]);

/** A knowledge note the person can read and check: Markdown under knowledge/, not the generated files. */
export function isKnowledgeNote(path: string): boolean {
  return path.startsWith("knowledge/") && path.endsWith(".md") && !GENERATED.has(path);
}

/** "kortingsbeleid" from "knowledge/offertes/kortingsbeleid.md": the note's name as a title. */
export function noteTitle(path: string): string {
  const name = fileName(path).replace(/\.md$/i, "").replace(/[-_]+/g, " ").trim();
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : path;
}

/** The notes a history entry touched, by title, without the generated files. */
export function entryNotes(entry: BrainHistoryEntry): string[] {
  return entry.files.filter((file) => !GENERATED.has(file) && file.endsWith(".md")).map(noteTitle);
}

// ---------------------------------------------------------------------------
// Knowledge rows by OKF type
// ---------------------------------------------------------------------------

export type KnowledgeItem = { path: string; concept: ConceptView | null };
export type KnowledgeGroup = { type: string; label: string; items: KnowledgeItem[] };

export function knowledgeTypeLabel(type: string | null): string {
  const key = (type ?? "").trim().toLowerCase();
  if (!key) return copy.brain.knowledge.other;
  const known: Record<string, string> = copy.brain.knowledge.types;
  return known[key] ?? type?.trim() ?? copy.brain.knowledge.other;
}

/** Groups notes by concept type, known types first in the order the copy lists them, then by name. */
export function groupKnowledge(items: readonly KnowledgeItem[]): KnowledgeGroup[] {
  const order = Object.keys(copy.brain.knowledge.types);
  const groups = new Map<string, KnowledgeGroup>();
  for (const item of items) {
    const type = (item.concept?.type ?? "").trim().toLowerCase();
    const group = groups.get(type) ?? { type, label: knowledgeTypeLabel(item.concept?.type ?? null), items: [] };
    group.items.push(item);
    groups.set(type, group);
  }
  const rank = (type: string) => {
    const index = order.indexOf(type);
    return index === -1 ? (type ? order.length : order.length + 1) : index;
  };
  return [...groups.values()]
    .map((group) => ({ ...group, items: [...group.items].sort((a, b) => conceptTitle(a).localeCompare(conceptTitle(b), "nl")) }))
    .sort((a, b) => rank(a.type) - rank(b.type) || a.label.localeCompare(b.label, "nl"));
}

export function conceptTitle(item: KnowledgeItem): string {
  const title = item.concept?.title?.trim();
  return title ? title.charAt(0).toUpperCase() + title.slice(1) : noteTitle(item.path);
}

/** A note is checked when a person said "Klopt" after its last change. */
export function conceptChecked(concept: ConceptView | null): boolean {
  return concept?.tier === "human" && !concept.stale;
}

export function knowledgeCounts(items: readonly KnowledgeItem[]): { stale: number; unverified: number } {
  let stale = 0;
  let unverified = 0;
  for (const item of items) {
    if (item.concept?.stale) stale += 1;
    if (item.concept && !conceptChecked(item.concept)) unverified += 1;
  }
  return { stale, unverified };
}

// ---------------------------------------------------------------------------
// Workflows: the deliverable, not the folder id (assessment P-3)
// ---------------------------------------------------------------------------

/** "opzet" from "02_opzet": the stage's short name for chat titles. */
export function stageName(stage: Pick<WorkflowStage, "id">): string {
  return stage.id.replace(/^\d{2}_/, "").replace(/[-_]+/g, " ");
}

/** "conceptofferte.md" from "output/conceptofferte.md", else the stage's own name. */
export function deliverableOf(stage: WorkflowStage): string {
  const output = stage.outputs[0];
  return output ? fileName(output) : stageName(stage);
}

/** "Brief tot conceptofferte": the task in sentence case. */
export function stageTask(stage: WorkflowStage): string {
  const task = stage.task.trim();
  return task ? task.charAt(0).toUpperCase() + task.slice(1) : "";
}

/**
 * The chat that runs a stage carries "<werkwijze>: <stap>" as its title (`ChatStart.title`, demo
 * and server alike); that is how the check card finds the chat that finished the stage (brief §8).
 */
export function stageChatTitle(workflowTitle: string, stage: Pick<WorkflowStage, "id">): string {
  return `${workflowTitle}: ${stageName(stage)}`;
}
