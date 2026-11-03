import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Pin, PinOff, Plus, X } from "lucide-react";

import { useBackend } from "~/backend/context";
import { keys, useAgendaDay, useAgendaSettings, useProject, useProjects, useStatus } from "~/backend/queries";
import type { BridgePost, DayView, Project } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { EmptyState, Locked, Skeleton } from "~/components/ui/misc";
import { Panel, Sheet } from "~/components/ui/overlay";
import { Switch } from "~/components/ui/switch";
import { toast } from "~/components/ui/toast";
import { Tooltip } from "~/components/ui/tooltip";
import { copy } from "~/copy";
import { peekAgendaReturnFocus, takeAgendaReturnFocus, useUi } from "~/features/shell/ui-store";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";
import { navigate } from "~/lib/router";
import { chord } from "~/lib/shortcuts";
import { SMALL_UP, useMediaQuery, WIDE } from "~/lib/use-media";

import { BookingExport, type Booked } from "./booking-export";
import { DayCard } from "./day-card";
import { keyRanges, type DayCardRow } from "./day-model";
import { dateOf, dayTitle, defaultQuarter, dutchDuration, minutesToBook } from "./format";
import { QuarterEditor, type EditorInput, type EditorResult } from "./quarter-editor";
import { Timeline, type EditTarget } from "./timeline";
import { WeekStrip } from "./week-strip";

/**
 * The agenda panel (plan §7.2–7.3; brief §8). It opens with the Dagkaart: the end-of-day decision
 * (per post, what still misses a post, what is not booked) is the focal element (P7); then the
 * week strip, then the timeline as detail. Editing replaces the body, never the toolbar, so the
 * buttons stay where they are (P11). Confirmations and undo live in the panel itself; only
 * "Geboekt" leaves it, as the toast of the chat it made (brief §10, C2). It is a lazy chunk,
 * loaded the first time the agenda opens (plan §7.6).
 */

type Notice = { text: string; undoIds: string[] };
type View = { kind: "timeline" } | { kind: "edit"; input: EditorInput };

function editInput(day: DayView, target: EditTarget): EditorInput {
  const quarters = day.quarters.filter((quarter) => quarter.start >= target.from.start && quarter.end <= target.to.end);
  const first = target.from;
  const one = (values: (string | null)[]) => {
    const unique = [...new Set(values)];
    return unique.length === 1 ? (unique[0] ?? null) : null;
  };
  return {
    date: day.date,
    mode: "edit",
    from: target.from.key,
    to: target.to.key,
    // A measured away stretch is usually a meeting: start from "Meeting of anders" (plan A2).
    kind: first.kind === "away" && first.source === "measured" ? "other" : first.kind,
    workspaceId: first.workspaceId,
    label: first.kind === "other" ? first.label : "",
    post: first.kind === "other" ? first.bridgePost : null,
    note: one(quarters.map((quarter) => quarter.note)),
    reference: one(quarters.map((quarter) => quarter.reference)),
    canReset: quarters.some((quarter) => quarter.source === "user"),
  };
}

function PanelNotice(props: { notice: Notice | null; onUndo: (undoIds: string[]) => void; onDismiss: () => void }) {
  const { notice, onDismiss } = props;
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(onDismiss, notice.undoIds.length ? 6_000 : 3_500);
    return () => clearTimeout(timer);
  }, [notice, onDismiss]);
  return (
    <div role="status" aria-live="polite" className="px-3 pb-3 empty:hidden">
      {notice ? (
        <div className="flex items-center gap-2 rounded-2xl bg-inverse py-1.5 ps-3.5 pe-1.5 text-sm text-inverse-foreground shadow-shell" data-testid="agenda-notice">
          <span className="min-w-0 flex-1 truncate">{notice.text}</span>
          {notice.undoIds.length ? (
            <button type="button" className="h-7 shrink-0 rounded-full px-3 text-sm font-semibold text-inverse-accent hover:bg-inverse-hover" onClick={() => props.onUndo(notice.undoIds)}>
              {copy.common.undo}
            </button>
          ) : null}
          <button type="button" className="flex size-7 shrink-0 items-center justify-center rounded-full text-inverse-muted-foreground hover:bg-inverse-hover hover:text-inverse-foreground" aria-label={copy.common.close} onClick={onDismiss}>
            <X className="size-4" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Loading keeps the destination layout: a card, a strip, rows. */
function BodySkeleton() {
  return (
    <div className="flex flex-col gap-3 px-2 py-2" aria-hidden="true">
      <Skeleton className="h-24 rounded-2xl" />
      <Skeleton className="h-11 rounded-xl" />
      {[0, 1, 2].map((index) => (
        <div key={index} className="flex flex-col gap-1.5 px-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-40" />
        </div>
      ))}
    </div>
  );
}

export function AgendaPanel(props: { variant: "column" | "overlay" | "sheet"; projectId: string | null; headingRef?: React.RefObject<HTMLHeadingElement | null> }) {
  const backend = useBackend();
  const client = useQueryClient();
  const wide = useMediaQuery(WIDE);
  const setAgenda = useUi((state) => state.setAgenda);
  const setPinned = useUi((state) => state.setAgendaPinned);
  const pinned = useUi((state) => state.agendaPinned);
  const status = useStatus();
  const readOnly = status.data?.readOnly ?? false;
  const available = backend.capabilities.agenda;
  const settings = useAgendaSettings(available);
  const enabled = settings.data?.enabled ?? true;
  const projects = useProjects();
  const projectMap = useMemo(() => new Map<string, Project>((projects.data ?? []).map((project) => [project.id, project])), [projects.data]);
  const { project } = useProject(props.projectId ?? "");
  const today = dateOf(Date.now());
  const [date, setDate] = useState(today);
  const day = useAgendaDay(date, { enabled: available });
  const [view, setView] = useState<View>({ kind: "timeline" });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [exporting, setExporting] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [busyRow, setBusyRow] = useState<string | null>(null);

  const dismiss = useRef(() => setNotice(null)).current;
  const refresh = () => client.invalidateQueries({ queryKey: keys.agenda });

  const goTo = (next: string) => {
    setDate(next > today ? today : next);
    setView({ kind: "timeline" });
  };

  const done = (result: EditorResult) => {
    setView({ kind: "timeline" });
    setNotice({ text: result.message, undoIds: [result.undoId] });
    void refresh();
  };

  const undo = async (undoIds: string[]) => {
    try {
      for (const undoId of [...undoIds].reverse()) await backend.agenda.undo(undoId);
      setNotice({ text: copy.agenda.undone, undoIds: [] });
    } catch (error) {
      setNotice({ text: errorText(error), undoIds: [] });
    }
    void refresh();
  };

  /**
   * "Kies post" on a Dagkaart row (H3): for a project the post is the project's setting; for a
   * label of your own it is a correction of those quarters, with undo (P8).
   */
  const choosePost = async (row: DayCardRow, post: BridgePost) => {
    setBusyRow(row.id);
    try {
      const undoIds: string[] = [];
      if (row.kind === "project") {
        const ids = [...new Set(row.quarters.flatMap((quarter) => (quarter.workspaceId ? [quarter.workspaceId] : [])))];
        for (const workspaceId of ids) await backend.agenda.setProjectPost(workspaceId, post);
      } else {
        for (const range of keyRanges(row.quarters)) {
          const result = await backend.agenda.setQuarters({ date, from: range.from, to: range.to, correction: { kind: "other", label: row.label, bridgePost: post } });
          undoIds.push(result.undoId);
        }
      }
      setNotice({ text: copy.agenda.dayCard.postChosen(post.label ?? post.entityId), undoIds });
      await refresh();
    } catch (error) {
      setNotice({ text: errorText(error), undoIds: [] });
    } finally {
      setBusyRow(null);
    }
  };

  const add = () => {
    const quarter = defaultQuarter(date, Date.now());
    setView({
      kind: "edit",
      input: { date, mode: "add", from: quarter, to: quarter, kind: project ? "project" : "other", workspaceId: project?.id ?? null, label: "", post: null, note: null, reference: null, canReset: false },
    });
  };

  const setEnabled = async (value: boolean) => {
    setSwitching(true);
    try {
      await backend.agenda.setEnabled(value);
      await refresh();
    } catch (error) {
      setNotice({ text: errorText(error), undoIds: [] });
    } finally {
      setSwitching(false);
    }
  };

  /** The booking chat is the person's object: it opens, and the action keeps its name (C2). */
  const booked = (result: Booked) => {
    setExporting(false);
    toast(copy.agenda.export.bookedIn(result.projectName));
    if (props.variant !== "column") setAgenda(false, wide);
    navigate({ name: "project", projectId: result.projectId, chatId: result.chatId });
  };

  const close = () => setAgenda(false, wide);
  const editing = view.kind === "edit";
  const disabled = readOnly || !available;

  let body: React.ReactNode;
  if (!available) {
    body = (
      <div className="flex flex-col gap-2 px-2 py-6">
        <Locked>{copy.agenda.unavailable}</Locked>
        <p className="text-xs text-muted-foreground">{copy.agenda.unavailableOwner}</p>
      </div>
    );
  } else if (view.kind === "edit") {
    body = (
      <div className="px-2 py-3">
        <QuarterEditor key={`${view.input.from}-${view.input.to}`} input={view.input} readOnly={readOnly} onDone={done} onCancel={() => setView({ kind: "timeline" })} />
      </div>
    );
  } else if (day.isLoading) {
    body = <BodySkeleton />;
  } else if (day.isError || !day.data) {
    body = (
      <EmptyState
        title={errorText(day.error)}
        action={
          <Button variant="secondary" size="sm" onClick={() => void day.refetch()}>
            {copy.agenda.retry}
          </Button>
        }
      />
    );
  } else {
    const data = day.data;
    const measured = data.blocks.length > 0;
    body = (
      <div className="flex flex-col gap-3 px-2 py-2">
        {measured ? <DayCard day={data} projects={projectMap} recent={settings.data?.recentPosts ?? []} disabled={disabled} busyRowId={busyRow} onChoosePost={(row, post) => void choosePost(row, post)} /> : null}
        <WeekStrip date={date} today={today} onSelect={goTo} />
        {measured ? (
          <Timeline day={data} projects={projectMap} disabled={disabled} onEdit={(target) => setView({ kind: "edit", input: editInput(data, target) })} />
        ) : (
          // Title only (P2); "Toevoegen" is right above it.
          <EmptyState title={copy.agenda.empty} className="py-8" />
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="agenda-panel" data-variant={props.variant}>
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border ps-4 pe-2">
        <h2 ref={props.headingRef} tabIndex={-1} className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground outline-none">
          {copy.agenda.title}
        </h2>
        {wide && props.variant !== "sheet" ? (
          <Tooltip label={pinned && props.variant === "column" ? copy.agenda.unpin : copy.agenda.pin}>
            <Button variant="quiet" size="icon-sm" aria-label={pinned && props.variant === "column" ? copy.agenda.unpin : copy.agenda.pin} aria-pressed={props.variant === "column"} onClick={() => setPinned(props.variant !== "column", wide)}>
              {props.variant === "column" ? <PinOff /> : <Pin />}
            </Button>
          </Tooltip>
        ) : null}
        <Tooltip label={copy.agenda.close} shortcut={chord("agenda")}>
          <Button variant="quiet" size="icon-sm" aria-label={copy.agenda.close} onClick={close} data-testid="agenda-close">
            <X />
          </Button>
        </Tooltip>
      </div>

      {available ? (
        <div className="flex shrink-0 flex-col gap-2 px-3 pt-2 pb-2">
          <div className="flex h-7 items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground" aria-live="polite" data-testid="agenda-date">
              {dayTitle(date, today)}
            </span>
            {date !== today ? (
              <Button variant="quiet" size="sm" onClick={() => goTo(today)} data-testid="agenda-today">
                {copy.agenda.week.today}
              </Button>
            ) : null}
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground" data-testid="agenda-total">
              {day.data ? copy.agenda.toBook(dutchDuration(minutesToBook(day.data))) : null}
            </span>
          </div>
          {/* The toolbar stays while editing (P11): "Toevoegen" is merely off, "Boeken" keeps working. */}
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={add} disabled={disabled || editing} data-testid="agenda-add">
              <Plus />
              {copy.agenda.add}
            </Button>
            <Button variant="secondary" size="sm" className="ms-auto" onClick={() => setExporting(true)} data-testid="agenda-export-open">
              <MessageSquare />
              {copy.agenda.export.open}
            </Button>
          </div>
          {!enabled ? (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-muted px-3 py-2">
              <Locked>{copy.agenda.off}</Locked>
              <Switch checked={false} onCheckedChange={(value) => void setEnabled(value)} label={copy.agenda.settings.track} disabled={readOnly || switching} />
            </div>
          ) : null}
          {readOnly ? <Locked>{copy.agenda.readOnly}</Locked> : null}
        </div>
      ) : null}

      <div className={cn("min-h-0 flex-1 overflow-y-auto", !available && "px-3")}>{body}</div>

      <PanelNotice notice={notice} onUndo={(undoIds) => void undo(undoIds)} onDismiss={dismiss} />

      {available ? (
        <BookingExport
          open={exporting}
          onOpenChange={setExporting}
          today={today}
          onShowDate={(target) => {
            setExporting(false);
            goTo(target);
          }}
          onBooked={booked}
        />
      ) : null}
    </div>
  );
}

/**
 * Where the panel lives (plan §7.2): a column of its own when pinned on a wide screen; otherwise a
 * non-modal overlay; on phones the regular sheet (modal is fine there, it covers everything anyway).
 */
export function AgendaPanelHost(props: { projectId: string | null }) {
  const wide = useMediaQuery(WIDE);
  const smallUp = useMediaQuery(SMALL_UP);
  const open = useUi((state) => state.agendaOpen);
  const pinned = useUi((state) => state.agendaPinned);
  const setAgenda = useUi((state) => state.setAgenda);
  const column = open && pinned && wide;
  const overlayHeading = useRef<HTMLHeadingElement>(null);
  const columnHeading = useRef<HTMLHeadingElement>(null);
  const columnRef = useRef<HTMLElement>(null);
  const wasColumn = useRef(column);

  // A pinned column on a screen that becomes narrow closes instead of turning into an overlay (S5).
  useEffect(() => {
    if (wasColumn.current && !wide && open && pinned) setAgenda(false, false);
    wasColumn.current = column;
  }, [column, wide, open, pinned, setAgenda]);

  // The column takes focus only when the person opened it, and gives it back when it closes.
  useEffect(() => {
    if (!column) return;
    const element = columnRef.current;
    if (peekAgendaReturnFocus()) columnHeading.current?.focus();
    return () => {
      const active = document.activeElement;
      const back = takeAgendaReturnFocus();
      if (back?.isConnected && (!active || active === document.body || element?.contains(active))) back.focus();
    };
  }, [column]);

  return (
    <>
      {column ? (
        <aside ref={columnRef} className="flex w-80 shrink-0 flex-col border-s border-border bg-background" aria-label={copy.agenda.title}>
          <AgendaPanel variant="column" projectId={props.projectId} headingRef={columnHeading} />
        </aside>
      ) : null}
      <Panel open={open && !column && smallUp} onOpenChange={(next) => setAgenda(next, wide)} label={copy.agenda.title} initialFocus={overlayHeading}>
        <AgendaPanel variant="overlay" projectId={props.projectId} headingRef={overlayHeading} />
      </Panel>
      <Sheet open={open && !column && !smallUp} onOpenChange={(next) => setAgenda(next, wide)} side="right" label={copy.agenda.title}>
        <AgendaPanel variant="sheet" projectId={props.projectId} />
      </Sheet>
    </>
  );
}
