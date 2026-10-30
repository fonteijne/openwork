import { forwardRef, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Popover } from "@base-ui/react/popover";
import { ArrowUp, BookOpen, LoaderCircle, Paperclip, Slash, Square, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useBackend } from "~/backend/context";
import { keys, projectModels, useAgents, useComposerEntries, useStatus } from "~/backend/queries";
import type { Attachment, ComposerEntry, Project, RunMode } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { Select } from "~/components/ui/select";
import { Tooltip } from "~/components/ui/tooltip";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";
import { formatBytes } from "~/lib/format";
import { readLocal, writeLocal } from "~/lib/storage";

const MAX_FILE_BYTES = 25 * 1024 * 1024;

export type ComposerSubmit = { text: string; attachments: Attachment[]; command: string | null; skills: string[] };

export type ComposerHandle = { focus(): void; addFiles(files: FileList | File[]): void; setText(text: string): void };

const RUN_MODE_SHORT: Record<RunMode, string> = {
  default: "Vragen waar nodig",
  approve: "Altijd eerst vragen",
  "run-everything": "Alles zelf doen",
};

function draftKey(projectId: string, chatId: string | null) {
  return `bonzaiwork.draft.${projectId}.${chatId ?? "nieuw"}`;
}

function RunModePill(props: { projectId: string }) {
  const backend = useBackend();
  const client = useQueryClient();
  const mode = useQuery({ queryKey: keys.runMode(props.projectId), queryFn: () => backend.config.runMode(props.projectId), staleTime: 60_000 });
  if (!mode.data?.supported || !mode.data.mode) return null;
  return (
    <Select
      variant="pill"
      label={copy.settings.runMode}
      value={mode.data.mode}
      onValueChange={(value) => {
        const next: RunMode = value === "approve" ? "approve" : value === "run-everything" ? "run-everything" : "default";
        void backend.config
          .setRunMode(props.projectId, next)
          .then((state) => client.setQueryData(keys.runMode(props.projectId), state))
          .catch((failure: unknown) => toast(errorText(failure), { tone: "error" }));
      }}
      items={(["default", "approve", "run-everything"] as const).map((value) => ({ value, label: RUN_MODE_SHORT[value], hint: copy.settings.runModes[value].hint }))}
      className="max-sm:hidden"
    />
  );
}

export const Composer = forwardRef<
  ComposerHandle,
  {
    project: Project;
    chatId: string | null;
    running: boolean;
    model: string | null;
    onModelChange: (model: string) => void;
    agent: string | null;
    onAgentChange: (agent: string) => void;
    onSubmit: (input: ComposerSubmit) => Promise<boolean>;
    onStop: () => void;
    blocked?: ReactNode;
    /** A permission or question waits: esc belongs to that card, not to stop. */
    decisionPending?: boolean;
    autoFocus?: boolean;
    placeholder?: string;
    size?: "default" | "large";
    /** Keep the words in the composer until onSubmit succeeds: there is no chat yet to show them in. */
    keepUntilSent?: boolean;
  }
>(function Composer(props, ref) {
  const status = useStatus();
  const agents = useAgents(props.project.id);
  const entries = useComposerEntries(props.project.id);
  const container = useRef<HTMLDivElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => readLocal(draftKey(props.project.id, props.chatId)) ?? "");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [command, setCommand] = useState<string | null>(null);
  const [skills, setSkills] = useState<string[]>([]);
  const [highlight, setHighlight] = useState(0);
  const listId = useId();
  const [menuDismissed, setMenuDismissed] = useState(false);
  const [sending, setSending] = useState(false);
  const models = projectModels(status.data, props.project);

  // Drafts survive switching chats and reloads (per device).
  useEffect(() => {
    setText(readLocal(draftKey(props.project.id, props.chatId)) ?? "");
    setAttachments([]);
    setCommand(null);
    setSkills([]);
  }, [props.project.id, props.chatId]);
  useEffect(() => {
    const timer = window.setTimeout(() => writeLocal(draftKey(props.project.id, props.chatId), text.trim() ? text : null), 250);
    return () => window.clearTimeout(timer);
  }, [text, props.project.id, props.chatId]);

  useLayoutEffect(() => {
    const element = textarea.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, Math.round(window.innerHeight * 0.4))}px`;
  }, [text]);

  const addFiles = (files: FileList | File[]) => {
    const list = Array.from(files);
    const tooBig = list.filter((file) => file.size > MAX_FILE_BYTES);
    if (tooBig.length) toast(`${tooBig.map((file) => file.name).join(", ")} is groter dan 25 MB.`, { tone: "error" });
    const accepted = list.filter((file) => file.size <= MAX_FILE_BYTES).map((file) => ({ name: file.name, mime: file.type || "application/octet-stream", size: file.size, file }));
    if (accepted.length) setAttachments((current) => [...current, ...accepted].slice(0, 10));
  };

  useImperativeHandle(ref, () => ({
    focus: () => textarea.current?.focus(),
    addFiles,
    setText: (value) => {
      setText(value);
      window.requestAnimationFrame(() => {
        textarea.current?.focus();
        textarea.current?.setSelectionRange(value.length, value.length);
      });
    },
  }));

  useEffect(() => {
    if (props.autoFocus && window.matchMedia("(pointer: fine)").matches) textarea.current?.focus();
  }, [props.autoFocus]);

  // The `/` menu: commands and skills of this project.
  const slash = /^\/([^\s]*)$/.exec(text);
  const filtered = useMemo<ComposerEntry[]>(() => {
    if (!slash) return [];
    const needle = (slash[1] ?? "").toLowerCase();
    return (entries.data ?? []).filter((entry) => entry.name.toLowerCase().includes(needle)).slice(0, 8);
  }, [slash?.[1], entries.data]);
  const menuOpen = Boolean(slash) && !menuDismissed;
  useEffect(() => {
    setHighlight(0);
    if (!slash) setMenuDismissed(false);
  }, [slash?.[1]]);

  const pick = (entry: ComposerEntry) => {
    if (entry.kind === "command") setCommand(entry.name);
    else setSkills((current) => (current.includes(entry.name) ? current : [...current, entry.name]));
    setText("");
    textarea.current?.focus();
  };

  const canSend = (text.trim().length > 0 || command !== null) && Boolean(props.model) && !props.blocked && !sending;
  const submit = async () => {
    if (!canSend) return;
    const input: ComposerSubmit = { text: text.trim(), attachments, command, skills };
    setSending(true);
    // Keep the person's words in view while the engine takes them (P11): in
    // the chat as a pending message, or here until the chat exists. They come
    // back here if sending fails.
    const clear = () => {
      setText("");
      setAttachments([]);
      setCommand(null);
      setSkills([]);
    };
    if (!props.keepUntilSent) clear();
    const ok = await props.onSubmit(input).catch(() => false);
    setSending(false);
    if (ok && props.keepUntilSent) clear();
    if (!ok && !props.keepUntilSent) {
      setText(input.text);
      setAttachments(input.attachments);
      setCommand(input.command);
      setSkills(input.skills);
    }
  };

  const showStop = props.running && !text.trim() && !command;
  const large = props.size === "large";

  return (
    <div
      ref={container}
      className={cn(
        "relative flex w-full flex-col rounded-window bg-background ring-1 ring-border-strong transition-shadow duration-150 focus-within:ring-ring/60",
        props.blocked ? "opacity-90" : null,
      )}
    >
      {attachments.length || command || skills.length ? (
        <div className="flex flex-wrap gap-1.5 px-3 pt-3">
          {command ? (
            <span className="inline-flex h-7 items-center gap-1 rounded-full bg-electric-3 ps-2.5 pe-1 text-xs font-semibold text-electric-11">
              <Slash className="size-3" />
              {command}
              <button type="button" className="flex size-5 items-center justify-center rounded hover:bg-black/5" aria-label={copy.chat.removeAttachment(command)} onClick={() => setCommand(null)}>
                <X className="size-3" />
              </button>
            </span>
          ) : null}
          {skills.map((skill) => (
            <span key={skill} className="inline-flex h-7 items-center gap-1 rounded-full bg-muted ps-2.5 pe-1 text-xs font-medium text-foreground">
              <BookOpen className="size-3" />
              {skill}
              <button type="button" className="flex size-5 items-center justify-center rounded hover:bg-black/5" aria-label={copy.chat.removeAttachment(skill)} onClick={() => setSkills((current) => current.filter((entry) => entry !== skill))}>
                <X className="size-3" />
              </button>
            </span>
          ))}
          {attachments.map((attachment, index) => (
            <span key={`${attachment.name}-${index}`} className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full bg-muted ps-2.5 pe-1 text-xs">
              <Paperclip className="size-3 shrink-0 text-muted-foreground" />
              <span className="truncate font-mono">{attachment.name}</span>
              <span className="text-subtle-foreground">{formatBytes(attachment.size)}</span>
              <button
                type="button"
                className="flex size-5 shrink-0 items-center justify-center rounded hover:bg-black/5"
                aria-label={copy.chat.removeAttachment(attachment.name)}
                onClick={() => setAttachments((current) => current.filter((_, position) => position !== index))}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <textarea
        ref={textarea}
        data-testid="composer-input"
        readOnly={sending && props.keepUntilSent}
        value={text}
        rows={large ? 3 : 1}
        onChange={(event) => setText(event.target.value)}
        onPaste={(event) => {
          if (event.clipboardData.files.length) {
            event.preventDefault();
            addFiles(event.clipboardData.files);
          }
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (menuOpen && filtered.length) {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setHighlight((current) => (current + (event.key === "ArrowDown" ? 1 : filtered.length - 1)) % filtered.length);
              return;
            }
            if (event.key === "Enter" || event.key === "Tab") {
              event.preventDefault();
              const entry = filtered[highlight];
              if (entry) pick(entry);
              return;
            }
          }
          if (event.key === "Escape") {
            if (menuOpen) {
              event.preventDefault();
              setMenuDismissed(true);
            } else if (props.running && !text && !props.decisionPending) {
              event.preventDefault();
              props.onStop();
            }
            return;
          }
          if (event.key === "Backspace" && !text && (command || skills.length)) {
            if (command) setCommand(null);
            else setSkills((current) => current.slice(0, -1));
            return;
          }
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void submit();
          }
        }}
        placeholder={props.placeholder ?? (props.running ? copy.chat.composerPlaceholderBusy : copy.chat.composerPlaceholder)}
        aria-label={copy.chat.composerPlaceholder}
        aria-autocomplete="list"
        aria-controls={menuOpen && filtered.length ? listId : undefined}
        aria-activedescendant={menuOpen && filtered.length ? `${listId}-${highlight}` : undefined}
        disabled={Boolean(props.blocked)}
        className={cn(
          "w-full resize-none bg-transparent px-4 pt-3 pb-1 text-base leading-relaxed text-foreground placeholder:text-subtle-foreground focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed max-sm:text-[16px]",
          large ? "min-h-24" : "min-h-11",
        )}
      />

      <div className="flex items-center gap-1 px-2 pb-2">
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files) addFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <Tooltip label={copy.chat.attach}>
          <Button variant="quiet" size="icon-sm" aria-label={copy.chat.attach} onClick={() => fileInput.current?.click()} disabled={Boolean(props.blocked)}>
            <Paperclip />
          </Button>
        </Tooltip>
        <Tooltip label={copy.chat.commandsTitle} shortcut="/">
          <Button
            variant="quiet"
            size="icon-sm"
            aria-label={copy.chat.commandsTitle}
            disabled={Boolean(props.blocked)}
            onClick={() => {
              setText("/");
              textarea.current?.focus();
            }}
          >
            <Slash />
          </Button>
        </Tooltip>
        {models.length ? (
          <Select variant="pill" label={copy.chat.model} value={props.model} onValueChange={props.onModelChange} items={models.map((model) => ({ value: model.id, label: model.name }))} />
        ) : (
          <span className="px-2 text-xs text-muted-foreground">{status.data?.models.length ? copy.chat.noModelsChosen : copy.chat.noModels}</span>
        )}
        {agents.data && agents.data.length > 1 ? (
          <Select
            variant="pill"
            label={copy.chat.agent}
            value={props.agent ?? agents.data[0]?.id ?? null}
            onValueChange={props.onAgentChange}
            items={agents.data.map((agent) => ({ value: agent.id, label: agent.name, hint: agent.description }))}
            className="max-sm:hidden"
          />
        ) : null}
        <RunModePill projectId={props.project.id} />
        <div className="flex-1" />
        {showStop ? (
          <Tooltip label={copy.chat.stop} shortcut="esc">
            <Button variant="primary" size="icon" className="rounded-full" aria-label={copy.chat.stop} onClick={props.onStop}>
              <Square className="size-3.5! fill-current" />
            </Button>
          </Tooltip>
        ) : (
          <Tooltip label={copy.chat.send} shortcut="⏎">
            <Button variant="primary" size="icon" className="rounded-full" aria-label={copy.chat.send} onClick={() => void submit()} disabled={!canSend} data-testid="composer-send">
              {sending ? <LoaderCircle className="animate-spin" /> : <ArrowUp />}
            </Button>
          </Tooltip>
        )}
      </div>

      {props.blocked ? <div className="border-t border-border px-4 py-2.5 text-sm">{props.blocked}</div> : null}

      <Popover.Root open={menuOpen} onOpenChange={(open) => !open && setMenuDismissed(true)}>
        <Popover.Portal>
          <Popover.Positioner anchor={container} side="top" align="start" sideOffset={6} collisionPadding={8} className="z-50">
            <Popover.Popup initialFocus={false} finalFocus={false} className="w-[min(var(--anchor-width),28rem)] max-h-[min(var(--available-height),20rem)] overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-popover outline-none">
              <p className="px-2 pt-1 pb-1.5 text-xs text-subtle-foreground">{copy.chat.commandsTitle}</p>
              {filtered.length ? (
                <ul id={listId} role="listbox" aria-label={copy.chat.commandsTitle}>
                  {filtered.map((entry, index) => (
                    <li
                      key={`${entry.kind}-${entry.name}`}
                      id={`${listId}-${index}`}
                      role="option"
                      aria-selected={index === highlight}
                      onMouseEnter={() => setHighlight(index)}
                      onMouseDown={(event) => {
                        event.preventDefault();
                        pick(entry);
                      }}
                      className={cn("flex cursor-default items-center gap-2.5 rounded-md px-2 py-1.5", index === highlight && "bg-hover")}
                    >
                      {entry.kind === "skill" ? <BookOpen className="size-4 shrink-0 text-muted-foreground" /> : <Slash className="size-4 shrink-0 text-muted-foreground" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{entry.kind === "command" ? `/${entry.name}` : entry.name}</span>
                        {entry.description ? <span className="block truncate text-xs text-muted-foreground">{entry.description}</span> : null}
                      </span>
                      <span className="shrink-0 text-[11px] text-subtle-foreground">{entry.kind === "skill" ? copy.chat.skillBadge : copy.chat.commandBadge}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-2 py-2 text-sm text-muted-foreground">{copy.chat.noCommands}</p>
              )}
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
});
