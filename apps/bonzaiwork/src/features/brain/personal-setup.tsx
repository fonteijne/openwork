import { useState } from "react";
import { BrainCircuit, FolderOpen } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { useBackend } from "~/backend/context";
import { keys, useBrainAuthor, usePersonalBrain, useStatus } from "~/backend/queries";
import type { Project } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { Field, Input } from "~/components/ui/field";
import { Locked, Row, Section } from "~/components/ui/misc";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { errorText } from "~/lib/errors";
import { navigate } from "~/lib/router";
import { readLocal, writeLocal } from "~/lib/storage";

export const PERSONAL_LATER_KEY = "bonzaiwork.personalBrainLater";

/**
 * Makes the personal brain (brains plan §5.1): a project named "Mijn brein"
 * on an existing notes folder or a new one, registered as kind personal.
 * Nothing is copied or moved; history lives outside the folder.
 */
function usePersonalSetup() {
  const backend = useBackend();
  const client = useQueryClient();
  const [busy, setBusy] = useState<"existing" | "new" | null>(null);
  const [typing, setTyping] = useState(false);
  const [path, setPath] = useState("");

  const create = async (kind: "existing" | "new", folderPath: string | null): Promise<Project | null> => {
    setBusy(kind);
    try {
      const project = await backend.projects.create({
        name: copy.brain.personalName,
        description: null,
        color: "violet",
        icon: "lightbulb",
        folderPath,
        instructions: null,
        defaultModel: null,
      });
      await backend.brains.register(project.id, { kind: "personal" });
      await Promise.all([client.invalidateQueries({ queryKey: keys.projects }), client.invalidateQueries({ queryKey: keys.brains })]);
      toast(copy.brain.personalReady);
      return project;
    } catch (failure) {
      toast(errorText(failure), { tone: "error" });
      return null;
    } finally {
      setBusy(null);
    }
  };

  const chooseExisting = async (): Promise<Project | null> => {
    if (!backend.capabilities.folderPicker) {
      if (!typing) {
        setTyping(true);
        return null;
      }
      return path.trim() ? create("existing", path.trim()) : null;
    }
    const picked = await backend.desktop.pickFolder();
    return picked ? create("existing", picked) : null;
  };

  return { busy, typing, path, setPath, chooseExisting, createNew: () => create("new", null) };
}

function TypedFolder(props: { value: string; onChange: (value: string) => void; onSubmit: () => void }) {
  return (
    <Input
      aria-label={copy.newProject.folderPathLabel}
      placeholder="/Users/jij/Documenten/Notities"
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") props.onSubmit();
      }}
      autoFocus
      className="font-mono"
    />
  );
}

/** Onboarding step before the first project; "Later" keeps it in Instellingen. */
export function PersonalBrainStep(props: { onLater: () => void }) {
  const setup = usePersonalSetup();
  const open = (project: Project | null) => {
    if (project) navigate({ name: "project", projectId: project.id, chatId: null });
  };
  return (
    <div className="flex w-full flex-col gap-4" data-testid="personal-brain-step">
      <div>
        <h1 className="text-2xl font-medium tracking-tight">{copy.brain.personalTitle}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{copy.brain.personalIntro}</p>
      </div>
      <div className="flex flex-col gap-1">
        <Button variant="primary" size="lg" disabled={setup.busy !== null} onClick={() => void setup.createNew().then(open)}>
          <BrainCircuit />
          {setup.busy === "new" ? copy.common.loading : copy.brain.personalNew}
        </Button>
        <p className="text-xs text-muted-foreground">{copy.brain.personalNewHint}</p>
      </div>
      <div className="flex flex-col gap-1">
        {setup.typing ? <TypedFolder value={setup.path} onChange={setup.setPath} onSubmit={() => void setup.chooseExisting().then(open)} /> : null}
        <Button variant="secondary" size="lg" disabled={setup.busy !== null || (setup.typing && !setup.path.trim())} onClick={() => void setup.chooseExisting().then(open)}>
          <FolderOpen />
          {setup.busy === "existing" ? copy.common.loading : copy.brain.personalExisting}
        </Button>
        <p className="text-xs text-muted-foreground">{copy.brain.personalExistingHint}</p>
      </div>
      <Button variant="quiet" className="self-start" disabled={setup.busy !== null} onClick={() => {
        writeLocal(PERSONAL_LATER_KEY, "1");
        props.onLater();
      }}>
        {copy.brain.personalLater}
      </Button>
    </div>
  );
}

export function personalBrainLater(): boolean {
  return readLocal(PERSONAL_LATER_KEY) === "1";
}

function Author() {
  const backend = useBackend();
  const client = useQueryClient();
  const author = useBrainAuthor();
  const current = author.data?.author ?? author.data?.suggested ?? null;
  const [name, setName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const shownName = name ?? current?.name ?? "";
  const shownEmail = email ?? current?.email ?? "";
  const changed = shownName.trim() !== (author.data?.author?.name ?? "") || shownEmail.trim() !== (author.data?.author?.email ?? "");

  const save = async () => {
    setBusy(true);
    try {
      await backend.brains.setAuthor({ name: shownName.trim(), email: shownEmail.trim() });
      await client.invalidateQueries({ queryKey: keys.brainAuthor });
      setName(null);
      setEmail(null);
      toast(copy.brain.authorSaved);
    } catch (failure) {
      toast(errorText(failure), { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="grid gap-3 py-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Field label={copy.brain.authorName}>
        {(id) => <Input id={id} value={shownName} onChange={(event) => setName(event.target.value)} autoComplete="name" />}
      </Field>
      <Field label={copy.brain.authorEmail}>
        {(id) => <Input id={id} type="email" value={shownEmail} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />}
      </Field>
      <Button type="submit" variant="secondary" disabled={busy || !changed || !shownName.trim() || !shownEmail.includes("@")}>
        {copy.settings.save}
      </Button>
    </form>
  );
}

/** App settings, "Breinen": the personal brain and the name in every brain's history. */
export function BrainsAppSection() {
  const backend = useBackend();
  const status = useStatus();
  const personal = usePersonalBrain();
  const setup = usePersonalSetup();
  const readOnly = status.data?.readOnly ?? false;
  if (!backend.capabilities.brains) {
    return <Section title={copy.settings.appSections.brains}><Row label={copy.brain.personalTitle} value={<Locked>{copy.brain.locked}</Locked>} /></Section>;
  }
  return (
    <Section title={copy.settings.appSections.brains}>
      {personal ? (
        <Row
          label={copy.brain.personalTitle}
          hint={personal.path}
          action={<Button variant="secondary" size="sm" onClick={() => navigate({ name: "project", projectId: personal.projectId, chatId: null })}>{copy.brain.personalOpen}</Button>}
        />
      ) : (
        <div className="border-b border-border py-3">
          <div className="text-sm font-medium">{copy.brain.personalTitle}</div>
          <p className="text-xs text-muted-foreground">{copy.brain.personalIntro}</p>
          {setup.typing ? <div className="mt-2"><TypedFolder value={setup.path} onChange={setup.setPath} onSubmit={() => void setup.chooseExisting()} /></div> : null}
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" disabled={readOnly || setup.busy !== null} onClick={() => void setup.createNew()}>{copy.brain.personalNew}</Button>
            <Button variant="quiet" size="sm" disabled={readOnly || setup.busy !== null || (setup.typing && !setup.path.trim())} onClick={() => void setup.chooseExisting()}>{copy.brain.personalExisting}</Button>
          </div>
        </div>
      )}
      <div className="pt-3">
        <div className="text-sm font-medium">{copy.brain.authorTitle}</div>
        <p className="text-xs text-muted-foreground">{copy.brain.authorHint}</p>
      </div>
      <Author />
    </Section>
  );
}
