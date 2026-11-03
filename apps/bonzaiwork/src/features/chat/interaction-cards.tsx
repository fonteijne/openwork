import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { HelpCircle, ShieldQuestion } from "lucide-react";

import { useBackend } from "~/backend/context";
import type { PermissionReply, PermissionRequest, QuestionField, QuestionRequest } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { Callout } from "~/components/ui/callout";
import { Input } from "~/components/ui/field";
import { Kbd } from "~/components/ui/misc";
import { RadioCards } from "~/components/ui/radio-cards";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";
import { isEditable } from "~/lib/shortcuts";
import { fileName } from "~/lib/tools";

/**
 * The consent and question cards (brief §7; DESIGN.md T4, P9, S1). Both talk to `Backend`
 * themselves, so a card works in the chat and anywhere else a request shows up: give it the
 * project and the request, and `onDone` fires once the engine took the answer. Chords (⏎, esc,
 * 1–9) belong to the card element and never to the window (brief §4).
 */

const REVERSIBLE = new Set(["edit", "write", "patch"]);
/** Actions whose resource is a path: the card shows the file name. Everything else is shown verbatim. */
const FILE_ACTIONS = new Set(["edit", "write", "read", "patch", "external_directory"]);

/** Focus by script after an answer shows the ring on any focus: it says where ⏎ and esc go (S6, V7). */
const CARD = "focus:outline-2 focus:outline-offset-2 focus:outline-ring";

type Chords = { enter?: () => void; escape?: () => void; digit?: (n: number) => void };

/**
 * Inert while a field inside the card has focus; a focused button or link keeps its own ⏎. Radios
 * let ⏎ through, so a choice made with ↑↓ can be sent without leaving it.
 */
function cardKeys(chords: Chords) {
  return (event: KeyboardEvent<HTMLElement>) => {
    const target = event.target;
    if (event.metaKey || event.ctrlKey || event.altKey || isEditable(target)) return;
    if (target instanceof Element && target !== event.currentTarget && target.closest('button:not([role="radio"]), a, select, [role="menu"], [role="listbox"]')) return;
    if (event.key === "Enter" && chords.enter) {
      event.preventDefault();
      chords.enter();
    } else if (event.key === "Escape" && chords.escape) {
      event.preventDefault();
      chords.escape();
    } else if (/^[1-9]$/.test(event.key) && chords.digit) {
      event.preventDefault();
      chords.digit(Number(event.key));
    }
  };
}

/** The card takes focus on arrival when nothing else is being typed in: the decision is the focal element (T4). */
function useCardFocus(autoFocus: boolean | undefined) {
  const card = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!autoFocus) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body && isEditable(active) && !active.matches(":disabled")) return;
    card.current?.focus({ preventScroll: true });
  }, [autoFocus]);
  return card;
}

export type PermissionCardProps = {
  projectId: string;
  request: PermissionRequest;
  /** The engine took the answer; the chat drops the request, Vandaag refreshes. */
  onDone?: (reply: PermissionReply) => void;
  autoFocus?: boolean;
  className?: string;
};

/**
 * The consent card v2 (DESIGN.md T4, P9): the action as the bold sentence, the data as a mono
 * chip (file name) or verbatim command, one state line that says whether it can be undone.
 * "Altijd in dit project" only when the engine names what that would allow (`request.scope`).
 */
export function PermissionCard(props: PermissionCardProps) {
  const backend = useBackend();
  const [busy, setBusy] = useState<PermissionReply | null>(null);
  const card = useCardFocus(props.autoFocus);
  const { request } = props;
  const action = copy.permission.actions[request.action] ?? copy.permission.fallbackAction;
  const fileLike = FILE_ACTIONS.has(request.action);
  const names = fileLike ? request.resources.map(fileName) : request.resources;
  const [first, ...rest] = names;

  const reply = async (value: PermissionReply) => {
    if (busy) return;
    setBusy(value);
    try {
      await backend.interactions.replyPermission(props.projectId, request.chatId, request.id, value);
      props.onDone?.(value);
    } catch (failure) {
      toast(errorText(failure), { tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Callout
      ref={card}
      className={cn(CARD, props.className)}
      tabIndex={0}
      onKeyDown={cardKeys({ enter: () => void reply("once"), escape: () => void reply("reject") })}
      testId="permission-card"
      label={copy.permission.title}
      decision
      icon={<ShieldQuestion />}
      title={action}
      chip={fileLike ? first : undefined}
      state={
        <>
          {fileLike && rest.length ? `${copy.permission.more(rest.length)} · ` : null}
          {request.message ?? (REVERSIBLE.has(request.action) ? copy.attention.permission.reversible : copy.attention.permission.notReversible)}
        </>
      }
      actions={
        <>
          <Button variant="primary" onClick={() => void reply("once")} disabled={busy !== null} data-testid="permission-allow">
            {copy.attention.permission.allow}
            <Kbd>⏎</Kbd>
          </Button>
          {request.canAlways && request.scope ? (
            <Button variant="secondary" onClick={() => void reply("always")} disabled={busy !== null} title={request.scope}>
              {copy.attention.permission.always}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => void reply("reject")} disabled={busy !== null}>
            {copy.attention.permission.deny}
            <Kbd>esc</Kbd>
          </Button>
        </>
      }
    >
      {/* Commands and other non-file resources verbatim, wrapped, never shortened (P9). */}
      {!fileLike && names.length ? (
        <ul className="flex flex-col gap-1">
          {names.map((name) => (
            <li key={name}>
              <code className="block rounded-lg bg-muted px-2.5 py-1.5 font-mono text-sm whitespace-pre-wrap break-all text-foreground">{name}</code>
            </li>
          ))}
        </ul>
      ) : null}
    </Callout>
  );
}

export type QuestionCardProps = {
  projectId: string;
  request: QuestionRequest;
  /** `answered` is false when the person skipped it. */
  onDone?: (answered: boolean) => void;
  autoFocus?: boolean;
  className?: string;
};

function MultiField(props: { request: QuestionRequest; field: QuestionField; picked: string[]; onToggle: (label: string) => void }) {
  return (
    <div role="group" aria-label={props.field.title} className="flex flex-col">
      {props.field.options.map((option) => {
        const checked = props.picked.includes(option.label);
        return (
          <label key={option.value} className={cn("flex min-h-11 cursor-default items-center gap-3 border-b border-border px-1.5 py-2 last:border-b-0 hover:bg-hover", checked && "font-semibold")}>
            <input type="checkbox" name={`${props.request.id}-${props.field.key}`} checked={checked} onChange={() => props.onToggle(option.label)} className="size-4 shrink-0" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm text-foreground">{option.label}</span>
              {option.description ? <span className="text-xs font-normal text-muted-foreground">{option.description}</span> : null}
            </span>
          </label>
        );
      })}
    </div>
  );
}

/**
 * A question from the agent: the options as RadioCards, flat inside the card (S1), 1–9 pick,
 * ⏎ answers once every field has an answer, esc skips (the agent then decides itself).
 */
export function QuestionCard(props: QuestionCardProps) {
  const backend = useBackend();
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const card = useCardFocus(props.autoFocus);
  const { request } = props;
  const [firstField] = request.fields;

  const answers = request.fields.map((field) => {
    const own = custom[field.key]?.trim();
    const picked = selected[field.key] ?? [];
    return own ? [...picked, own] : picked;
  });
  const complete = answers.every((answer) => answer.length > 0);

  const pick = (field: QuestionField, label: string) =>
    setSelected((current) => {
      const list = current[field.key] ?? [];
      if (field.multiple) return { ...current, [field.key]: list.includes(label) ? list.filter((value) => value !== label) : [...list, label] };
      return { ...current, [field.key]: [label] };
    });

  const run = async (task: () => Promise<void>, answered: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      await task();
      props.onDone?.(answered);
    } catch (failure) {
      toast(errorText(failure), { tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  const answer = () => {
    if (!complete) return;
    void run(() => backend.interactions.replyQuestion(props.projectId, request.chatId, request.id, answers), true);
  };
  const skip = () => void run(() => backend.interactions.rejectQuestion(props.projectId, request.chatId, request.id), false);

  return (
    <Callout
      ref={card}
      className={cn(CARD, props.className)}
      tabIndex={0}
      onKeyDown={cardKeys({
        enter: answer,
        escape: skip,
        digit: (n) => {
          const option = firstField?.options[n - 1];
          if (firstField && option) pick(firstField, option.label);
        },
      })}
      testId="question-card"
      label={copy.question.title}
      decision
      icon={<HelpCircle />}
      title={firstField?.description || firstField?.title || copy.question.title}
      actions={
        <>
          <Button variant="primary" disabled={!complete || busy} onClick={answer} data-testid="question-answer">
            {copy.attention.question.answer}
            <Kbd>⏎</Kbd>
          </Button>
          <Button variant="ghost" disabled={busy} onClick={skip}>
            {copy.question.skip}
            <Kbd>esc</Kbd>
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {request.fields.map((field, fieldIndex) => (
          <div key={field.key} className="min-w-0">
            {fieldIndex > 0 ? <p className="mb-1 text-sm font-semibold text-foreground">{field.description || field.title}</p> : null}
            {field.multiple ? (
              <MultiField request={request} field={field} picked={selected[field.key] ?? []} onToggle={(label) => pick(field, label)} />
            ) : (
              <RadioCards
                label={field.title}
                value={selected[field.key]?.[0] ?? null}
                onValueChange={(label) => pick(field, label)}
                items={field.options.map((option, index) => ({
                  value: option.label,
                  label:
                    fieldIndex === 0 && index < 9 ? (
                      <span className="inline-flex items-center gap-2">
                        <Kbd className="text-subtle-foreground">{index + 1}</Kbd>
                        {option.label}
                      </span>
                    ) : (
                      option.label
                    ),
                  hint: option.description || undefined,
                }))}
              />
            )}
            {field.custom ? (
              <Input
                aria-label={`${field.title}: ${copy.attention.question.other}`}
                placeholder={copy.question.otherPlaceholder}
                value={custom[field.key] ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  setCustom((current) => ({ ...current, [field.key]: value }));
                  if (!field.multiple && value.trim()) setSelected((current) => ({ ...current, [field.key]: [] }));
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && complete) {
                    event.preventDefault();
                    answer();
                  }
                }}
                className="mt-2"
              />
            ) : null}
          </div>
        ))}
      </div>
    </Callout>
  );
}
