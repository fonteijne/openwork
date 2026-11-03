import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Download, FolderOpen, MessageSquare } from "lucide-react";
import { datesBetween, isDate, proposal } from "@bonzaiwork/agenda/model";

import { useBackend } from "~/backend/context";
import { hasNoModels, startModel } from "~/backend/models";
import { keys, projectHasKey, useProjects, useStatus } from "~/backend/queries";
import type { Project } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { Field, Input } from "~/components/ui/field";
import { Locked, Row, Skeleton } from "~/components/ui/misc";
import { Dialog } from "~/components/ui/overlay";
import { Select } from "~/components/ui/select";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { errorText } from "~/lib/errors";
import { readLocal, writeLocal } from "~/lib/storage";

import { useUi } from "../shell/ui-store";
import { dutchDuration, MAX_PERIOD_DAYS, periodFor, type PeriodKind } from "./format";

/**
 * "Boeken" (brief §8; assessment I4): a period, what the document will propose, and the way out
 * that is the product itself: **Boek in een chat** makes a chat in a remembered project and
 * sends the booking document as an `.md` attachment with one opening line; the chat is the
 * person's object and opens at once (P11). Copying for another chat and saving in Downloads stay
 * as secondary ways. Nothing blocks: time without a post is a point of attention in the document,
 * not an error here. Failures stay in this dialog with the fix.
 */

type Done = { kind: "copied" } | { kind: "saved"; path: string } | { kind: "failed"; text: string };

/** The project the last booking chat went to, per device. */
const BOOK_PROJECT_KEY = "bonzaiwork.agenda.bookProject";

export type Booked = { projectId: string; chatId: string; projectName: string };

export function BookingExport(props: { open: boolean; onOpenChange: (open: boolean) => void; today: string; onShowDate: (date: string) => void; onBooked: (booked: Booked) => void }) {
  const backend = useBackend();
  const status = useStatus();
  const projects = useProjects();
  const lastProjectId = useUi((state) => state.lastProjectId);
  const [kind, setKind] = useState<PeriodKind>("today");
  const [custom, setCustom] = useState({ from: props.today, to: props.today });
  const [busy, setBusy] = useState<"copy" | "save" | "book" | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [chosenId, setChosenId] = useState<string | null>(null);

  const period = kind === "custom" ? custom : periodFor(kind, props.today);
  const valid = isDate(period.from) && isDate(period.to) && period.to >= period.from;
  const dates = valid ? datesBetween(period.from, period.to) : [];
  const tooLong = dates.length > MAX_PERIOD_DAYS;
  const ready = valid && !tooLong;
  const periodLabel = kind === "custom" ? (period.from === period.to ? period.from : `${period.from} – ${period.to}`) : copy.agenda.exportDialog.periods[kind];

  // Projects a booking chat can start in: a key and a model (P4: the others stay listed, locked).
  const candidates = (projects.data ?? []).filter((project) => !project.archivedAt);
  const usable = (project: Project) => projectHasKey(status.data, project) && !hasNoModels(status.data, project) && startModel(status.data, project) !== null;
  const firstUsable = [readLocal(BOOK_PROJECT_KEY), lastProjectId, ...candidates.map((project) => project.id)]
    .map((id) => candidates.find((project) => project.id === id) ?? null)
    .find((project) => project !== null && usable(project));
  const project = (chosenId ? candidates.find((entry) => entry.id === chosenId) : undefined) ?? firstUsable ?? null;
  const bookable = project !== null && usable(project);

  const summary = useQuery({
    queryKey: [...keys.agenda, "period", period.from, period.to],
    queryFn: async () => proposal(await Promise.all(dates.map((date) => backend.agenda.day(date)))),
    enabled: props.open && ready,
    staleTime: 10_000,
  });

  const choose = (value: string) => {
    setDone(null);
    setKind(value === "yesterday" || value === "week" || value === "lastWeek" || value === "custom" ? value : "today");
  };

  async function copyDocument() {
    setBusy("copy");
    setDone(null);
    try {
      const text = await backend.agenda.bookingDocument(period.from, period.to);
      try {
        await navigator.clipboard.writeText(text);
        setDone({ kind: "copied" });
      } catch {
        setDone({ kind: "failed", text: copy.agenda.exportDialog.copyFailed });
      }
    } catch (error) {
      setDone({ kind: "failed", text: errorText(error) });
    } finally {
      setBusy(null);
    }
  }

  async function saveDocument() {
    setBusy("save");
    setDone(null);
    try {
      const { path } = await backend.agenda.saveBookingDocument(period.from, period.to);
      setDone({ kind: "saved", path });
    } catch (error) {
      setDone({ kind: "failed", text: errorText(error) });
    } finally {
      setBusy(null);
    }
  }

  async function book() {
    if (!project) return;
    const model = startModel(status.data, project);
    if (!model) return;
    setBusy("book");
    setDone(null);
    try {
      const text = await backend.agenda.bookingDocument(period.from, period.to);
      const name = copy.agenda.export.fileName(period.from, period.to);
      const file = new File([text], name, { type: "text/markdown" });
      const chat = await backend.chats.create(project.id, { model, title: copy.agenda.export.chatTitle(periodLabel) });
      // The chat is the person's object (P11): it opens at once, the document arrives in it.
      void backend.chats
        .send(project.id, chat.id, { text: copy.agenda.export.message, model, agent: null, attachments: [{ name, mime: "text/markdown", size: file.size, file }], command: null, skills: [] })
        .catch((failure: unknown) => toast(`${copy.chat.sendFailed} ${errorText(failure)}`, { tone: "error" }));
      writeLocal(BOOK_PROJECT_KEY, project.id);
      if (backend.capabilities.agenda) void backend.agenda.reportPresence({ projectId: project.id, name: project.name });
      props.onBooked({ projectId: project.id, chatId: chat.id, projectName: project.name });
    } catch (error) {
      setDone({ kind: "failed", text: `${copy.agenda.export.bookFailed} ${errorText(error)}` });
    } finally {
      setBusy(null);
    }
  }

  const result = summary.data;
  const firstMissing = result?.missing[0]?.date ?? null;

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={copy.agenda.export.title}
      footer={
        <Button variant="primary" onClick={() => void book()} disabled={!ready || !bookable || busy !== null} data-testid="agenda-export-book">
          <MessageSquare />
          {copy.agenda.export.book}
        </Button>
      }
    >
      <div className="flex flex-col gap-4" data-testid="agenda-export">
        <Field label={copy.agenda.exportDialog.period}>
          {(id) => (
            <Select
              id={id}
              label={copy.agenda.exportDialog.period}
              value={kind}
              onValueChange={choose}
              items={(["today", "yesterday", "week", "lastWeek", "custom"] as const).map((value) => ({ value, label: copy.agenda.exportDialog.periods[value] }))}
            />
          )}
        </Field>
        {kind === "custom" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label={copy.agenda.exportDialog.from}>
              {(id) => <Input id={id} type="date" value={custom.from} max={props.today} onChange={(event) => { setDone(null); setCustom({ ...custom, from: event.target.value }); }} />}
            </Field>
            <Field label={copy.agenda.exportDialog.to} error={!valid ? copy.agenda.exportDialog.invalid : tooLong ? copy.agenda.exportDialog.tooLong : null}>
              {(id, describedBy) => <Input id={id} type="date" aria-describedby={describedBy} value={custom.to} max={props.today} onChange={(event) => { setDone(null); setCustom({ ...custom, to: event.target.value }); }} />}
            </Field>
          </div>
        ) : null}

        <Field label={copy.agenda.export.project}>
          {(id) =>
            candidates.length && !firstUsable && !projects.isLoading ? (
              <Locked>{copy.agenda.export.noProject}</Locked>
            ) : (
              <Select
                id={id}
                label={copy.agenda.export.project}
                value={project?.id ?? null}
                placeholder={copy.agenda.export.chooseProject}
                onValueChange={(value) => {
                  setDone(null);
                  setChosenId(value);
                }}
                disabled={projects.isLoading}
                items={candidates.map((entry) => ({
                  value: entry.id,
                  label: entry.name,
                  hint: !projectHasKey(status.data, entry) ? copy.agenda.export.noKey : hasNoModels(status.data, entry) || startModel(status.data, entry) === null ? copy.agenda.export.noModel : null,
                  disabled: !usable(entry),
                }))}
              />
            )
          }
        </Field>

        <div className="border-t border-border" aria-busy={summary.isLoading || undefined}>
          {summary.isError ? (
            <p className="py-3 text-sm text-muted-foreground">
              {copy.agenda.exportDialog.summaryFailed}{" "}
              <button type="button" className="underline underline-offset-2" onClick={() => void summary.refetch()}>
                {copy.agenda.retry}
              </button>
            </p>
          ) : (
            <>
              <Row label={copy.agenda.exportDialog.toBook} value={result ? <span className="font-medium text-foreground">{dutchDuration(result.minutes.book)}</span> : <Skeleton className="h-4 w-12" />} />
              <Row label={copy.agenda.exportDialog.bookings} value={result ? String(result.bookings.length) : <Skeleton className="h-4 w-6" />} />
              <Row
                label={copy.agenda.exportDialog.withoutPost}
                value={result ? dutchDuration(result.minutes.missing) : <Skeleton className="h-4 w-10" />}
                action={
                  firstMissing ? (
                    <Button variant="secondary" size="sm" onClick={() => props.onShowDate(firstMissing)}>
                      {copy.agenda.exportDialog.view}
                    </Button>
                  ) : undefined
                }
              />
              <Row label={copy.agenda.notBooking} value={result ? dutchDuration(result.minutes.away) : <Skeleton className="h-4 w-10" />} />
            </>
          )}
        </div>

        {/* The other ways out, quiet (brief §8: copy and save are secondary). */}
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm text-muted-foreground">
          <span className="me-1">{copy.agenda.export.secondary}</span>
          <Button variant="quiet" size="sm" onClick={() => void copyDocument()} disabled={!ready || busy !== null} data-testid="agenda-export-copy">
            <Copy />
            {copy.agenda.exportDialog.copy}
          </Button>
          <Button variant="quiet" size="sm" onClick={() => void saveDocument()} disabled={!ready || busy !== null} data-testid="agenda-export-save">
            <Download />
            {copy.agenda.exportDialog.save}
          </Button>
        </div>

        <div role="status" className="min-h-7 text-sm">
          {done?.kind === "copied" ? (
            <span className="inline-flex items-center gap-1.5 text-foreground">
              <Check className="size-4" />
              {copy.agenda.exportDialog.copied}
            </span>
          ) : null}
          {done?.kind === "saved" ? (
            <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1.5 text-foreground">
                <Check className="size-4" />
                {copy.agenda.exportDialog.saved}
              </span>
              <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">{done.path}</span>
              {backend.capabilities.revealPath ? (
                <Button variant="secondary" size="sm" onClick={() => void backend.desktop.revealPath(done.path)}>
                  <FolderOpen />
                  {copy.agenda.exportDialog.reveal}
                </Button>
              ) : null}
            </span>
          ) : null}
          {done?.kind === "failed" ? <span className="text-destructive-foreground">{done.text}</span> : null}
        </div>
      </div>
    </Dialog>
  );
}
