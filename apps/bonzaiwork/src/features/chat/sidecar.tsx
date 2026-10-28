import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, FilePen, FolderOpen, GitBranch, Plug, BookOpen, Repeat, X } from "lucide-react";

import { useBackend } from "~/backend/context";
import { modelName, projectHasKey, useRoutines, useStatus, useSummary, useUsage } from "~/backend/queries";
import type { Chat, Message, Project } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/field";
import { Locked, Skeleton, StatusDot } from "~/components/ui/misc";
import { Dialog } from "~/components/ui/overlay";
import { Select } from "~/components/ui/select";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";
import { formatBytes, formatDateTime, formatMoney, formatTokens, formatWhen, relativeTime } from "~/lib/format";
import { renderMarkdown } from "~/lib/markdown";
import { href } from "~/lib/router";
import { touchedFiles, usedCapabilities } from "~/lib/tools";

import { useProjectState, useRuntime } from "../project/runtime";

function Group(props: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="border-b border-border px-4 py-3.5 last:border-b-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium text-subtle-foreground">{props.title}</h3>
        {props.action}
      </div>
      {props.children}
    </section>
  );
}

function Fact(props: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-7 items-baseline justify-between gap-3 text-sm">
      <dt className="shrink-0 text-muted-foreground">{props.label}</dt>
      <dd className="min-w-0 truncate text-end text-foreground">{props.children}</dd>
    </div>
  );
}

const EMPTY: Message[] = [];

export function FilePreview(props: { projectId: string; chatId: string | null; path: string | null; onClose: () => void }) {
  const backend = useBackend();
  const file = useQuery({
    queryKey: ["file", props.projectId, props.path],
    queryFn: () => backend.config.readFile(props.projectId, props.path ?? "", props.chatId),
    enabled: Boolean(props.path),
  });
  const markdown = props.path?.toLowerCase().endsWith(".md");
  return (
    <Dialog open={Boolean(props.path)} onOpenChange={(open) => !open && props.onClose()} title={<span className="font-mono text-sm">{props.path}</span>} size="lg">
      {file.isLoading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : file.isError ? (
        <p className="text-sm text-muted-foreground">{errorText(file.error)}</p>
      ) : file.data?.content === null || file.data?.content === undefined ? (
        <p className="text-sm text-muted-foreground">Voor dit bestand is geen voorbeeld beschikbaar{file.data ? ` (${formatBytes(file.data.bytes)})` : ""}.</p>
      ) : markdown ? (
        <div className="bw-prose" dangerouslySetInnerHTML={{ __html: renderMarkdown(file.data.content) }} />
      ) : (
        <pre className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs leading-relaxed">{file.data.content}</pre>
      )}
    </Dialog>
  );
}

function ChatDetails(props: { project: Project; chat: Chat }) {
  const backend = useBackend();
  const runtime = useRuntime();
  const status = useStatus();
  const messages = useProjectState((state) => state.messages[props.chat.id]?.list ?? EMPTY);
  const chats = useProjectState((state) => state.chats);
  const groups = useProjectState((state) => state.groups);
  const routines = useRoutines(props.project.id);
  const [note, setNote] = useState(props.chat.note ?? "");
  const [preview, setPreview] = useState<string | null>(null);
  const { chat } = props;

  useEffect(() => setNote(chat.note ?? ""), [chat.id, chat.note]);

  const tokens = useMemo(() => {
    let input = 0;
    let output = 0;
    for (const message of messages) {
      input += message.tokens?.input ?? 0;
      output += message.tokens?.output ?? 0;
    }
    return { input, output };
  }, [messages]);
  const files = useMemo(() => touchedFiles(messages), [messages]);
  const used = useMemo(() => usedCapabilities(messages), [messages]);
  const subtasks = Object.values(chats).filter((entry) => entry.parentId === chat.id);
  const parent = chat.parentId ? chats[chat.parentId] : null;
  const routine = chat.routineId ? routines.data?.find((entry) => entry.id === chat.routineId) : null;

  const saveNote = async () => {
    if ((chat.note ?? "") === note.trim()) return;
    try {
      await backend.chats.setNote(props.project.id, chat.id, note.trim() || null);
      runtime.upsertChat({ ...chat, note: note.trim() || null });
      toast(copy.sidecar.noteSaved);
    } catch (failure) {
      toast(errorText(failure), { tone: "error" });
    }
  };

  return (
    <>
      <Group title={copy.sidecar.chat}>
        <dl>
          <Fact label={copy.sidecar.status}>
            <span className="inline-flex items-center gap-1.5">
              <StatusDot status={chat.status} />
              {copy.sidecar.statuses[chat.status]}
            </span>
          </Fact>
          <Fact label={copy.sidecar.model}>{modelName(status.data, chat.model) ?? "—"}</Fact>
          <Fact label={copy.sidecar.created}>{formatDateTime(chat.createdAt)}</Fact>
          <Fact label={copy.sidecar.updated}>{relativeTime(chat.updatedAt)}</Fact>
          <Fact label={copy.sidecar.tokens}>{tokens.input + tokens.output ? copy.sidecar.tokensDetail(formatTokens(tokens.input), formatTokens(tokens.output)) : "—"}</Fact>
        </dl>
        <div className="mt-1.5">
          <Locked>{copy.sidecar.costUnavailable}</Locked>
        </div>
      </Group>

      {parent ? (
        <Group title="Hoort bij">
          <a href={href({ name: "project", projectId: props.project.id, chatId: parent.id })} className="flex items-center gap-2 text-sm text-foreground hover:underline">
            <GitBranch className="size-4 text-subtle-foreground" />
            <span className="truncate">{parent.title}</span>
          </a>
        </Group>
      ) : null}

      <Group title={copy.sidecar.files}>
        {files.length ? (
          <ul className="-mx-1.5 flex flex-col">
            {files.map((file) => (
              <li key={file.path}>
                <button type="button" onClick={() => setPreview(file.path)} className="flex min-h-8 w-full items-center gap-2 rounded-md px-1.5 text-start text-sm hover:bg-hover" title={file.path}>
                  {file.changed ? <FilePen className="size-4 shrink-0 text-electric-11" /> : <FileText className="size-4 shrink-0 text-subtle-foreground" />}
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{file.name}</span>
                  <span className="shrink-0 text-xs text-subtle-foreground">{file.changed ? copy.sidecar.changed : copy.sidecar.read}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">{copy.sidecar.filesEmpty}</p>
        )}
      </Group>

      <Group title={copy.sidecar.used}>
        {used.skills.length + used.services.length ? (
          <div className="flex flex-wrap gap-1.5">
            {used.skills.map((skill) => (
              <span key={skill} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs">
                <BookOpen className="size-3 text-muted-foreground" />
                {skill}
              </span>
            ))}
            {used.services.map((service) => (
              <span key={service} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs">
                <Plug className="size-3 text-muted-foreground" />
                {service}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{copy.sidecar.usedEmpty}</p>
        )}
      </Group>

      {!chat.parentId ? (
        <Group title={copy.sidecar.group}>
          <Select
            label={copy.sidecar.group}
            value={chat.groupId ?? "__none"}
            items={[{ value: "__none", label: copy.chatList.noGroup }, ...groups.map((group) => ({ value: group.id, label: group.label }))]}
            onValueChange={(value) => {
              const groupId = value === "__none" ? null : value;
              runtime.upsertChat({ ...chat, groupId });
              void backend.groups
                .assign(props.project.id, chat.id, groupId)
                .then(() => runtime.reloadGroups())
                .catch((failure: unknown) => toast(errorText(failure), { tone: "error" }));
            }}
          />
        </Group>
      ) : null}

      {subtasks.length ? (
        <Group title={copy.sidecar.subtasks}>
          <ul className="-mx-1.5 flex flex-col">
            {subtasks.map((task) => (
              <li key={task.id}>
                <a href={href({ name: "project", projectId: props.project.id, chatId: task.id })} className="flex min-h-8 items-center gap-2 rounded-md px-1.5 text-sm hover:bg-hover">
                  <GitBranch className="size-4 shrink-0 text-subtle-foreground" />
                  <span className="min-w-0 flex-1 truncate">{task.title}</span>
                  <StatusDot status={task.status} />
                </a>
              </li>
            ))}
          </ul>
        </Group>
      ) : null}

      {chat.routineId ? (
        <Group title={copy.sidecar.routine}>
          <a href={href({ name: "project-routines", projectId: props.project.id, routineId: chat.routineId })} className="flex items-center gap-2 text-sm text-foreground hover:underline">
            <Repeat className="size-4 text-subtle-foreground" />
            <span className="truncate">{routine?.name ?? copy.chatList.routineChat}</span>
          </a>
        </Group>
      ) : null}

      <Group title={copy.sidecar.note}>
        <Textarea value={note} onChange={(event) => setNote(event.target.value)} onBlur={() => void saveNote()} placeholder={copy.sidecar.notePlaceholder} rows={3} className="min-h-16 text-sm" />
      </Group>

      <FilePreview projectId={props.project.id} chatId={chat.id} path={preview} onClose={() => setPreview(null)} />
    </>
  );
}

function BudgetMeter(props: { spend: number; max: number }) {
  const ratio = Math.min(1, props.spend / props.max);
  return (
    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={props.max} aria-valuenow={props.spend} aria-label={copy.settings.budget}>
      <div className={cn("h-full rounded-full", ratio >= 0.9 ? "bg-amber-9" : "bg-electric-9")} style={{ width: `${Math.max(2, ratio * 100)}%` }} />
    </div>
  );
}

export function ProjectDetails(props: { project: Project }) {
  const backend = useBackend();
  const status = useStatus();
  const summary = useSummary(props.project.id);
  const usage = useUsage(props.project.id);
  const chats = useProjectState((state) => state.chats);
  const chatsState = useProjectState((state) => state.chatsState);
  const chatCount = useMemo(() => Object.values(chats).filter((chat) => !chat.parentId && !chat.archived).length, [chats]);
  const { project } = props;
  const key = status.data?.keyMode === "user" ? status.data.user : project.key;
  return (
    <>
      <Group title={copy.sidecar.project}>
        <dl>
          <Fact label={copy.sidecar.key}>{projectHasKey(status.data, project) ? copy.keys.linked(key.keyHint ?? "") : <Locked>{copy.keys.missing}</Locked>}</Fact>
          <Fact label={copy.sidecar.defaultModel}>{modelName(status.data, project.defaultModel) ?? copy.settings.defaultModelNone}</Fact>
          <Fact label={copy.chatList.recent}>{chatsState === "ready" ? copy.projects.chats(chatCount) : "—"}</Fact>
          <Fact label={copy.sidecar.nextRoutine}>{summary.data?.nextRoutineAt ? formatWhen(summary.data.nextRoutineAt) : copy.sidecar.noRoutine}</Fact>
        </dl>
      </Group>
      <Group title={backend.capabilities.usage ? copy.sidecar.usage : copy.sidecar.usageTokens}>
        {backend.capabilities.usage && usage.data ? (
          <>
            <p className="text-sm text-foreground">
              {usage.data.maxBudget !== null
                ? copy.sidecar.budget(formatMoney(usage.data.spend, usage.data.currency), formatMoney(usage.data.maxBudget, usage.data.currency))
                : formatMoney(usage.data.spend, usage.data.currency)}
            </p>
            {usage.data.maxBudget ? <BudgetMeter spend={usage.data.spend} max={usage.data.maxBudget} /> : null}
          </>
        ) : summary.data?.tokens ? (
          <p className="text-sm text-foreground">{copy.sidecar.tokensDetail(formatTokens(summary.data.tokens.input), formatTokens(summary.data.tokens.output))}</p>
        ) : summary.data ? (
          <Locked>{copy.settings.usageLocked}</Locked>
        ) : (
          <Skeleton className="h-4 w-32" />
        )}
      </Group>
      <Group title={copy.sidecar.folder}>
        <p className="break-all font-mono text-xs text-muted-foreground">{project.path}</p>
        {backend.capabilities.revealPath ? (
          <Button variant="secondary" size="sm" className="mt-2" onClick={() => void backend.desktop.revealPath(project.path)}>
            <FolderOpen />
            {copy.sidecar.reveal}
          </Button>
        ) : null}
      </Group>
    </>
  );
}

export function Sidecar(props: { project: Project; chatId: string | null; onClose?: () => void }) {
  const chat = useProjectState((state) => (props.chatId ? state.chats[props.chatId] : undefined));
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4" data-titlebar="sidecar">
        <h2 className="text-sm font-semibold">{copy.sidecar.title}</h2>
        {props.onClose ? (
          <Button variant="quiet" size="icon-sm" aria-label={copy.common.close} onClick={props.onClose}>
            <X />
          </Button>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {chat ? <ChatDetails project={props.project} chat={chat} /> : null}
        <ProjectDetails project={props.project} />
      </div>
    </div>
  );
}
