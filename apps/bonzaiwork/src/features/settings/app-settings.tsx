import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";

import { useBackend } from "~/backend/context";
import { keys, useProjects, useStatus } from "~/backend/queries";
import { ProjectIcon } from "~/components/project-icon";
import { PageTitle, TopBar } from "~/components/top-bar";
import { Button } from "~/components/ui/button";
import { Field, Input, SecretInput, type SecretInputHandle } from "~/components/ui/field";
import { Locked, Row, Section, Skeleton } from "~/components/ui/misc";
import { ConfirmDialog, Dialog } from "~/components/ui/overlay";
import { Select } from "~/components/ui/select";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { errorText } from "~/lib/errors";
import { href } from "~/lib/router";
import { readLocal, writeLocal } from "~/lib/storage";
import { setTheme, useTheme, type ThemePreference } from "~/lib/theme";

import { BrainsAppSection } from "../brain/personal-setup";
import { DEFAULT_FOLDER_KEY, FALLBACK_FOLDER } from "../projects/new-project-dialog";
import { CommandsList, KeyForm, SkillsList } from "./project-settings";

function KeysSection() {
  const backend = useBackend();
  const client = useQueryClient();
  const status = useStatus();
  const projects = useProjects();
  const [replacing, setReplacing] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const data = status.data;
  if (!data) return null;
  return (
    <Section title={copy.settings.appSections.keys}>
      <Row label={copy.settings.server} value={<span className="font-mono text-xs">{data.litellmBaseUrl}</span>} />
      {data.keyMode === "user" ? (
        replacing || !data.user.hasKey ? (
          <KeyForm
            autoFocus={replacing}
            onCancel={data.user.hasKey ? () => setReplacing(false) : undefined}
            onLink={async (key) => {
              client.setQueryData(keys.status, await backend.keys.linkUser(key));
              setReplacing(false);
              toast(copy.keys.linkedToast);
            }}
          />
        ) : (
          <Row
            label={copy.settings.personalKey}
            value={copy.keys.linked(data.user.keyHint ?? "")}
            action={
              <>
                <Button variant="secondary" size="sm" onClick={() => setReplacing(true)}>
                  {copy.keys.replace}
                </Button>
                <Button variant="quiet" size="sm" onClick={() => setUnlinking(true)}>
                  {copy.keys.unlink}
                </Button>
              </>
            }
          />
        )
      ) : (
        <div className="py-2">
          <p className="pb-1 text-sm font-medium">{copy.settings.projectKeys}</p>
          {(projects.data ?? [])
            .filter((project) => !project.archivedAt)
            .map((project) => (
              <a key={project.id} href={href({ name: "project-settings", projectId: project.id, section: "key" })} className="flex min-h-10 items-center gap-2.5 rounded-md px-1.5 text-sm hover:bg-hover">
                <ProjectIcon icon={project.icon} color={project.color} size="sm" />
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
                {project.key.hasKey ? <span className="text-muted-foreground">{copy.keys.linked(project.key.keyHint ?? "")}</span> : <Locked>{copy.keys.missing}</Locked>}
              </a>
            ))}
        </div>
      )}
      {!data.keyStorePersistent ? <p className="py-2 text-xs text-muted-foreground">{copy.onboarding.notPersistent}</p> : null}
      <ConfirmDialog
        open={unlinking}
        onOpenChange={setUnlinking}
        title={copy.keys.confirmUnlink}
        body={copy.keys.confirmUnlinkBody}
        confirmLabel={copy.keys.unlink}
        onConfirm={() => {
          setUnlinking(false);
          void backend.keys
            .unlinkUser()
            .then((next) => {
              client.setQueryData(keys.status, next);
              toast(copy.keys.unlinked);
            })
            .catch((failure: unknown) => toast(errorText(failure), { tone: "error" }));
        }}
      />
    </Section>
  );
}

function AppearanceSection() {
  const theme = useTheme();
  const [folder, setFolder] = useState(() => readLocal(DEFAULT_FOLDER_KEY) ?? FALLBACK_FOLDER);
  return (
    <>
      <Section title={copy.settings.appSections.appearance}>
        <Row
          label={copy.settings.theme}
          action={
            <Select
              label={copy.settings.theme}
              value={theme}
              onValueChange={(value) => setTheme(value === "light" || value === "dark" ? value : "system")}
              items={(["system", "light", "dark"] as ThemePreference[]).map((value) => ({ value, label: copy.settings.themes[value] }))}
              className="w-36"
            />
          }
        />
        <Row label={copy.settings.language} value={copy.settings.languageValue} action={<Locked>{copy.settings.languageLocked}</Locked>} />
      </Section>
      <Section title={copy.settings.appSections.projects}>
        <div className="py-3">
          <Field label={copy.settings.defaultFolder} hint={copy.settings.defaultFolderHint}>
            {(id, describedBy) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                value={folder}
                onChange={(event) => setFolder(event.target.value)}
                onBlur={() => {
                  writeLocal(DEFAULT_FOLDER_KEY, folder.trim() && folder.trim() !== FALLBACK_FOLDER ? folder.trim() : null);
                  toast(copy.settings.saved);
                }}
                className="font-mono"
              />
            )}
          </Field>
        </div>
      </Section>
    </>
  );
}

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
      setError("Gebruik hoofdletters, cijfers en _, en vul een waarde in.");
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
      title={copy.settings.appSections.env}
      action={
        <Button variant="quiet" size="sm" onClick={() => (setAdding(true), setError(null))}>
          <Plus />
          {copy.settings.add}
        </Button>
      }
    >
      <p className="pt-2 pb-1 text-xs text-muted-foreground">{copy.settings.envHint}</p>
      {env.isLoading ? (
        <Skeleton className="my-3 h-4 w-40" />
      ) : env.data?.length ? (
        env.data.map((entry) => (
          <Row
            key={entry.key}
            label={<span className="font-mono text-[13px]">{entry.key}</span>}
            value="••••••"
            action={
              <Button
                variant="quiet"
                size="icon-sm"
                aria-label={`${entry.key} ${copy.settings.delete}`}
                onClick={() =>
                  void backend.settings
                    .removeEnv(entry.key)
                    .then(() => client.invalidateQueries({ queryKey: keys.env }))
                    .then(() => toast(copy.settings.envRemoved))
                    .catch((failure: unknown) => toast(errorText(failure), { tone: "error" }))
                }
              >
                <Trash2 />
              </Button>
            }
          />
        ))
      ) : (
        <p className="py-3 text-sm text-muted-foreground">{copy.settings.envEmpty}</p>
      )}
      <Dialog
        open={adding}
        onOpenChange={setAdding}
        title={copy.settings.appSections.env}
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

function AboutSection() {
  const backend = useBackend();
  const versions = useQuery({ queryKey: keys.versions, queryFn: () => backend.settings.versions(), staleTime: 5 * 60_000 });
  const demo = backend.mode === "demo";
  return (
    <Section title={copy.settings.appSections.about}>
      <Row label={copy.settings.versionApp} value={versions.data?.app ?? "—"} />
      <Row label={copy.settings.versionServer} value={versions.data?.server ?? (demo ? copy.boot.demoBadge : "—")} />
      <Row label={copy.settings.versionEngine} value={versions.data?.engine ?? (demo ? copy.boot.demoBadge : "—")} />
      <Row label={copy.settings.updates} action={<Locked>{copy.settings.updatesLocked}</Locked>} />
    </Section>
  );
}

function DemoSection() {
  const backend = useBackend();
  const [confirming, setConfirming] = useState(false);
  if (backend.mode !== "demo" || !("reset" in backend) || typeof backend.reset !== "function") return null;
  const reset = backend.reset;
  return (
    <Section title={copy.settings.appSections.demo}>
      <Row
        label={copy.settings.demoReset}
        hint={copy.boot.demoHint}
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
  );
}

export function AppSettingsPage() {
  const projects = useProjects();
  const anchor = projects.data?.find((project) => !project.archivedAt) ?? null;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBar>
        <PageTitle>{copy.settings.title}</PageTitle>
      </TopBar>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-4 pt-6 pb-16 sm:px-6 sm:pt-8">
          <KeysSection />
          <AppearanceSection />
          <BrainsAppSection />
          {anchor ? (
            <>
              <SkillsList projectId={anchor.id} scope="global" />
              <CommandsList projectId={anchor.id} scope="global" />
            </>
          ) : null}
          <EnvSection />
          <AboutSection />
          <DemoSection />
        </div>
      </main>
    </div>
  );
}
