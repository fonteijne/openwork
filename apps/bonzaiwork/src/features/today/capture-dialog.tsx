import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Bot, X } from "lucide-react";

import { useCockpitMutation, useInbox, useWaiting } from "~/backend/cockpit-queries";
import { useProjects } from "~/backend/queries";
import { toast } from "~/components/ui/toast";
import { todayCopy } from "~/copy/today";
import { cn } from "~/lib/cn";
import { navigate } from "~/lib/router";
import { readLocal, writeLocal } from "~/lib/storage";

import { formatShortDate, parseCapture } from "./model";

const k = todayCopy.captureDialog;
const DRAFT_KEY = "bonzaiwork.captureDraft";
/** The chip for the project of the page the person is on; ignoring it uses this key. */
const CONTEXT = "@context";

/**
 * Quick capture (design v2-Capture): one line into the inbox, never straight into a project
 * (FLOW-02). `#project` and a day word become chips; a chip turns back into text when pressed.
 * "Vraag <naam> …" suggests a waiting-for. Enter saves, Shift Enter saves and opens the inbox,
 * Esc closes and keeps the draft on this device.
 */
export function CaptureDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; projectId: string | null }) {
  const [text, setText] = useState(() => readLocal(DRAFT_KEY) ?? "");
  const [ignored, setIgnored] = useState<ReadonlySet<string>>(new Set());
  const [waitingAccepted, setWaitingAccepted] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const projects = useProjects();
  const waiting = useWaiting();
  const inbox = useInbox();
  const capture = useCockpitMutation((cockpit, value: { text: string; projectId: string | null }) => cockpit.inbox.capture(value.text, value.projectId));

  useEffect(() => {
    if (!props.open) return;
    // Reopening shows the draft kept on this device.
    setText(readLocal(DRAFT_KEY) ?? "");
    setIgnored(new Set());
    setWaitingAccepted(false);
  }, [props.open]);

  const listed = useMemo(() => (projects.data ?? []).filter((project) => project.archivedAt === null), [projects.data]);
  const people = useMemo(() => {
    const names = new Set<string>();
    for (const entry of waiting.data ?? []) names.add(entry.person.name);
    for (const item of inbox.data ?? []) if (item.from) names.add(item.from.name);
    return [...names];
  }, [waiting.data, inbox.data]);
  const parsed = useMemo(() => parseCapture(text, { projects: listed, people, now: Date.now(), ignored }), [text, listed, people, ignored]);
  const projectToken = parsed.tokens.find((token) => token.kind === "project") ?? null;
  const dateToken = parsed.tokens.find((token) => token.kind === "date") ?? null;
  const contextProject = !projectToken && props.projectId && !ignored.has(CONTEXT) ? (listed.find((project) => project.id === props.projectId) ?? null) : null;

  const update = (value: string) => {
    setText(value);
    writeLocal(DRAFT_KEY, value.trim() ? value : null);
    if (!/^vraag\s/i.test(value.trim())) setWaitingAccepted(false);
  };

  const ignore = (token: string) => {
    setIgnored((current) => new Set(current).add(token.toLowerCase()));
    input.current?.focus();
  };

  const save = (open: boolean) => {
    const trimmed = text.trim();
    if (!trimmed || capture.isPending) return;
    // The project tag became the chip; the words stay as the person wrote them.
    const withoutTag = projectToken ? trimmed.replace(projectToken.token, "").replace(/\s{2,}/g, " ").trim() : trimmed;
    const title = waitingAccepted && parsed.waitingName ? `${k.waitingPrefix(parsed.waitingName)}${withoutTag}` : withoutTag;
    capture.mutate(
      { text: title || trimmed, projectId: projectToken?.projectId ?? contextProject?.id ?? null },
      {
        onSuccess: () => {
          writeLocal(DRAFT_KEY, null);
          setText("");
          toast(k.saved);
          props.onOpenChange(false);
          if (open) navigate({ name: "inbox" });
        },
        onError: () => toast(k.failed, { tone: "error" }),
      },
    );
  };

  const hasChips = projectToken !== null || dateToken !== null || contextProject !== null || parsed.waitingName !== null;

  return (
    <DialogPrimitive.Root open={props.open} onOpenChange={(open) => props.onOpenChange(open)}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-backdrop transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <DialogPrimitive.Popup
          initialFocus={input}
          className="fixed left-1/2 top-[max(16px,12vh)] z-50 flex max-h-[calc(100dvh-32px)] w-[calc(100%-2rem)] max-w-[672px] -translate-x-1/2 flex-col gap-4 overflow-y-auto rounded-panel bg-surface-raised px-6 py-7 text-ink shadow-float outline-none transition-[opacity,transform] duration-180 ease-io data-[ending-style]:opacity-0 data-[starting-style]:translate-y-1 data-[starting-style]:opacity-0 sm:px-8"
        >
          <div className="flex items-center gap-3">
            <DialogPrimitive.Title className="m-0 flex-1 text-[13px] font-semibold uppercase leading-4 tracking-[0.08em] text-ink-muted">{k.eyebrow}</DialogPrimitive.Title>
            <span className="hidden text-sm text-ink-muted sm:inline">{k.offline}</span>
            <DialogPrimitive.Close aria-label={k.close} className="-me-2 flex size-11 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-hover hover:text-ink">
              <X className="size-4" aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor={inputId} className="text-base font-semibold text-ink">
              {k.label}
            </label>
            <input
              ref={input}
              id={inputId}
              type="text"
              value={text}
              autoComplete="off"
              placeholder={k.placeholder}
              onChange={(event) => update(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
                event.preventDefault();
                save(event.shiftKey);
              }}
              className="min-h-[52px] w-full rounded-full border border-line-strong bg-surface-raised px-5 text-[20px] font-medium leading-7 text-ink outline-none placeholder:text-ink-muted/70 focus-visible:border-ink focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="m-0 text-sm text-ink-muted sm:hidden">{k.offline}</p>
          </div>
          {hasChips ? (
            <div className="flex flex-col gap-3">
              <p className="m-0 text-sm text-ink-muted">{k.understood}</p>
              <div className="flex flex-wrap gap-2">
                {projectToken ? (
                  <Chip onClick={() => ignore(projectToken.token)} label={k.projectLabel(projectToken.name)}>
                    {k.project(projectToken.name)}
                  </Chip>
                ) : contextProject ? (
                  <Chip onClick={() => ignore(CONTEXT)} label={k.projectLabel(contextProject.name)}>
                    {k.project(contextProject.name)}
                  </Chip>
                ) : null}
                {dateToken ? (
                  <Chip onClick={() => ignore(dateToken.token)} label={k.startLabel(formatShortDate(dateToken.at))}>
                    {k.start(formatShortDate(dateToken.at))}
                  </Chip>
                ) : null}
              </div>
              {parsed.waitingName ? (
                <div className="flex">
                  <button
                    type="button"
                    aria-pressed={waitingAccepted}
                    onClick={() => {
                      setWaitingAccepted((value) => !value);
                      input.current?.focus();
                    }}
                    className={cn(
                      "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors pointer-coarse:min-h-11 [&_svg]:size-4",
                      waitingAccepted ? "border-ink bg-ink font-semibold text-surface" : "border-dashed border-ink bg-transparent font-medium text-ink hover:bg-hover",
                    )}
                  >
                    <Bot aria-hidden="true" />
                    {waitingAccepted ? k.acceptedWaiting(parsed.waitingName) : k.suggestedWaiting(parsed.waitingName)}
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-[13px] leading-5 text-ink-muted pointer-coarse:hidden">
            <span>
              <kbd className="font-sans font-semibold text-ink">{k.keys.enter}</kbd> {k.keys.enterLabel}
            </span>
            <span>
              <kbd className="font-sans font-semibold text-ink">{k.keys.shiftEnter}</kbd> {k.keys.shiftEnterLabel}
            </span>
            <span>
              <kbd className="font-sans font-semibold text-ink">{k.keys.esc}</kbd> {k.keys.escLabel}
            </span>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Chip(props: { children: string; label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={props.label} onClick={props.onClick} className="inline-flex min-h-9 items-center rounded-full bg-ink px-4 text-sm font-semibold text-surface transition-colors hover:bg-ink/85 pointer-coarse:min-h-11">
      {props.children}
    </button>
  );
}
