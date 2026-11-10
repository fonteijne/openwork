import {
  BackendError,
  type Backend,
  type Brain,
  type BrainHistoryEntry,
  type BrainState,
  type BrainStatus,
  type ConceptView,
  type HarnessInfo,
  type HistoryAuthor,
  type TeamRepo,
  type PreferenceProposal,
  type TrustItem,
  type Workflow,
  type WorkflowStage,
} from "../types";
import { readLocalJson, writeLocalJson } from "~/lib/storage";

/**
 * Brains in the demo (brains plan §8.2: "een voorbeeldbrein in elke staat").
 * `?brein=<staat>` puts "Offertes 2026" in that state for design review:
 * conflict, offline, vertrouwen, alleen-lezen, fout, kennis, instellingen, achter, niet-gedeeld, bezig.
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
  /** The user's own skills in Jouw brein (brein-harnas-plan §1.4). */
  ownSkills?: Array<{ name: string; description: string; content: string }>;
  /** The team's repository of skills (§2.1): linked, with parts that wait for trust. */
  teamRepo?: { remote: string; trusted: boolean } | null;
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
  kennis: { state: "error", ahead: 1, fixInNotes: true, error: "Niet gedeeld: knowledge/offertes/kortingsbeleid.md mist de kop met het type (OKF). Laat de AI het herstellen of vul het type in." },
  instellingen: { state: "error", repairable: true, error: "De instellingen van dit brein zijn buiten BonzaiWork om veranderd. Synchroniseren is gestopt; kies Herstellen." },
  achter: { state: "behind", behind: 2 },
  "niet-gedeeld": { state: "synced", unshared: [{ path: "offerte-van-dijk.pptx", reason: "not_markdown" }, { path: "scan-contract.md", reason: "too_large" }] },
  bezig: { state: "syncing" },
  // Brein-harnas-plan H3: an unchanged copy from an older app, and one the team changed.
  verouderd: { outdated: [{ kind: "skill", name: "okf-query", from: "1.0.0", to: "1.2.0", modified: false }, { kind: "command", name: "verwerk", from: "1.0.0", to: "1.2.0", modified: true }] },
};

const DEMO_HARNESS_VERSION = "1.2.0";
const DEMO_TEAM_ITEMS: HarnessInfo["items"] = [
  { kind: "skill", name: "offerte-check", source: "repo", version: "2.1.0", description: "Een offerte controleren op ons kortingsbeleid en de huisstijl." },
  { kind: "skill", name: "okf-query", source: "repo", version: "2.1.0", description: "Onze manier van vragen beantwoorden: eerst het beleid, dan de voorbeelden." },
  { kind: "command", name: "offerte", source: "repo", version: "2.1.0", description: "Een offerte volgens ons sjabloon" },
  { kind: "agent", name: "verkoop", source: "repo", version: "2.1.0", description: "Verkoopagent met onze prijslijst" },
];
const DEMO_DAILY_PROMPT = "Dit is de dagelijkse verwerking van mijn brein. Roep gesprekken_lezen aan voor de laatste 24 uur en leg vast wat ook buiten het project telt: mensen (knowledge/mensen/), projecten (knowledge/projecten/), besluiten. Voorkeuren stel je voor met voorkeur_voorstellen. Sluit af met drie regels: nieuw, bijgewerkt, voorstellen.";
const DEMO_HARNESS: HarnessInfo["items"] = [
  { kind: "skill", name: "okf-query", source: "bundled", version: DEMO_HARNESS_VERSION, description: "Een vraag beantwoorden uit de kennis van dit brein, stap voor stap via de indexen." },
  { kind: "skill", name: "okf-ingest", source: "bundled", version: DEMO_HARNESS_VERSION, description: "Een bron verwerken in de kennis van dit brein." },
  { kind: "skill", name: "okf-lint", source: "bundled", version: DEMO_HARNESS_VERSION, description: "De kennis van dit brein controleren op tegenstrijdigheden, verlopen en gebroken links." },
  { kind: "skill", name: "icm-architect", source: "bundled", version: DEMO_HARNESS_VERSION, description: "Een proces of kennisgebied inrichten als werkwijze met stappen en controles." },
  { kind: "skill", name: "brein-mensen", source: "bundled", version: DEMO_HARNESS_VERSION, description: "Iemand opzoeken of bijwerken in je brein." },
  { kind: "command", name: "verwerk", source: "bundled", version: DEMO_HARNESS_VERSION, description: "Een bron verwerken in de kennis" },
  { kind: "command", name: "vastleggen", source: "bundled", version: DEMO_HARNESS_VERSION, description: "Het laatste antwoord als concept bewaren" },
  { kind: "command", name: "onderhoud", source: "bundled", version: DEMO_HARNESS_VERSION, description: "De kennis van dit brein controleren" },
  { kind: "command", name: "werkwijze", source: "bundled", version: DEMO_HARNESS_VERSION, description: "Een werkwijze maken of aanpassen" },
  { kind: "command", name: "onthoud", source: "bundled", version: DEMO_HARNESS_VERSION, description: "Leg uit dit gesprek vast wat ook buiten dit project telt" },
  { kind: "agent", name: "brein", source: "bundled", version: DEMO_HARNESS_VERSION, description: "Jouw brein. Weet wat je over jezelf, je mensen en je projecten hebt vastgelegd." },
];

function base(now: number, path: string, kind: BrainStatus["kind"], remote: string | null): BrainStatus & { path: string } {
  return {
    path, kind, state: remote ? "synced" : "local_only", mode: "auto", remote, branch: "main", ahead: 0, behind: 0,
    lastSyncAt: now - 2 * MIN, conflictFiles: [], conflictBy: null, merging: false, error: null, repairable: false, fixInNotes: false, pendingTrust: [], unshared: [], warnings: [], excluded: [], proposal: null, outdated: [],
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
    ownSkills: [{ name: "klantmail-schrijven", description: "Een klantmail in mijn toon, kort en zonder jargon", content: "# Klantmail\n\n1. Begin met de kern.\n2. Eén vraag per mail.\n" }],
    teamRepo: state === "teamskills" ? { remote: "git@gitlab.com:bonzai-demo/skills.git", trusted: false } : null,
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
  const teamRepoView = (): TeamRepo | null => {
    const repo = state.teamRepo;
    if (!repo) return null;
    const status = base(Date.now(), `${input.home}/.bonzaiwork/harness-repo`, "project", repo.remote);
    return { remote: repo.remote, version: "2.1.0", status: { ...status, mode: "read_only", lastSyncAt: Date.now() - 4 * MIN, state: repo.trusted ? "synced" : "needs_trust", pendingTrust: repo.trusted ? [] : [{ path: "agents/verkoop.md", kind: "agent", mcpServers: [] }] } };
  };
  const settled = (projectId: string): Partial<BrainStatus> => {
    const current = brain(projectId);
    const state: BrainState = current.remote ? "synced" : "local_only";
    return { state, ahead: 0, behind: 0, error: null, repairable: false, fixInNotes: false, conflictFiles: [], conflictBy: null, merging: false, lastSyncAt: Date.now() };
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
      return { waited: "updated", status: current ? view(projectId) : null };
    },
    async share(projectId) {
      await later(900);
      const current = brain(projectId);
      // "Opnieuw proberen" checks again; a guarded error only lifts with "Herstellen".
      if (current.state === "conflict" || current.repairable) return view(projectId);
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
    async harness() {
      await later(80);
      const personal = Object.entries(state.brains).find(([, entry]) => entry.kind === "personal")?.[0] ?? null;
      const own = (state.ownSkills ?? []).map((skill) => ({ kind: "skill" as const, name: skill.name, source: "personal" as const, version: null, description: skill.description }));
      const team = state.teamRepo ? DEMO_TEAM_ITEMS.filter((item) => item.kind !== "agent" || state.teamRepo?.trusted) : [];
      const previous = switchState === "vorig-brein" ? { projectId: DEMO_BRAINS.offertes, at: Date.now() - 60 * MIN } : null;
      const items = [...DEMO_HARNESS.filter((item) => !own.some((entry) => entry.name === item.name) && !team.some((entry) => entry.name === item.name)), ...team, ...own];
      return { version: DEMO_HARNESS_VERSION, items, personalId: personal, previous, repo: teamRepoView(), prompts: { daily: DEMO_DAILY_PROMPT } };
    },
    async linkTeamRepo(url) {
      await later(900);
      state.teamRepo = { remote: url.replace(/^https:\/\/([^/]+)\/(.+?)(\.git)?\/?$/, "git@$1:$2.git"), trusted: false };
      save();
      return teamRepoView();
    },
    async unlinkTeamRepo() {
      await later(300);
      state.teamRepo = null;
      save();
    },
    async trustTeamRepo() {
      await later(300);
      if (state.teamRepo) state.teamRepo = { ...state.teamRepo, trusted: true };
      save();
      return teamRepoView();
    },
    async updateTeamRepo() {
      await later(600);
      return teamRepoView();
    },
    async harnessDiff(_projectId, kind, name) {
      await later(120);
      return `--- a/${kind === "skill" ? `${name}/SKILL.md` : `${name}.md`}\n+++ b/${kind === "skill" ? `${name}/SKILL.md` : `${name}.md`}\n ---\n name: ${name}\n-harness: ${name}@1.0.0\n+harness: ${name}@${DEMO_HARNESS_VERSION}\n ---\n-3. Antwoord met links.\n+3. Antwoord met links naar de concepten die je gebruikte en noem de status.\n`;
    },
    async harnessUpdate(projectId, items) {
      await later(400);
      const current = brain(projectId);
      const left = current.outdated.filter((entry) => !items.some((item) => item.kind === entry.kind && item.name === entry.name));
      state.history[projectId] = [{ commit: Date.now().toString(36).slice(-7), author: state.author?.name ?? "Jij", at: Date.now(), title: `BonzaiWork-onderdelen bijgewerkt naar ${DEMO_HARNESS_VERSION}`, chatId: null, files: items.map((item) => (item.kind === "skill" ? `.opencode/skills/${item.name}/SKILL.md` : `.opencode/commands/${item.name}.md`)) }, ...(state.history[projectId] ?? [])];
      return set(projectId, { outdated: left, lastSyncAt: Date.now() });
    },
    async harnessRemove(projectId, items) {
      await later(400);
      const current = brain(projectId);
      return set(projectId, { outdated: current.outdated.filter((entry) => !items.some((item) => item.kind === entry.kind && item.name === entry.name)), lastSyncAt: Date.now() });
    },
    async harnessDismiss(projectId, items) {
      await later(80);
      const current = brain(projectId);
      return set(projectId, { outdated: current.outdated.filter((entry) => !items.some((item) => item.kind === entry.kind && item.name === entry.name)) });
    },
    async adoptSkill(_personalId, _fromProjectId, name, _move) {
      await later(300);
      state.ownSkills = [...(state.ownSkills ?? []).filter((skill) => skill.name !== name), { name, description: "Overgenomen uit een project", content: "# Overgenomen\n" }];
      save();
    },
    async savePersonalSkill(_personalId, input) {
      await later(200);
      state.ownSkills = [...(state.ownSkills ?? []).filter((skill) => skill.name !== input.name), input];
      save();
    },
    async removePersonalSkill(_personalId, name) {
      await later(200);
      state.ownSkills = (state.ownSkills ?? []).filter((skill) => skill.name !== name);
      save();
    },
    async decide(proposalId) {
      await later();
      state.proposals = state.proposals.filter((item) => item.id !== proposalId);
      save();
    },
  };
}
