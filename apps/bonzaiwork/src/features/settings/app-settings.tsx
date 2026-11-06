import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";

import { useBackend } from "~/backend/context";
import { keys, useAgendaSettings, useProjects, useStatus } from "~/backend/queries";
import { Accent, Band, PageHero, Panel } from "~/components/io";
import { ProjectIcon } from "~/components/project-icon";
import { Button } from "~/components/ui/button";
import { Field, Input, SecretInput, type SecretInputHandle } from "~/components/ui/field";
import { Locked, Row, Section, Skeleton } from "~/components/ui/misc";
import { ConfirmDialog, Dialog } from "~/components/ui/overlay";
import { Select } from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { settingsCopy } from "~/copy/settings";
import { PostLine } from "~/features/agenda/bridge-post-field";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";
import { href, type AppSettingsGroup } from "~/lib/router";
import { readLocal, readLocalJson, writeLocal, writeLocalJson } from "~/lib/storage";
import { setTheme, useTheme, type ThemePreference } from "~/lib/theme";

import { AgendaAppSection } from "../agenda/agenda-settings";
import { BrainsAppSection } from "../brain/personal-setup";
import { DEFAULT_FOLDER_KEY, FALLBACK_FOLDER } from "../projects/new-project-dialog";
import { AgentGroup, SelfCheckLine } from "./app-agent";
import { VerbindingenGroup } from "./app-verbindingen";
import { WerkwijzenGroup, WerkwijzenHeroAction } from "./app-werkwijzen";
import { attempt, InlineTextRow } from "./shared";

// ---------------------------------------------------------------------------
// Weergave: theme, language (locked), the default folder for new projects
// ---------------------------------------------------------------------------

function AppearanceGroup() {
  const theme = useTheme();
  const [folder, setFolder] = useState(() => readLocal(DEFAULT_FOLDER_KEY) ?? FALLBACK_FOLDER);
  return (
    <Section title={copy.settings.app.appearance}>
      <Row
        label={copy.settings.app.theme}
        action={
          <Select
            label={copy.settings.app.theme}
            value={theme}
            onValueChange={(value) => setTheme(value === "light" || value === "dark" ? value : "system")}
            items={(["system", "light", "dark"] as const satisfies readonly ThemePreference[]).map((value) => ({ value, label: copy.settings.themes[value] }))}
            className="w-36"
          />
        }
      />
      <Row label={copy.settings.app.language} value={copy.settings.languageValue} action={<Locked>{copy.settings.languageLocked}</Locked>} />
      <InlineTextRow
        label={copy.settings.app.defaultFolder}
        value={folder}
        placeholder={FALLBACK_FOLDER}
        onSave={async (next) => {
          const trimmed = next.trim() || FALLBACK_FOLDER;
          writeLocal(DEFAULT_FOLDER_KEY, trimmed !== FALLBACK_FOLDER ? trimmed : null);
          setFolder(trimmed);
          toast(copy.settings.app.defaultFolderSaved);
        }}
      />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Agenda: tracking on/off, and the Bridge posts of every project at a glance
// ---------------------------------------------------------------------------

function PostsSection() {
  const backend = useBackend();
  const projects = useProjects();
  const settings = useAgendaSettings(backend.capabilities.agenda);
  if (!backend.capabilities.agenda) return null;
  const active = (projects.data ?? []).filter((project) => !project.archivedAt);
  const postOf = (projectId: string) => settings.data?.projects.find((entry) => entry.workspaceId === projectId)?.bridgePost ?? null;
  const withPost = active.filter((project) => postOf(project.id) !== null).length;
  return (
    <Section title={copy.settings.app.posts} action={settings.data ? <span className="text-xs text-muted-foreground">{copy.settings.app.postsSummary(withPost, active.length)}</span> : undefined}>
      {settings.isLoading ? (
        <Skeleton className="my-3 h-4 w-48" />
      ) : (
        active.map((project) => (
          <a
            key={project.id}
            href={href({ name: "project-settings", projectId: project.id, group: "project" })}
            aria-label={copy.settings.app.postOpen(project.name)}
            className="flex min-h-11 items-center gap-2.5 border-b border-border py-2 text-sm outline-none last:border-b-0 hover:bg-hover/60 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ProjectIcon icon={project.icon} color={project.color} size="sm" />
            <span className="min-w-0 flex-1 truncate">{project.name}</span>
            <PostLine post={postOf(project.id)} className="min-w-0 truncate text-muted-foreground" />
          </a>
        ))
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Technisch: server address, personal variables, versions, demo reset
// ---------------------------------------------------------------------------

function EnvSection() {
  const backend = useBackend();
  const client = useQueryClient();
  const env = useQuery({ queryKey: keys.env, queryFn: () => backend.settings.env() });
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [field, setField] = useState<SecretInputHandle | null>(null);
  const save = async () => {
    const key = name.trim().toUpperCase();
    const value = field?.take() ?? "";
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key) || !value) {
      setError(copy.settings.app.envInvalid);
      return;
    }
    try {
      await backend.settings.setEnv(key, value);
      await client.invalidateQueries({ queryKey: keys.env });
      toast(copy.settings.envSet);
      setAdding(false);
      setName("");
    } catch (failure) {
      setError(errorText(failure));
    }
  };
  return (
    <Section
      title={copy.settings.app.env}
      action={
        <Button variant="quiet" size="sm" onClick={() => (setAdding(true), setError(null))}>
          <Plus />
          {copy.settings.add}
        </Button>
      }
    >
      {env.isLoading ? (
        <Skeleton className="my-3 h-4 w-40" />
      ) : env.data?.length ? (
        env.data.map((entry) => (
          <Row
            key={entry.key}
            label={<span className="font-mono text-sm">{entry.key}</span>}
            value="••••••"
            action={
              <Button
                variant="quiet"
                size="icon-sm"
                aria-label={`${entry.key} ${copy.settings.delete}`}
                onClick={() =>
                  void attempt(async () => {
                    await backend.settings.removeEnv(entry.key);
                    await client.invalidateQueries({ queryKey: keys.env });
                  }, copy.settings.envRemoved)
                }
              >
                <Trash2 />
              </Button>
            }
          />
        ))
      ) : (
        <Row label={copy.settings.envEmpty} value={<span className="text-xs">{copy.settings.envHint}</span>} />
      )}
      <Dialog
        open={adding}
        onOpenChange={setAdding}
        title={copy.settings.app.env}
        footer={
          <>
            <Button variant="secondary" onClick={() => setAdding(false)}>
              {copy.common.cancel}
            </Button>
            <Button variant="primary" onClick={() => void save()}>
              {copy.settings.save}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label={copy.settings.envKey}>{(id) => <Input id={id} value={name} onChange={(event) => setName(event.target.value.toUpperCase())} className="font-mono" placeholder="BIJV_API_TOKEN" />}</Field>
          <Field label={copy.settings.envValue} error={error}>
            {(id, describedBy) => <SecretInput ref={setField} id={id} describedBy={describedBy} onSubmit={() => void save()} />}
          </Field>
        </div>
      </Dialog>
    </Section>
  );
}

function TechnicalGroup() {
  const backend = useBackend();
  const status = useStatus();
  const versions = useQuery({ queryKey: keys.versions, queryFn: () => backend.settings.versions(), staleTime: 5 * 60_000 });
  const demo = backend.mode === "demo";
  const [confirming, setConfirming] = useState(false);
  const reset = demo && "reset" in backend && typeof backend.reset === "function" ? backend.reset : null;
  return (
    <>
      <Section title={copy.settings.app.about}>
        <Row label={copy.settings.app.server} value={status.data ? <span className="font-mono text-xs">{status.data.litellmBaseUrl}</span> : <Skeleton className="h-4 w-40" />} />
        <Row label={copy.settings.versionApp} value={versions.data?.app ?? "—"} />
        <Row label={copy.settings.versionServer} value={versions.data?.server ?? (demo ? copy.boot.demoBadge : "—")} />
        <Row label={copy.settings.versionEngine} value={versions.data?.engine ?? (demo ? copy.boot.demoBadge : "—")} />
        <Row label={copy.settings.updates} action={<Locked>{copy.settings.updatesLocked}</Locked>} />
      </Section>
      <EnvSection />
      {reset ? (
        <Section title={copy.settings.technical.demo}>
          <Row
            label={copy.settings.demoReset}
            action={
              <Button variant="secondary" size="sm" onClick={() => setConfirming(true)}>
                {copy.settings.demoReset}
              </Button>
            }
          />
          <ConfirmDialog
            open={confirming}
            onOpenChange={setConfirming}
            title={`${copy.settings.demoReset}?`}
            body={copy.settings.demoResetBody}
            confirmLabel={copy.settings.demoReset}
            tone="primary"
            onConfirm={() => {
              reset.call(backend);
              window.location.hash = "#/";
              window.location.reload();
            }}
          />
        </Section>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Meldingen: local switches; progress never notifies
// ---------------------------------------------------------------------------

const NOTIFY_KEY = "bonzaiwork.settings.notifications";
type NotifyKind = keyof typeof settingsCopy.notifications.items;
const NOTIFY_KINDS: readonly NotifyKind[] = ["decisions", "runs", "sent"];
type NotifyPrefs = Record<NotifyKind, boolean>;
const NOTIFY_DEFAULT: NotifyPrefs = { decisions: true, runs: true, sent: false };

function readNotify(): NotifyPrefs {
  const stored = readLocalJson(NOTIFY_KEY);
  const result: NotifyPrefs = { ...NOTIFY_DEFAULT };
  if (stored && typeof stored === "object") {
    for (const kind of NOTIFY_KINDS) {
      const value: unknown = Reflect.get(stored, kind);
      if (typeof value === "boolean") result[kind] = value;
    }
  }
  return result;
}

function NotificationsGroup() {
  const backend = useBackend();
  const [prefs, setPrefs] = useState(readNotify);
  const t = settingsCopy.notifications;
  const toggle = (kind: NotifyKind, value: boolean) => {
    const next = { ...prefs, [kind]: value };
    setPrefs(next);
    writeLocalJson(NOTIFY_KEY, next);
    toast(t.saved);
  };
  return (
    <div className="flex flex-col gap-6">
      <Panel as="section" label={t.title} className="flex flex-col">
        <h2 className="m-0 mb-4 text-xl font-semibold text-ink">{t.title}</h2>
        <ul className="m-0 list-none border-t border-line p-0">
          {NOTIFY_KINDS.map((kind) => (
            <li key={kind} className="flex min-h-[72px] items-center gap-4 border-b border-line py-3 last:border-b-0">
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-lg font-semibold text-ink">{t.items[kind].label}</span>
                <span className="text-sm text-ink-muted">{t.items[kind].hint}</span>
              </span>
              <Switch checked={prefs[kind]} onCheckedChange={(value) => toggle(kind, value)} label={t.items[kind].label} />
            </li>
          ))}
        </ul>
      </Panel>
      <p className="m-0 text-base font-semibold text-ink">{t.progress}</p>
      {!backend.capabilities.notifications ? <Locked className="text-sm">{t.systemLocked}</Locked> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page: a hero per group, then the settings nav on a grey band with the group on the right
// ---------------------------------------------------------------------------

type Group = keyof typeof settingsCopy.groups;
const NAV: readonly Group[] = ["verbindingen", "agent", "werkwijzen", "geheugen", "meldingen", "weergave", "agenda", "technisch"];

/** Older route values land on the group that now holds their content. */
function canonical(group: AppSettingsGroup | null | undefined): Group {
  switch (group) {
    case null:
    case undefined:
    case "toegang":
      return "verbindingen";
    case "breinen":
      return "geheugen";
    case "alle":
      return "werkwijzen";
    default:
      return group;
  }
}

/** The older rows (Section/Row) sit in a white panel in the new layout. */
function Plain(props: { children: ReactNode }) {
  return <Panel className="flex flex-col gap-10 [&_section_h2]:text-xl [&_section_h2]:text-ink">{props.children}</Panel>;
}

function GroupContent(props: { group: Group }): ReactNode {
  switch (props.group) {
    case "verbindingen":
      return <VerbindingenGroup />;
    case "agent":
      return <AgentGroup />;
    case "werkwijzen":
      return <WerkwijzenGroup />;
    case "geheugen":
      return (
        <Plain>
          <BrainsAppSection />
        </Plain>
      );
    case "meldingen":
      return <NotificationsGroup />;
    case "weergave":
      return (
        <Plain>
          <AppearanceGroup />
        </Plain>
      );
    case "agenda":
      return (
        <Plain>
          <AgendaAppSection />
          <PostsSection />
        </Plain>
      );
    case "technisch":
      return (
        <Plain>
          <TechnicalGroup />
        </Plain>
      );
  }
}

function SettingsNav(props: { current: Group }) {
  return (
    <nav aria-label={settingsCopy.navLabel} className="min-w-0 lg:max-w-[240px] lg:flex-[1_1_200px]">
      <ul className="m-0 flex list-none gap-6 overflow-x-auto border-b border-line-strong p-0 [scrollbar-width:none] lg:flex-col lg:gap-0 lg:overflow-visible lg:border-b-0 lg:border-t">
        {NAV.map((group) => {
          const current = group === props.current;
          return (
            <li key={group} className="shrink-0">
              <a
                href={href({ name: "settings", group })}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "-mb-px flex min-h-11 items-center whitespace-nowrap py-3 text-lg text-ink no-underline transition-colors duration-200 lg:mb-0 lg:py-4",
                  current ? "border-b-2 border-ink font-bold" : "border-b-2 border-transparent hover:border-line-strong lg:border-b lg:border-line-strong",
                )}
              >
                {settingsCopy.groups[group]}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * App settings (design v2-Settings, v2-ModelKeys, v2-Workspaces): a hero per group, then the
 * settings nav on the left of a grey band and the group on the right. Old route values (toegang,
 * breinen, alle) open the group that holds their content now.
 */
export function AppSettingsPage(props: { group?: AppSettingsGroup | null }) {
  const group = canonical(props.group);
  const hero = settingsCopy.heroes[group];
  const label = settingsCopy.groups[group];
  return (
    <div data-testid="app-settings">
      <PageHero
        documentTitle={settingsCopy.documentTitle(label)}
        eyebrow={settingsCopy.eyebrow(label)}
        title={
          <>
            {hero.before}
            <Accent>{hero.accent}</Accent>
            {hero.after}
          </>
        }
        lead={hero.lead}
        meta={undefined}
        actions={group === "werkwijzen" ? <WerkwijzenHeroAction /> : undefined}
        below={group === "agent" ? <SelfCheckLine /> : undefined}
      />
      <Band tone="alt" inner="flex flex-col gap-10 lg:flex-row lg:flex-wrap lg:gap-16">
        <SettingsNav current={group} />
        <div className="min-w-0 lg:flex-[999_1_560px]">
          <GroupContent group={group} />
        </div>
      </Band>
    </div>
  );
}
