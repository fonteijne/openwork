import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BookOpen, CalendarClock, Clock, Repeat, Square } from "lucide-react";

import { useBackend } from "~/backend/context";
import { keys, projectHasKey, useAgendaDay, useAgendaSettings, useStatus } from "~/backend/queries";
import type { AttentionItem, Chat, DayView, Project, ProjectSummary, Routine } from "~/backend/types";
import { ProjectIcon } from "~/components/project-icon";
import { Button } from "~/components/ui/button";
import { StatusChip, type ChipStatus } from "~/components/ui/chip";
import { Kbd } from "~/components/ui/misc";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";
import { formatTime, formatWhen, relativeTime } from "~/lib/format";
import { href } from "~/lib/router";
import { chord } from "~/lib/shortcuts";
import { useMediaQuery, WIDE } from "~/lib/use-media";

import { dateOf, dutchDuration, minutesToBook } from "../agenda/format";
import { useUi } from "../shell/ui-store";
import { SectionHeading } from "./attention-section";
import { attentionChat, MAX_PROJECT_ROWS, projectNeed, type AwayRow } from "./model";

const ROW = "flex min-h-11 items-center gap-3 border-b border-border py-2 text-sm last:border-b-0";

function Tile(props: { project: Project }) {
  return <ProjectIcon icon={props.project.icon} color={props.project.color} size="sm" />;
}

// ---------------------------------------------------------------------------
// Bezig
// ---------------------------------------------------------------------------

function BusyRow(props: { chat: Chat; project: Project }) {
  const backend = useBackend();
  const client = useQueryClient();
  const [stopping, setStopping] = useState(false);
  const { chat, project } = props;
  const stop = async () => {
    setStopping(true);
    try {
      await backend.chats.abort(project.id, chat.id);
      if (backend.capabilities.agenda) void backend.agenda.reportPresence({ projectId: project.id, name: project.name });
      toast(copy.home.stopped);
      await Promise.all([client.invalidateQueries({ queryKey: keys.recent }), client.invalidateQueries({ queryKey: keys.attention }), client.invalidateQueries({ queryKey: keys.summaries })]);
    } catch (failure) {
      toast(errorText(failure), { tone: "error" });
    } finally {
      setStopping(false);
    }
  };
  return (
    <li className={ROW} data-testid="home-busy-row">
      <Tile project={project} />
      <span className="flex min-w-0 flex-1 flex-col">
        <a href={href({ name: "project", projectId: project.id, chatId: chat.id })} className="truncate font-medium text-foreground hover:underline underline-offset-2">
          {chat.untitled ? copy.chat.untitled : chat.title}
        </a>
        <span className="flex min-w-0 items-center gap-1.5 text-xs">
          <span className="truncate text-muted-foreground">{project.name}</span>
          <span aria-hidden="true" className="text-subtle-foreground">
            ·
          </span>
          {/* The running step shimmers (V6); without the chat's messages the word carries the state. */}
          <span className="bw-shimmer font-medium" role="status">
            {copy.home.busyNow}
          </span>
        </span>
      </span>
      <span className="shrink-0 text-xs text-subtle-foreground">{relativeTime(chat.updatedAt)}</span>
      <Button variant="ghost" size="sm" disabled={stopping} onClick={() => void stop()} aria-label={`${copy.home.stop}: ${chat.title}`}>
        <Square className="size-3! fill-current" />
        {copy.home.stop}
      </Button>
    </li>
  );
}

export function BusySection(props: { chats: readonly Chat[]; projects: ReadonlyMap<string, Project> }) {
  const rows = props.chats.filter((chat) => chat.status === "running" && !chat.parentId && props.projects.has(chat.projectId));
  if (!rows.length) return null;
  return (
    <section aria-labelledby="home-busy" data-testid="home-busy">
      <SectionHeading id="home-busy" title={copy.home.busy} count={rows.length} />
      <ul className="border-t border-border">
        {rows.map((chat) => {
          const project = props.projects.get(chat.projectId);
          return project ? <BusyRow key={chat.id} chat={chat} project={project} /> : null;
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Terwijl je weg was
// ---------------------------------------------------------------------------

function AwayRowView(props: { row: AwayRow; project: Project }) {
  const { row, project } = props;
  if (row.kind === "chat") {
    const { chat } = row;
    return (
      <li className={ROW}>
        <Tile project={project} />
        <span className="flex min-w-0 flex-1 flex-col">
          <a href={href({ name: "project", projectId: project.id, chatId: chat.id })} className="truncate text-foreground hover:underline underline-offset-2">
            {chat.preview ?? (chat.untitled ? copy.chat.untitled : chat.title)}
          </a>
          <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
            {chat.routineId ? (
              <span className="inline-flex items-center gap-1">
                <Repeat aria-hidden="true" className="size-3" />
                {copy.home.routineChat}
              </span>
            ) : null}
            {chat.routineId ? <span aria-hidden="true">·</span> : null}
            <span className="truncate">{chat.preview ? chat.title : project.name}</span>
          </span>
        </span>
        <span className="shrink-0 text-xs text-subtle-foreground">{relativeTime(row.at)}</span>
      </li>
    );
  }
  return (
    <li className={ROW}>
      <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-[5px] bg-muted text-muted-foreground">
        <BookOpen aria-hidden="true" className="size-3" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <a href={href({ name: "project-brain", projectId: project.id })} className="truncate text-foreground hover:underline underline-offset-2">
          {copy.home.brainChange(row.entry.author, row.entry.title)}
        </a>
        <span className="truncate text-xs text-muted-foreground">
          {copy.project.tabs.brain} · {project.name}
        </span>
      </span>
      <span className="shrink-0 text-xs text-subtle-foreground">{relativeTime(row.at)}</span>
    </li>
  );
}

export function WhileAwaySection(props: { rows: readonly AwayRow[]; projects: ReadonlyMap<string, Project>; lastSeenAt: number; onSeenAll: () => void }) {
  const rows = props.rows.filter((row) => props.projects.has(row.projectId));
  if (!rows.length) return null;
  const sameDay = dateOf(props.lastSeenAt) === dateOf(Date.now());
  return (
    <section aria-labelledby="home-away" data-testid="home-away">
      <SectionHeading
        id="home-away"
        title={copy.home.whileAway}
        trailing={
          <>
            <span className="text-xs text-subtle-foreground">{copy.home.since(sameDay ? formatTime(props.lastSeenAt) : relativeTime(props.lastSeenAt))}</span>
            <Button variant="quiet" size="sm" onClick={props.onSeenAll} data-testid="home-seen-all">
              {copy.home.allSeen}
              <Kbd className="pointer-coarse:hidden">{chord("seenAll")}</Kbd>
            </Button>
          </>
        }
      />
      <ul className="border-t border-border">
        {rows.map((row) => {
          const project = props.projects.get(row.projectId);
          return project ? <AwayRowView key={row.key} row={row} project={project} /> : null;
        })}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Je werkdag + the next routine
// ---------------------------------------------------------------------------

const dayLabel = new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "short" });

function WorkdayLine(props: { day: DayView }) {
  const wide = useMediaQuery(WIDE);
  const toggle = useUi((state) => state.toggleAgenda);
  const tracked = minutesToBook(props.day);
  const missing = props.day.missingPosts * 15;
  const label = dayLabel.format(Date.now()).replace(".", "");
  return (
    <button
      type="button"
      onClick={() => toggle(wide)}
      className={cn(ROW, "w-full rounded-lg text-start hover:bg-hover")}
      aria-label={`${copy.home.workday}: ${label}, ${copy.home.tracked(dutchDuration(tracked))}${missing ? `, ${copy.home.withoutPost(dutchDuration(missing))}` : ""}. ${copy.agenda.open}`}
      data-testid="home-workday"
    >
      <Clock aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5">
        <span className="font-medium text-foreground">{label}</span>
        <span aria-hidden="true" className="text-subtle-foreground">
          ·
        </span>
        <span className="text-muted-foreground">{copy.home.tracked(dutchDuration(tracked))}</span>
        {missing ? (
          <>
            <span aria-hidden="true" className="text-subtle-foreground">
              ·
            </span>
            {/* Amber only on the missing post (brief §5, V2). */}
            <span className="inline-flex items-center gap-1.5 font-medium text-warning-foreground">
              <span aria-hidden="true" className="size-2 rounded-full bg-amber-9 ring-1 ring-inset ring-amber-11/50" />
              {copy.home.withoutPost(dutchDuration(missing))}
            </span>
          </>
        ) : null}
      </span>
      <span className="shrink-0 text-xs text-subtle-foreground">{copy.agenda.title}</span>
    </button>
  );
}

function NextRoutineLine(props: { routine: Routine | null; projects: ReadonlyMap<string, Project> }) {
  const { routine } = props;
  if (!routine?.nextRunAt) return null;
  const project = props.projects.get(routine.projectId);
  return (
    <a href={href({ name: "project-routines", projectId: routine.projectId, routineId: routine.id })} className={cn(ROW, "rounded-lg hover:bg-hover")} data-testid="home-next-routine">
      <CalendarClock aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">
        <span className="text-muted-foreground">{copy.home.nextRoutine(formatWhen(routine.nextRunAt))}</span>
        <span aria-hidden="true" className="text-subtle-foreground">
          {" · "}
        </span>
        <span className="font-medium text-foreground">{routine.name}</span>
      </span>
      {project ? <span className="shrink-0 text-xs text-subtle-foreground">{project.name}</span> : null}
    </a>
  );
}

/** "Je werkdag" (brief §5): one line that opens the agenda, then the next routine. Only with content. */
export function WorkdaySection(props: { nextRoutine: Routine | null; projects: ReadonlyMap<string, Project> }) {
  const backend = useBackend();
  const available = backend.capabilities.agenda;
  const settings = useAgendaSettings(available);
  const enabled = settings.data?.enabled ?? true;
  const day = useAgendaDay(dateOf(Date.now()), { enabled: available && enabled });
  // Nothing measured yet: no line (a section only renders with content).
  const measured = available && enabled && day.data && (minutesToBook(day.data) > 0 || day.data.missingPosts > 0) ? day.data : null;
  if (!measured && !props.nextRoutine?.nextRunAt) return null;
  return (
    <section aria-labelledby="home-workday-title" data-testid="home-workday-section">
      <SectionHeading id="home-workday-title" title={copy.home.workday} />
      <div className="border-t border-border">
        {measured ? <WorkdayLine day={measured} /> : null}
        <NextRoutineLine routine={props.nextRoutine} projects={props.projects} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Projecten: compact rows, the second line is what needs you (brief §5)
// ---------------------------------------------------------------------------

function projectStatus(hasKey: boolean, summary: ProjectSummary | undefined): ChipStatus {
  if (!hasKey) return "locked";
  if (summary?.waitingCount) return "waiting";
  if (summary?.failedCount) return "failed";
  if (summary?.runningCount) return "running";
  return "idle";
}

function ProjectRow(props: { project: Project; summary: ProjectSummary | undefined; need: AttentionItem | null }) {
  const status = useStatus();
  const { project, summary, need } = props;
  const chip = projectStatus(projectHasKey(status.data, project), summary);
  const chat = need ? attentionChat(need) : null;
  const second = chat ? (
    <a href={href({ name: "project", projectId: project.id, chatId: chat.chatId })} className="truncate text-xs text-electric-11 hover:underline underline-offset-2">
      {chat.title}
    </a>
  ) : need?.kind === "routine" ? (
    <a href={href({ name: "project-routines", projectId: project.id, routineId: need.routineId })} className="truncate text-xs text-electric-11 hover:underline underline-offset-2">
      {need.name}
    </a>
  ) : need?.kind === "brain" ? (
    <a href={href({ name: "project-brain", projectId: project.id })} className="truncate text-xs text-electric-11 hover:underline underline-offset-2">
      {copy.brain.states[need.state]}
    </a>
  ) : (
    <span className="truncate text-xs text-muted-foreground">{summary ? (summary.chatCount ? copy.projects.chats(summary.chatCount) : copy.projects.noChats) : ""}</span>
  );
  return (
    <li className={ROW} data-testid="home-project-row">
      <Tile project={project} />
      <span className="flex min-w-0 flex-1 flex-col">
        <a href={href({ name: "project", projectId: project.id, chatId: null })} className="truncate font-medium text-foreground hover:underline underline-offset-2">
          {project.name}
        </a>
        {second}
      </span>
      <StatusChip status={chip} label={chip === "locked" ? copy.shell.status.locked : chip === "idle" ? undefined : undefined} className="shrink-0" />
    </li>
  );
}

export function ProjectsSection(props: { projects: readonly Project[]; summaries: ReadonlyMap<string, ProjectSummary>; items: readonly AttentionItem[] }) {
  const shown = props.projects.slice(0, MAX_PROJECT_ROWS);
  if (!shown.length) return null;
  return (
    <section aria-labelledby="home-projects" data-testid="home-projects">
      <SectionHeading
        id="home-projects"
        title={copy.home.projects}
        trailing={
          <a href={href({ name: "projects" })} className="text-xs font-medium text-muted-foreground hover:text-foreground">
            {copy.home.allProjects}
          </a>
        }
      />
      <ul className="border-t border-border">
        {shown.map((project) => (
          <ProjectRow key={project.id} project={project} summary={props.summaries.get(project.id)} need={projectNeed(project.id, props.items)} />
        ))}
      </ul>
    </section>
  );
}
