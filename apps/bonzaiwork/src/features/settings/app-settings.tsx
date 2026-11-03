import { useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ellipsis, Plus, Trash2, Unlink } from "lucide-react";

import { useBackend } from "~/backend/context";
import { keys, useAgendaSettings, useProjects, useStatus } from "~/backend/queries";
import { ProjectIcon } from "~/components/project-icon";
import { PageTitle, TopBar } from "~/components/top-bar";
import { Button } from "~/components/ui/button";
import { StatusChip } from "~/components/ui/chip";
import { Field, Input, SecretInput, type SecretInputHandle } from "~/components/ui/field";
import { Menu, MenuItem } from "~/components/ui/menu";
import { Locked, Row, Section, Skeleton } from "~/components/ui/misc";
import { ConfirmDialog, Dialog } from "~/components/ui/overlay";
import { Select } from "~/components/ui/select";
import { Tabs } from "~/components/ui/tabs";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { PostLine } from "~/features/agenda/bridge-post-field";
import { errorText } from "~/lib/errors";
import { APP_SETTINGS_GROUPS, href, navigate, type AppSettingsGroup } from "~/lib/router";
import { readLocal, writeLocal } from "~/lib/storage";
import { setTheme, useTheme, type ThemePreference } from "~/lib/theme";

import { AgendaAppSection } from "../agenda/agenda-settings";
import { BrainsAppSection } from "../brain/personal-setup";
import { DEFAULT_FOLDER_KEY, FALLBACK_FOLDER } from "../projects/new-project-dialog";
import { settingsCopy } from "./copy";
import { attempt, InlineTextRow, KeyForm } from "./shared";
import { MethodsSection } from "./werkwijzen";

// ---------------------------------------------------------------------------
// Toegang: the key, never the vendor (C3); keys per project link to their Toegang group
// ---------------------------------------------------------------------------

function AccessGroup() {
  const backend = useBackend();
  const client = useQueryClient();
  const status = useStatus();
  const projects = useProjects();
  const [replacing, setReplacing] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const data = status.data;
  if (!data) {
    return (
      <Section title={settingsCopy.app.access}>
        <Skeleton className="my-3 h-4 w-40" />
      </Section>
    );
  }
  return (
    <Section title={settingsCopy.app.access}>
      {data.keyMode === "user" ? (
        replacing || !data.user.hasKey ? (
          <>
            {!data.user.hasKey ? <Row label={settingsCopy.key.personal} value={<StatusChip status="locked" label={settingsCopy.key.missing} />} /> : null}
            <KeyForm
              autoFocus={replacing}
              onCancel={data.user.hasKey ? () => setReplacing(false) : undefined}
              onLink={async (key) => {
                client.setQueryData(keys.status, await backend.keys.linkUser(key));
                setReplacing(false);
                toast(copy.keys.linkedToast);
              }}
            />
          </>
        ) : (
          <Row
            label={settingsCopy.key.personal}
            value={settingsCopy.key.linked(data.user.keyHint ?? "")}
            action={
              <>
                <Button variant="secondary" size="sm" onClick={() => setReplacing(true)}>
                  {settingsCopy.key.replace}
                </Button>
                <Menu
                  align="end"
                  trigger={
                    <Button variant="quiet" size="icon-sm" aria-label={settingsCopy.key.more}>
                      <Ellipsis />
                    </Button>
                  }
                >
                  <MenuItem icon={<Unlink />} danger onClick={() => setUnlinking(true)}>
                    {settingsCopy.key.unlink}
                  </MenuItem>
                </Menu>
              </>
            }
          />
        )
      ) : (
        <>
          <Row label={settingsCopy.app.projectKeys} />
          {(projects.data ?? [])
            .filter((project) => !project.archivedAt)
            .map((project) => (
              <a
                key={project.id}
                href={href({ name: "project-settings", projectId: project.id, group: "toegang" })}
                aria-label={settingsCopy.app.projectKeyOpen(project.name)}
                className="flex min-h-11 items-center gap-2.5 border-b border-border py-2 text-sm outline-none last:border-b-0 hover:bg-hover/60 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ProjectIcon icon={project.icon} color={project.color} size="sm" />
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
                {project.key.hasKey ? <span className="text-muted-foreground">{settingsCopy.key.linked(project.key.keyHint ?? "")}</span> : <StatusChip status="locked" label={settingsCopy.key.missing} />}
              </a>
            ))}
        </>
      )}
      {!data.keyStorePersistent ? <Locked className="py-2">{copy.onboarding.notPersistent}</Locked> : null}
      <ConfirmDialog
        open={unlinking}
        onOpenChange={setUnlinking}
        title={copy.keys.confirmUnlink}
        body={copy.keys.confirmUnlinkBody}
        confirmLabel={settingsCopy.key.unlink}
        onConfirm={() => {
          setUnlinking(false);
          void attempt(async () => {
            client.setQueryData(keys.status, await backend.keys.unlinkUser());
          }, copy.keys.unlinked);
        }}
      />
    </Section>
  );
}

// ---------------------------------------------------------------------------
// Weergave: theme, language (locked), the default folder for new projects
// ---------------------------------------------------------------------------

function AppearanceGroup() {
  const theme = useTheme();
  const [folder, setFolder] = useState(() => readLocal(DEFAULT_FOLDER_KEY) ?? FALLBACK_FOLDER);
  return (
    <Section title={settingsCopy.app.appearance}>
      <Row
        label={settingsCopy.app.theme}
        action={
          <Select
            label={settingsCopy.app.theme}
            value={theme}
            onValueChange={(value) => setTheme(value === "light" || value === "dark" ? value : "system")}
            items={(["system", "light", "dark"] as const satisfies readonly ThemePreference[]).map((value) => ({ value, label: copy.settings.themes[value] }))}
            className="w-36"
          />
        }
      />
      <Row label={settingsCopy.app.language} value={copy.settings.languageValue} action={<Locked>{copy.settings.languageLocked}</Locked>} />
      <InlineTextRow
        label={settingsCopy.app.defaultFolder}
        value={folder}
        placeholder={FALLBACK_FOLDER}
        onSave={async (next) => {
          const trimmed = next.trim() || FALLBACK_FOLDER;
          writeLocal(DEFAULT_FOLDER_KEY, trimmed !== FALLBACK_FOLDER ? trimmed : null);
          setFolder(trimmed);
          toast(settingsCopy.app.defaultFolderSaved);
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
    <Section title={settingsCopy.app.posts} action={settings.data ? <span className="text-xs text-muted-foreground">{settingsCopy.app.postsSummary(withPost, active.length)}</span> : undefined}>
      {settings.isLoading ? (
        <Skeleton className="my-3 h-4 w-48" />
      ) : (
        active.map((project) => (
          <a
            key={project.id}
            href={href({ name: "project-settings", projectId: project.id, group: "project" })}
            aria-label={settingsCopy.app.postOpen(project.name)}
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
      setError(settingsCopy.app.envInvalid);
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
      title={settingsCopy.app.env}
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
        title={settingsCopy.app.env}
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
      <Section title={settingsCopy.app.about}>
        <Row label={settingsCopy.app.server} value={status.data ? <span className="font-mono text-xs">{status.data.litellmBaseUrl}</span> : <Skeleton className="h-4 w-40" />} />
        <Row label={copy.settings.versionApp} value={versions.data?.app ?? "—"} />
        <Row label={copy.settings.versionServer} value={versions.data?.server ?? (demo ? copy.boot.demoBadge : "—")} />
        <Row label={copy.settings.versionEngine} value={versions.data?.engine ?? (demo ? copy.boot.demoBadge : "—")} />
        <Row label={copy.settings.updates} action={<Locked>{copy.settings.updatesLocked}</Locked>} />
      </Section>
      <EnvSection />
      {reset ? (
        <Section title={settingsCopy.technical.demo}>
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
// Page
// ---------------------------------------------------------------------------

function GroupContent(props: { group: AppSettingsGroup; anchorProjectId: string | null }): ReactNode {
  switch (props.group) {
    case "toegang":
      return <AccessGroup />;
    case "weergave":
      return <AppearanceGroup />;
    case "agenda":
      return (
        <>
          <AgendaAppSection />
          <PostsSection />
        </>
      );
    case "breinen":
      return <BrainsAppSection />;
    case "alle":
      // Always rendered (assessment P-7); without a project the rows stand with a lock (P4).
      return <MethodsSection projectId={props.anchorProjectId} scope="global" />;
    case "technisch":
      return <TechnicalGroup />;
  }
}

/**
 * App settings (brief §3, §6): six groups as a pill strip, `#/instellingen/:g`. No vendor name
 * as a section title; the server address lives under Technisch (assessment P-7).
 */
export function AppSettingsPage(props: { group?: AppSettingsGroup | null }) {
  const projects = useProjects();
  const anchor = projects.data?.find((project) => !project.archivedAt) ?? null;
  const group: AppSettingsGroup = props.group ?? "toegang";
  const items = useMemo(() => APP_SETTINGS_GROUPS.map((entry) => ({ value: entry, label: settingsCopy.appGroups[entry], href: href({ name: "settings", group: entry }) })), []);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBar>
        <PageTitle>{settingsCopy.app.title}</PageTitle>
      </TopBar>
      <main className="min-h-0 flex-1 overflow-y-auto" data-testid="app-settings">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-4 pt-3 pb-16 sm:px-6">
          <Tabs<AppSettingsGroup> value={group} onValueChange={(next) => navigate({ name: "settings", group: next })} items={items} label={settingsCopy.appGroupsLabel} surface="page" />
          <GroupContent group={group} anchorProjectId={anchor?.id ?? null} />
        </div>
      </main>
    </div>
  );
}
