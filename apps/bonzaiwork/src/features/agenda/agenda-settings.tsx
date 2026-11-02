import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useBackend } from "~/backend/context";
import { keys, useAgendaSettings, useStatus } from "~/backend/queries";
import { Button } from "~/components/ui/button";
import { Locked, Row, Section, Skeleton } from "~/components/ui/misc";
import { Dialog } from "~/components/ui/overlay";
import { Switch } from "~/components/ui/switch";
import { copy } from "~/copy";
import { errorText } from "~/lib/errors";

import { BridgePostField, draftPost, emptyPost, PostLine, type PostDraft } from "./bridge-post-field";

/**
 * The agenda in the settings (plan §7.5): the Bridge post of a project under "Algemeen", and
 * "Werkdag bijhouden" in the app settings. The row shows the new state; nothing else announces it
 * (plan §7.6). Without the agenda on the server both stay visible with a lock (P4).
 */

function PostDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; projectId: string; current: PostDraft; hasPost: boolean }) {
  const backend = useBackend();
  const client = useQueryClient();
  const settings = useAgendaSettings();
  const [draft, setDraft] = useState(props.current);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const store = async (post: ReturnType<typeof draftPost>) => {
    if (post === "invalid") return;
    setBusy(true);
    setFailure(null);
    try {
      await backend.agenda.setProjectPost(props.projectId, post);
      await client.invalidateQueries({ queryKey: keys.agenda });
      props.onOpenChange(false);
    } catch (error) {
      setFailure(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={props.hasPost ? copy.agenda.post.edit : copy.agenda.post.set}
      footer={
        <>
          {props.hasPost ? (
            <Button variant="quiet" className="sm:me-auto" onClick={() => void store(null)} disabled={busy}>
              {copy.agenda.post.remove}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => props.onOpenChange(false)} disabled={busy}>
            {copy.common.cancel}
          </Button>
          <Button
            variant="primary"
            data-testid="bridge-post-save"
            disabled={busy}
            onClick={() => {
              setTried(true);
              void store(draftPost(draft));
            }}
          >
            {copy.agenda.post.save}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setTried(true);
          void store(draftPost(draft));
        }}
        className="flex flex-col gap-3"
      >
        <BridgePostField value={draft} onChange={setDraft} recent={settings.data?.recentPosts ?? []} showError={tried} autoFocus />
        {failure ? (
          <p role="alert" className="text-xs text-destructive-foreground">
            {failure}
          </p>
        ) : null}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

/** "Bridge-post" in the general project settings. */
export function ProjectPostRow(props: { projectId: string }) {
  const backend = useBackend();
  const status = useStatus();
  const settings = useAgendaSettings();
  const [editing, setEditing] = useState(false);
  const post = settings.data?.projects.find((project) => project.workspaceId === props.projectId)?.bridgePost ?? null;
  const readOnly = status.data?.readOnly ?? false;

  if (!backend.capabilities.agenda) return <Row label={copy.agenda.bridgePost} action={<Locked>{copy.agenda.unavailable}</Locked>} />;
  return (
    <>
      <Row
        label={copy.agenda.bridgePost}
        value={settings.isLoading ? <Skeleton className="h-4 w-32" /> : <span data-testid="project-bridge-post"><PostLine post={post} /></span>}
        action={
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)} disabled={readOnly || settings.isLoading} data-testid="project-bridge-post-edit">
            {copy.agenda.edit}
          </Button>
        }
      />
      {editing ? <PostDialog open={editing} onOpenChange={setEditing} projectId={props.projectId} current={emptyPost(post)} hasPost={post !== null} /> : null}
    </>
  );
}

/** "Agenda" in the app settings: tracking on or off. */
export function AgendaAppSection() {
  const backend = useBackend();
  const client = useQueryClient();
  const status = useStatus();
  const settings = useAgendaSettings();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const available = backend.capabilities.agenda;

  const change = async (enabled: boolean) => {
    setBusy(true);
    setFailure(null);
    try {
      await backend.agenda.setEnabled(enabled);
      await client.invalidateQueries({ queryKey: keys.agenda });
    } catch (error) {
      setFailure(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title={copy.agenda.settings.section}>
      <Row
        label={copy.agenda.settings.track}
        hint={failure ? <span role="alert" className="text-destructive-foreground">{failure}</span> : undefined}
        action={
          !available ? (
            <Locked>{copy.agenda.unavailable}</Locked>
          ) : settings.isLoading ? (
            <Skeleton className="h-5 w-8 rounded-full" />
          ) : (
            <Switch checked={settings.data?.enabled ?? false} onCheckedChange={(value) => void change(value)} label={copy.agenda.settings.track} disabled={busy || (status.data?.readOnly ?? false)} />
          )
        }
      />
    </Section>
  );
}
