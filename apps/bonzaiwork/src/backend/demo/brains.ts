import {
  BackendError,
  type Backend,
  type Brain,
  type BrainHistoryEntry,
  type BrainState,
  type BrainStatus,
  type ConceptView,
  type HistoryAuthor,
  type PreferenceProposal,
  type TrustItem,
  type Workflow,
  type WorkflowStage,
} from "../types";
import { readLocalJson, writeLocalJson } from "~/lib/storage";

/**
 * Brains in the demo (brains plan §8.2: "een voorbeeldbrein in elke staat").
 * `?brein=<staat>` puts "Offertes 2026" in that state for design review:
 * conflict, offline, vertrouwen, alleen-lezen, fout, achter, niet-gedeeld, bezig.
 */

const MIN = 60_000;

export const DEMO_BRAINS = { service: "p-service", offertes: "p-offertes", personal: "p-mijn-brein" } as const;

type DemoBrains = {
  version: 1;
  brains: Record<string, BrainStatus & { path: string }>;
  history: Record<string, BrainHistoryEntry[]>;
  author: HistoryAuthor | null;
  proposals: PreferenceProposal[];
  verified: Record<string, boolean>;
  /** Workflow stage states per project: the demo has no folder to read them from. */
  stages?: Record<string, WorkflowStage["state"][]>;
  reads?: Record<string, string[]>;
};

const DEMO_WORKFLOW: Omit<Workflow, "stages"> & { stages: Array<Omit<WorkflowStage, "state" | "failure" | "missing">> } = {
  name: "offerte-maken",
  title: "Offerte maken",
  task: "van aanvraag naar gecontroleerde offerte",
  runs: ["20261028-1410-fysiopraktijk-de-linde"],
  stages: [
    { id: "01_intake", task: "aanvraag tot korte brief", outputs: ["output/brief.md"], check: { kind: "person", text: "De gebruiker leest de brief na." } },
    { id: "02_opzet", task: "brief tot conceptofferte", outputs: ["output/conceptofferte.md"], check: { kind: "person", text: "De gebruiker keurt de conceptofferte goed." } },
    { id: "03_controle", task: "offerte tegen beleid toetsen", outputs: ["output/toetsing.md"], check: { kind: "model", text: "Een klein model beantwoordt: valt elke korting binnen het kortingsbeleid?" } },
  ],
};

const SWITCHES: Record<string, Partial<BrainStatus>> = {
  voorstel: { state: "ahead", ahead: 2, mode: "proposal", proposal: { branch: "bonzaiwork/jij/20261030-1412", url: "https://github.com/bonzai-demo/offertes/pull/12", manual: false } },
  "zonder-gh": { state: "ahead", ahead: 1, mode: "proposal", proposal: { branch: "bonzaiwork/jij/20261030-1412", url: "https://github.com/bonzai-demo/offertes/compare/main...bonzaiwork%2Fjij%2F20261030-1412?expand=1", manual: true } },
  conflict: { state: "conflict", ahead: 1, behind: 1, conflictFiles: ["knowledge/offertes/kortingsbeleid.md"], conflictBy: "Sanne de Vries", error: "Jij en een ander wijzigden hetzelfde. Er is niets verloren; kies hoe je verder wilt." },
  offline: { state: "offline", ahead: 3, error: "Geen verbinding. Je wijzigingen worden gedeeld zodra je weer online bent." },
  vertrouwen: {
    state: "needs_trust",
    pendingTrust: [
      { path: "opencode.json", kind: "config", mcpServers: ["prijzen-api"] },
      { path: ".opencode/plugins/offerte-nummer.js", kind: "plugin", mcpServers: [] },
    ],
  },
  "alleen-lezen": { state: "read_only", ahead: 1, error: "Je kunt dit brein lezen maar niet wijzigen. Je wijzigingen blijven op deze laptop; vraag de beheerder om schrijfrechten." },
  fout: { state: "error", error: "De server van dit brein meldt zich anders dan eerst. Synchroniseren is gestopt; vraag je beheerder of dit klopt." },
  achter: { state: "behind", behind: 2 },
  "niet-gedeeld": { state: "synced", unshared: [{ path: "offerte-van-dijk.pptx", reason: "not_markdown" }, { path: "scan-contract.md", reason: "too_large" }] },
  bezig: { state: "syncing" },
};

function base(now: number, path: string, kind: BrainStatus["kind"], remote: string | null): BrainStatus & { path: string } {
  return {
    path, kind, state: remote ? "synced" : "local_only", mode: "auto", remote, branch: "main", ahead: 0, behind: 0,
    lastSyncAt: now - 2 * MIN, conflictFiles: [], conflictBy: null, merging: false, error: null, pendingTrust: [], unshared: [], warnings: [], excluded: [], proposal: null,
  };
}

function seed(now: number, home: string, state: string | null): DemoBrains {
  const offertes = { ...base(now, `${home}/Offertes 2026`, "project", "git@gitlab.com:bonzai-demo/offertes.git"), ...(state ? SWITCHES[state] : {}) };
  return {
    version: 1,
    brains: {
      [DEMO_BRAINS.service]: base(now, `${home}/Klantenservice`, "project", "git@gitlab.com:bonzai-demo/klantenservice.git"),
      [DEMO_BRAINS.offertes]: offertes,
      [DEMO_BRAINS.personal]: { ...base(now, `${home}/Mijn brein`, "personal", null), lastSyncAt: null, excluded: ["Dagboek"] },
    },
    history: {
      [DEMO_BRAINS.offertes]: [
        { commit: "a1b2c3d", author: "Jij", at: now - 2 * MIN, title: "Offerte Van Dijk", chatId: "c-vandijk", files: ["knowledge/offertes/van-dijk.md", "knowledge/log.md"] },
        { commit: "b2c3d4e", author: "Sanne de Vries", at: now - 3 * 60 * MIN, title: "Kortingsbeleid bijgewerkt", chatId: null, files: ["knowledge/offertes/kortingsbeleid.md"] },
        { commit: "c3d4e5f", author: "Jij", at: now - 26 * 60 * MIN, title: "Eigen wijzigingen", chatId: null, files: ["knowledge/producten/pakketten.md"] },
      ],
      [DEMO_BRAINS.service]: [
        { commit: "d4e5f6a", author: "Ahmed Yilmaz", at: now - 40 * MIN, title: "Retourbeleid vastgelegd", chatId: null, files: ["knowledge/beleid/retouren.md"] },
      ],
      [DEMO_BRAINS.personal]: [
        { commit: "e5f6a7b", author: "Jij", at: now - 15 * MIN, title: "Klantmail schrijven", chatId: "c-vandijk", files: ["knowledge/schrijven/klantmails.md"] },
        { commit: "f6a7b8c", author: "Jij", at: now - 2 * 24 * 60 * MIN, title: "Begin geschiedenis", chatId: null, files: ["AGENTS.md", "_meta/voorkeuren.md"] },
      ],
    },
    author: { name: "Jij", email: "jij@voorbeeld.nl" },
    proposals: state === "voorkeur" ? [{ id: "pref-demo", preference: "Samenvattingen altijd in drie punten, conclusie eerst.", reason: "Zo vroeg je het bij de klantmail.", at: now - MIN }] : [],
    verified: {},
  };
}

const later = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

export function createDemoBrains(input: { now: number; home: string; storageKey: string; search: string; projectPath: (projectId: string) => string | null }): Backend["brains"] {
  const switchState = new URLSearchParams(input.search).get("brein");
  const key = `${input.storageKey}.brains.${switchState ?? "normaal"}`;
  const stored = readLocalJson(key);
  const valid = (value: unknown): value is DemoBrains => typeof value === "object" && value !== null && Reflect.get(value, "version") === 1;
  const state: DemoBrains = valid(stored) ? stored : seed(input.now, input.home, switchState);
  const save = () => writeLocalJson(key, state);
  const jobs = new Map<string, { url: string; path: string }>();

  const brain = (projectId: string) => {
    const found = state.brains[projectId];
    if (!found) throw new BackendError("brain_not_found", "Dit project is geen brein.", 404);
    return found;
  };
  const view = (projectId: string): BrainStatus => {
    const { path: _path, ...status } = brain(projectId);
    return structuredClone(status);
  };
  const set = (projectId: string, patch: Partial<BrainStatus>) => {
    Object.assign(brain(projectId), patch);
    save();
    return view(projectId);
  };
  const settled = (projectId: string): Partial<BrainStatus> => {
    const current = brain(projectId);
    const state: BrainState = current.remote ? "synced" : "local_only";
    return { state, ahead: 0, behind: 0, error: null, conflictFiles: [], conflictBy: null, merging: false, lastSyncAt: Date.now() };
  };

  return {
    async list(): Promise<Brain[]> {
      await later(120);
      // A brain without its project (the empty demo, a removed project) is not listed.
      return Object.entries(state.brains).flatMap(([projectId, entry]) => (input.projectPath(projectId) === null ? [] : [{ projectId, path: entry.path, status: view(projectId) }]));
    },
    async checkRemote(url) {
      await later(700);
      const name = url.replace(/\.git$/, "").split(/[/:]/).filter(Boolean).at(-1) ?? "";
      if (!/^(https?:\/\/|git@|ssh:\/\/)/.test(url.trim()) || !name) return { ok: false, sshUrl: null, name: null, problem: "link", message: "", host: null };
      if (url.includes("geen-toegang")) return { ok: false, sshUrl: url, name, problem: "no_access", message: "Je account heeft geen toegang tot dit brein. Vraag de beheerder je toe te voegen, of controleer of je SSH-sleutel bij je account staat.", host: null };
      if (url.includes("vergrendeld")) return { ok: false, sshUrl: url, name, problem: "key_locked", message: "Je SSH-sleutel is vergrendeld. Ontgrendel hem in je sleutelhanger of voeg hem toe met ssh-add.", host: null };
      if (!/gitlab\.com|github\.com/.test(url) && !state.verified[`host:${url.split("/")[2] ?? url}`]) {
        return { ok: false, sshUrl: url, name, problem: "host_unknown", message: "De server van dit brein is nog onbekend. Controleer de vingerafdruk en bevestig hem.", host: { name: url.split("/")[2] ?? url, fingerprints: ["256 SHA256:Gm8Kp2c7yQ0iXv1sTbL4N9dWfE3hJ6aR5uZoP8qYwC0 (ED25519)"] } };
      }
      return { ok: true, sshUrl: url.replace(/^https:\/\/([^/]+)\/(.+?)(\.git)?\/?$/, "git@$1:$2.git"), name, empty: /leeg|nieuw/i.test(url) };
    },
    async trustHost(url) {
      await later();
      state.verified[`host:${url.split("/")[2] ?? url}`] = true;
      save();
    },
    async clone(url, target) {
      await later();
      const jobId = `job-${Date.now().toString(36)}`;
      const folderPath = target.folderPath?.trim() || `${input.home}/${target.name.trim() || "Brein"}`;
      jobs.set(jobId, { url, path: folderPath });
      return { jobId, folderPath };
    },
    async job(jobId) {
      await later(1600);
      const job = jobs.get(jobId);
      if (!job) return { state: "failed", error: "Ophalen lukte niet. Probeer het opnieuw.", status: null };
      return {
        state: "done", error: null,
        status: { ...base(Date.now(), job.path, "project", job.url), state: "needs_trust", pendingTrust: [{ path: "opencode.json", kind: "config", mcpServers: ["crm"] }] },
      };
    },
    async register(projectId, registration) {
      await later();
      const path = input.projectPath(projectId) ?? `${input.home}/${projectId}`;
      const job = registration.jobId ? jobs.get(registration.jobId) : undefined;
      const remote = registration.kind === "personal" ? null : (job?.url ?? "git@gitlab.com:bonzai-demo/nieuw.git");
      const pendingTrust: TrustItem[] = job && !registration.trusted?.includes("opencode.json") ? [{ path: "opencode.json", kind: "config", mcpServers: ["crm"] }] : [];
      const fresh = base(Date.now(), path, registration.kind, remote);
      state.brains[projectId] = {
        ...fresh,
        state: pendingTrust.length ? "needs_trust" : fresh.state,
        mode: registration.mode ?? "auto",
        excluded: registration.excluded ?? [],
        pendingTrust,
      };
      state.history[projectId] = [{ commit: "0a1b2c3", author: state.author?.name ?? "Jij", at: Date.now(), title: registration.kind === "personal" ? "Begin geschiedenis" : "Opgehaald", chatId: null, files: [] }];
      save();
      return view(projectId);
    },
    async reads(projectId) {
      await later(80);
      return state.reads?.[projectId] ?? [];
    },
    async setReads(projectId, brains) {
      await later();
      const kept = brains.filter((id) => id !== projectId && state.brains[id]?.kind === "project");
      state.reads = { ...state.reads, [projectId]: kept };
      save();
      return kept;
    },
    // Workflows (plan §6.5). In the demo, starting a stage counts as its chat having written the output.
    async workflows(projectId) {
      await later(120);
      if (projectId !== DEMO_BRAINS.offertes) return [];
      const states = state.stages?.[projectId] ?? ["done", "check", "waiting"];
      return [{
        ...DEMO_WORKFLOW,
        stages: DEMO_WORKFLOW.stages.map((stage, index) => ({ ...stage, state: states[index] ?? "waiting", failure: null, missing: [] })),
      }];
    },
    async startStage(projectId, workflow, stageId) {
      await later(300);
      const index = DEMO_WORKFLOW.stages.findIndex((stage) => stage.id === stageId);
      const states = [...(state.stages?.[projectId] ?? ["done", "check", "waiting"])];
      states[index] = "check";
      state.stages = { ...state.stages, [projectId]: states };
      save();
      const stage = DEMO_WORKFLOW.stages[index];
      return { title: `${DEMO_WORKFLOW.title}: ${stageId.replace(/^\d{2}_/, "")}`, prompt: `Voer stap \`${stageId}\` van de werkwijze ${DEMO_WORKFLOW.title} uit: ${stage?.task ?? ""}.\n\nLees eerst het contract \`workflows/${workflow}/${stageId}/CONTEXT.md\` en volg het.` };
    },
    async checkStage(projectId, _workflow, stageId, verdict) {
      await later(300);
      const index = DEMO_WORKFLOW.stages.findIndex((stage) => stage.id === stageId);
      const states = [...(state.stages?.[projectId] ?? ["done", "check", "waiting"])];
      states[index] = verdict === "pass" ? "done" : "failed";
      if (verdict === "pass" && index + 1 < states.length) states[index + 1] = "ready";
      state.stages = { ...state.stages, [projectId]: states };
      save();
    },
    async modelCheck(projectId, workflow, stageId) {
      await this.checkStage(projectId, workflow, stageId, "pass", null);
      return { title: `Controle: ${stageId.replace(/^\d{2}_/, "")}`, prompt: `Controleer stap \`${stageId}\` van deze werkwijze en schrijf \`check.md\` met pass of fail.` };
    },
    async newRun(projectId) {
      await later(300);
      state.stages = { ...state.stages, [projectId]: ["ready", "waiting", "waiting"] };
      save();
    },
    async candidate(projectId) {
      await later(150);
      // The demo's "Website-teksten" is a clone of a team repository; the others are plain folders.
      return { repository: projectId === "p-website" ? { remote: "git@github.com:bonzai-demo/website.git", branch: "main", ssh: true } : null };
    },
    async adopt(projectId) {
      await later(700);
      const path = input.projectPath(projectId) ?? `${input.home}/${projectId}`;
      state.brains[projectId] = base(Date.now(), path, "project", "git@github.com:bonzai-demo/website.git");
      state.history[projectId] = [];
      save();
      return view(projectId);
    },
    async publish(projectId, url) {
      await later(900);
      const path = input.projectPath(projectId) ?? `${input.home}/${projectId}`;
      state.brains[projectId] = base(Date.now(), path, "project", url.replace(/^https:\/\/([^/]+)\/(.+?)(\.git)?\/?$/, "git@$1:$2.git"));
      state.history[projectId] = [{ commit: "1a2b3c4", author: state.author?.name ?? "Jij", at: Date.now(), title: "Brein gedeeld", chatId: null, files: [] }];
      save();
      return view(projectId);
    },
    async setUp(projectId) {
      await later();
      return view(projectId);
    },
    async unregister(projectId) {
      await later();
      delete state.brains[projectId];
      save();
    },
    async prepare(projectId) {
      await later(150);
      const current = state.brains[projectId];
      if (current?.state === "behind") set(projectId, settled(projectId));
    },
    async share(projectId) {
      await later(900);
      const current = brain(projectId);
      if (current.state === "conflict" || current.state === "error") return view(projectId);
      return set(projectId, settled(projectId));
    },
    setMode: async (projectId, mode) => { await later(); return set(projectId, { mode, state: mode === "read_only" ? "read_only" : brain(projectId).remote ? "synced" : "local_only" }); },
    history: async (projectId) => { await later(150); return structuredClone(state.history[projectId] ?? []); },
    async mergeWithAi(projectId) {
      await later(600);
      const current = brain(projectId);
      const files = current.conflictFiles;
      const by = current.conflictBy ?? "een collega";
      // The demo has no engine to merge with: the chat runs, and the brain counts as merged.
      const status = set(projectId, settled(projectId));
      return {
        prompt: `In dit brein wijzigden jij en ${by} tegelijk dezelfde notities. In deze bestanden staan nu beide versies:\n${files.map((file) => `- \`${file}\``).join("\n")}\n\nVoeg per bestand de twee versies samen tot één goede tekst. Verlies geen informatie.`,
        status,
      };
    },
    async keepMineApart(projectId) {
      await later(900);
      return set(projectId, settled(projectId));
    },
    trust: async (projectId, paths) => {
      await later();
      const pendingTrust = brain(projectId).pendingTrust.filter((item) => !paths.includes(item.path));
      return set(projectId, { pendingTrust, ...(pendingTrust.length ? {} : settled(projectId)) });
    },
    repair: async (projectId) => { await later(); return set(projectId, settled(projectId)); },
    setExcluded: async (projectId, folders) => { await later(); return set(projectId, { excluded: folders }); },
    attachRemote: async (projectId, url) => { await later(1200); return set(projectId, { remote: url, ...settled(projectId), state: "synced" }); },
    async restore(projectId, commit, path) {
      await later();
      const entry = (state.history[projectId] ?? []).find((item) => item.commit === commit);
      state.history[projectId] = [
        { commit: Math.random().toString(16).slice(2, 9), author: state.author?.name ?? "Jij", at: Date.now(), title: path ? `Teruggezet: ${path}` : `Teruggedraaid: ${entry?.title ?? commit}`, chatId: null, files: path ? [path] : entry?.files ?? [] },
        ...(state.history[projectId] ?? []),
      ];
      save();
      return view(projectId);
    },
    async concept(projectId, path) {
      await later(120);
      if (!state.brains[projectId] || !path.startsWith("knowledge/")) return null;
      const verified = state.verified[`${projectId}:${path}`] === true;
      const concept: ConceptView = {
        type: path.includes("beleid") ? "Policy" : "Process",
        title: path.split("/").at(-1)?.replace(/\.md$/, "").replace(/-/g, " ") ?? path,
        description: null,
        tags: ["offertes"],
        status: verified ? "stable" : "draft",
        stale: path.includes("prijzen"),
        generated: { by: "bonzaiwork/0.1.0", at: new Date(Date.now() - 2 * MIN).toISOString() },
        verified: verified ? [{ by: "human:jij", at: new Date().toISOString() }] : [],
        tier: verified ? "human" : "unverified",
        sources: [{ id: "kickoff", title: "Kickoff-notulen", resource: "../references/2026-10-30-kickoff-notulen.md" }],
      };
      return concept;
    },
    async verify(projectId, path) {
      await later();
      state.verified[`${projectId}:${path}`] = true;
      save();
      return this.concept(projectId, path);
    },
    author: async () => ({ author: state.author, suggested: state.author ? null : { name: "Jij", email: "jij@voorbeeld.nl" } }),
    setAuthor: async (author) => { await later(); state.author = author; save(); },
    proposals: async () => structuredClone(state.proposals),
    async decide(proposalId) {
      await later();
      state.proposals = state.proposals.filter((item) => item.id !== proposalId);
      save();
    },
  };
}
