import {
  BackendError,
  type Backend,
  type BrainCandidate,
  type BrainHistoryEntry,
  type BrainKind,
  type BrainMode,
  type BrainState,
  type BrainStatus,
  type ConceptView,
  type PreferenceProposal,
  type RemoteCheck,
  type RemoteProblem,
  type TrustItem,
} from "../types";

import { enc, type RequestOptions } from "./http";
import { bool, field, list, num, rec, str, strings } from "./read";

/**
 * Brains over BonzaiWork's own routes (packages/bonzaiwork-brains,
 * `/bonzaiwork/brains/*`). Readers check every field; the server's Dutch
 * sentences (status.error, check.message) are shown as they are.
 */
type Request = (path: string, options?: RequestOptions) => Promise<unknown>;

const STATES: readonly BrainState[] = ["synced", "syncing", "behind", "ahead", "offline", "conflict", "read_only", "local_only", "needs_trust", "error"];
const MODES: readonly BrainMode[] = ["auto", "manual", "read_only"];
const TRUST_KINDS: readonly TrustItem["kind"][] = ["config", "plugin", "agent", "command", "script"];
const PROBLEMS: readonly RemoteProblem[] = ["host_unknown", "host_changed", "no_access", "key_locked", "not_found", "read_only", "rejected", "unreachable", "offline", "ssh_missing", "unknown"];
const TIERS: readonly ConceptView["tier"][] = ["unverified", "machine", "human", "human_before_change"];
const STATUSES: readonly ConceptView["status"][] = ["draft", "stable", "deprecated"];

export function readBrainStatus(value: unknown): BrainStatus | null {
  const state = STATES.find((entry) => entry === str(value, "state"));
  if (!rec(value) || !state) return null;
  const kind: BrainKind = str(value, "kind") === "personal" ? "personal" : "project";
  return {
    kind,
    state,
    mode: MODES.find((entry) => entry === str(value, "mode")) ?? "auto",
    remote: str(value, "remote") ?? null,
    branch: str(value, "branch") ?? "main",
    ahead: num(value, "ahead") ?? 0,
    behind: num(value, "behind") ?? 0,
    lastSyncAt: num(value, "lastSyncAt") ?? null,
    conflictFiles: strings(field(value, "conflictFiles")),
    conflictBy: str(value, "conflictBy") ?? null,
    merging: field(value, "merging") === true,
    error: str(value, "error") ?? null,
    pendingTrust: list(value, "pendingTrust").flatMap((item): TrustItem[] => {
      const path = str(item, "path");
      const itemKind = TRUST_KINDS.find((entry) => entry === str(item, "kind"));
      return path && itemKind ? [{ path, kind: itemKind, mcpServers: strings(field(item, "mcpServers")) }] : [];
    }),
    unshared: list(value, "unshared").flatMap((item) => {
      const path = str(item, "path");
      const reason: BrainStatus["unshared"][number]["reason"] = str(item, "reason") === "too_large" ? "too_large" : "not_markdown";
      return path ? [{ path, reason }] : [];
    }),
    warnings: strings(field(value, "warnings")),
    excluded: strings(field(value, "excluded")),
  };
}

function requireStatus(value: unknown): BrainStatus {
  const status = readBrainStatus(value) ?? readBrainStatus(field(value, "status"));
  if (!status) throw new BackendError("invalid_response", "De server gaf een onleesbare breinstatus terug.");
  return status;
}

function readConcept(value: unknown): ConceptView | null {
  const tier = TIERS.find((entry) => entry === str(value, "tier"));
  const type = str(value, "type");
  if (!tier || !type) return null;
  const actors = (key: string) => list(value, key).flatMap((entry) => {
    const by = str(entry, "by");
    return by ? [{ by, at: str(entry, "at") ?? null }] : [];
  });
  const generated = field(value, "generated");
  const generatedBy = str(generated, "by");
  return {
    type,
    title: str(value, "title") ?? null,
    description: str(value, "description") ?? null,
    tags: strings(field(value, "tags")),
    status: STATUSES.find((entry) => entry === str(value, "status")) ?? "stable",
    stale: bool(value, "stale") ?? false,
    generated: generatedBy ? { by: generatedBy, at: str(generated, "at") ?? null } : null,
    verified: actors("verified"),
    tier,
    sources: list(value, "sources").map((source) => ({ id: str(source, "id") ?? null, title: str(source, "title") ?? null, resource: str(source, "resource") ?? null })),
  };
}

function readHistory(value: unknown): BrainHistoryEntry[] {
  return list(value, "entries").flatMap((entry) => {
    const commit = str(entry, "commit");
    return commit ? [{
      commit,
      author: str(entry, "author") ?? "",
      at: num(entry, "at") ?? 0,
      title: str(entry, "title") ?? "",
      chatId: str(entry, "chatId") ?? null,
      files: strings(field(entry, "files")),
    }] : [];
  });
}

function readProposals(value: unknown): PreferenceProposal[] {
  return list(value, "proposals").flatMap((entry) => {
    const id = str(entry, "id");
    const preference = str(entry, "preference");
    return id && preference ? [{ id, preference, reason: str(entry, "reason") ?? null, at: num(entry, "at") ?? 0 }] : [];
  });
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function createBrainsClient(req: Request, folderFor: (target: { folderPath: string | null; name: string }) => Promise<string>): Backend["brains"] {
  const host = { host: true };
  const brain = (projectId: string) => `/bonzaiwork/brains/${enc(projectId)}`;
  return {
    async list() {
      return list(await req("/bonzaiwork/brains"), "brains").flatMap((entry) => {
        const projectId = str(entry, "workspaceId");
        const status = readBrainStatus(field(entry, "status"));
        return projectId && status ? [{ projectId, path: str(entry, "path") ?? "", status }] : [];
      });
    },
    async checkRemote(url): Promise<RemoteCheck> {
      try {
        const payload = await req("/bonzaiwork/brains/check-remote", { method: "POST", body: { url }, ...host, timeoutMs: 60_000 });
        if (field(payload, "ok") === true) {
          return { ok: true, sshUrl: str(payload, "sshUrl") ?? url, name: str(payload, "name") ?? "", empty: field(payload, "empty") === true };
        }
        const hostInfo = field(payload, "host");
        return {
          ok: false,
          sshUrl: str(payload, "sshUrl") ?? null,
          name: str(payload, "name") ?? null,
          problem: PROBLEMS.find((entry) => entry === str(payload, "problem")) ?? "unknown",
          message: str(payload, "message") ?? "",
          host: rec(hostInfo) ? { name: str(hostInfo, "name") ?? "", fingerprints: strings(field(hostInfo, "fingerprints")) } : null,
        };
      } catch (failure) {
        if (failure instanceof BackendError && failure.code.startsWith("link_")) {
          return { ok: false, sshUrl: null, name: null, problem: "link", message: "", host: null };
        }
        throw failure;
      }
    },
    trustHost: async (url, fingerprints) => void (await req("/bonzaiwork/brains/trust-host", { method: "POST", body: { url, fingerprints }, ...host })),
    async clone(url, target) {
      const folderPath = await folderFor(target);
      const payload = await req("/bonzaiwork/brains/clone", { method: "POST", body: { url, folderPath }, ...host });
      const jobId = str(payload, "jobId");
      if (!jobId) throw new BackendError("invalid_response", "De server startte het ophalen niet.");
      return { jobId, folderPath };
    },
    async job(jobId) {
      // The clone runs on the server; poll briefly so the dialog can keep its place (P11).
      for (;;) {
        const payload = await req(`/bonzaiwork/brains/jobs/${enc(jobId)}`, host);
        const state = str(payload, "state");
        if (state === "done" || state === "failed") {
          return { state, error: str(payload, "error") ?? null, status: readBrainStatus(field(payload, "status")) };
        }
        await wait(500);
      }
    },
    register: async (projectId, input) => requireStatus(await req(brain(projectId), { method: "PUT", body: input, ...host })),
    unregister: async (projectId) => void (await req(brain(projectId), { method: "DELETE", ...host })),
    async candidate(projectId): Promise<BrainCandidate> {
      const repository = field(await req(`${brain(projectId)}/candidate`, host), "repository");
      return { repository: rec(repository) ? { remote: str(repository, "remote") ?? null, branch: str(repository, "branch") ?? null, ssh: field(repository, "ssh") === true } : null };
    },
    adopt: async (projectId) => requireStatus(await req(`${brain(projectId)}/adopt`, { method: "POST", body: {}, ...host, timeoutMs: 120_000 })),
    publish: async (projectId, url, name) => requireStatus(await req(`${brain(projectId)}/publish`, { method: "POST", body: { url, name }, ...host, timeoutMs: 120_000 })),
    setUp: async (projectId, input) => requireStatus(await req(`${brain(projectId)}/setup`, { method: "POST", body: input, ...host, timeoutMs: 120_000 })),
    prepare: async (projectId, chatId) => void (await req(`${brain(projectId)}/pull`, { method: "POST", body: { sessionId: chatId }, timeoutMs: 15_000 })),
    share: async (projectId) => requireStatus(await req(`${brain(projectId)}/sync`, { method: "POST", timeoutMs: 120_000 })),
    setMode: async (projectId, mode) => requireStatus(await req(brain(projectId), { method: "PUT", body: { mode }, ...host })),
    history: async (projectId) => readHistory(await req(`${brain(projectId)}/history`)),
    async mergeWithAi(projectId) {
      const payload = await req(`${brain(projectId)}/resolve`, { method: "POST", body: { strategy: "ai" }, timeoutMs: 120_000 });
      return { prompt: str(payload, "prompt") ?? null, status: requireStatus(payload) };
    },
    keepMineApart: async (projectId) => requireStatus(await req(`${brain(projectId)}/resolve`, { method: "POST", body: { strategy: "keep-mine-apart" }, timeoutMs: 120_000 })),
    trust: async (projectId, paths) => requireStatus(await req(`${brain(projectId)}/trust`, { method: "POST", body: { paths }, ...host })),
    repair: async (projectId) => requireStatus(await req(`${brain(projectId)}/repair`, { method: "POST", ...host })),
    setExcluded: async (projectId, folders) => requireStatus(await req(`${brain(projectId)}/excluded`, { method: "PUT", body: { folders }, ...host })),
    attachRemote: async (projectId, url) => requireStatus(await req(`${brain(projectId)}/remote`, { method: "POST", body: { url }, ...host, timeoutMs: 120_000 })),
    restore: async (projectId, commit, path) => requireStatus(await req(`${brain(projectId)}/restore`, { method: "POST", body: path ? { commit, path } : { commit } })),
    concept: async (projectId, path) => readConcept(field(await req(`${brain(projectId)}/concept?path=${enc(path)}`), "concept")),
    verify: async (projectId, path) => readConcept(field(await req(`${brain(projectId)}/verify`, { method: "POST", body: { path } }), "concept")),
    async author() {
      const payload = await req("/bonzaiwork/brains/settings");
      const read = (key: string) => {
        const value = field(payload, key);
        const name = str(value, "name");
        const email = str(value, "email");
        return name && email ? { name, email } : null;
      };
      return { author: read("author"), suggested: read("suggested") };
    },
    setAuthor: async (author) => void (await req("/bonzaiwork/brains/settings", { method: "PUT", body: author, ...host })),
    proposals: async () => readProposals(await req("/bonzaiwork/brains/proposals")),
    decide: async (proposalId, decision, text) => void (await req(`/bonzaiwork/brains/proposals/${enc(proposalId)}`, { method: "POST", body: { decision, ...(text ? { text } : {}) } })),
  };
}
