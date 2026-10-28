import { useEffect, useState } from "react";
import { HelpCircle, ShieldQuestion } from "lucide-react";

import type { PermissionReply, PermissionRequest, QuestionRequest } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/field";
import { Kbd } from "~/components/ui/misc";
import { copy } from "~/copy";
import { cn } from "~/lib/cn";
import { fileName } from "~/lib/tools";

const REVERSIBLE = new Set(["edit", "write", "patch"]);

/**
 * The consent card (DESIGN.md T4, P9): the focal element while a decision is
 * pending. One line names the action and the data; one line says what can be
 * undone. ⏎ allows, esc declines.
 */
export function PermissionCard(props: { request: PermissionRequest; onReply: (reply: PermissionReply) => Promise<void> }) {
  const [busy, setBusy] = useState<PermissionReply | null>(null);
  const action = copy.permission.actions[props.request.action] ?? copy.permission.fallbackAction;
  const resources = props.request.resources.map((resource) => (resource.includes("/") || resource.includes(".") ? fileName(resource) : resource));
  const shown = resources.slice(0, 3);
  const reply = async (value: PermissionReply) => {
    if (busy) return;
    setBusy(value);
    try {
      await props.onReply(value);
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      const typing = target instanceof HTMLTextAreaElement ? target.value.trim().length > 0 : target instanceof HTMLInputElement;
      if (typing || event.defaultPrevented) return;
      if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey && !(target instanceof HTMLButtonElement)) {
        event.preventDefault();
        void reply("once");
      } else if (event.key === "Escape") {
        event.preventDefault();
        void reply("reject");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <section aria-label={copy.permission.title} className="bw-enter rounded-window bg-background p-5 ring-1 ring-amber-9/60">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-amber-3 text-amber-11">
          <ShieldQuestion className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {action}
            {shown.length ? (
              <>
                {": "}
                {shown.map((resource, index) => (
                  <span key={resource}>
                    {index > 0 ? ", " : null}
                    <code className="rounded bg-muted px-1 py-px font-mono text-[0.85em] font-normal">{resource}</code>
                  </span>
                ))}
                {resources.length > shown.length ? <span className="font-normal text-muted-foreground"> {copy.permission.more(resources.length - shown.length)}</span> : null}
              </>
            ) : null}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {props.request.message ?? (REVERSIBLE.has(props.request.action) ? copy.permission.reversible : copy.permission.notReversible)}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 sm:ps-10">
        <Button variant="primary" onClick={() => void reply("once")} disabled={busy !== null}>
          {copy.permission.allow}
          <Kbd>⏎</Kbd>
        </Button>
        {props.request.canAlways ? (
          <Button variant="secondary" onClick={() => void reply("always")} disabled={busy !== null}>
            {copy.permission.always}
          </Button>
        ) : null}
        <Button variant="ghost" onClick={() => void reply("reject")} disabled={busy !== null}>
          {copy.permission.deny}
          <Kbd>esc</Kbd>
        </Button>
      </div>
    </section>
  );
}

/** A question from the agent, with its choices and room for your own answer. */
export function QuestionCard(props: { request: QuestionRequest; onAnswer: (answers: string[][]) => Promise<void>; onSkip: () => Promise<void> }) {
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const answers = props.request.fields.map((field) => {
    const own = custom[field.key]?.trim();
    const picked = selected[field.key] ?? [];
    return own ? [...picked.filter((value) => value !== "__custom"), own] : picked.filter((value) => value !== "__custom");
  });
  const complete = answers.every((answer) => answer.length > 0);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label={copy.question.title} className="bw-enter rounded-window bg-background p-5 ring-1 ring-electric-9/40">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-electric-3 text-electric-11">
          <HelpCircle className="size-4" />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {props.request.fields.map((field) => {
            const picked = selected[field.key] ?? [];
            const toggle = (label: string) =>
              setSelected((current) => {
                const list = current[field.key] ?? [];
                if (field.multiple) return { ...current, [field.key]: list.includes(label) ? list.filter((value) => value !== label) : [...list, label] };
                return { ...current, [field.key]: [label] };
              });
            return (
              <fieldset key={field.key} className="min-w-0">
                <legend className="text-sm font-semibold text-foreground">{field.description || field.title}</legend>
                <div className="mt-2 flex flex-col gap-1" role={field.multiple ? "group" : "radiogroup"}>
                  {field.options.map((option) => {
                    const checked = picked.includes(option.label);
                    return (
                      <label
                        key={option.value}
                        className={cn(
                          "flex cursor-default items-start gap-2.5 rounded-lg px-2.5 py-2 ring-1 ring-inset transition-colors duration-100",
                          checked ? "bg-electric-3 ring-electric-9/60" : "ring-border hover:bg-hover",
                        )}
                      >
                        <input
                          type={field.multiple ? "checkbox" : "radio"}
                          name={`${props.request.id}-${field.key}`}
                          checked={checked}
                          onChange={() => toggle(option.label)}
                          className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{option.label}</span>
                          {option.description ? <span className="block text-xs text-muted-foreground">{option.description}</span> : null}
                        </span>
                      </label>
                    );
                  })}
                  {field.custom ? (
                    <Input
                      aria-label={`${field.title}: ${copy.question.other}`}
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
                          void run(() => props.onAnswer(answers));
                        }
                      }}
                      className="mt-1"
                    />
                  ) : null}
                </div>
              </fieldset>
            );
          })}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={!complete || busy} onClick={() => void run(() => props.onAnswer(answers))}>
              {copy.question.answer}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => void run(props.onSkip)}>
              {copy.question.skip}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
