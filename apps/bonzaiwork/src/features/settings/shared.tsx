import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Field, Input, SecretInput, Textarea, type SecretInputHandle } from "~/components/ui/field";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";

import { settingsCopy } from "./copy";

/** Runs a mutation; a failure becomes an error toast (C6), a success the action's own word (C2). */
export async function attempt(action: () => Promise<unknown>, success?: string): Promise<boolean> {
  try {
    await action();
    if (success) toast(success);
    return true;
  } catch (failure) {
    toast(errorText(failure), { tone: "error" });
    return false;
  }
}

/** "offerte-schrijven" → "Offerte schrijven": a slug as people read it (C3). */
export function humanize(slug: string): string {
  const words = slug.replace(/[-_]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : slug;
}

/** "Offerte schrijven" → "offerte-schrijven": the engine's name, derived once from the title. */
export function slugify(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

export const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** The last segment of a folder path: what people recognise; the full path lives under Technisch (P3). */
export function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

// ---------------------------------------------------------------------------
// Key form (settings and app settings); the label never names the vendor (C3)
// ---------------------------------------------------------------------------

export function KeyForm(props: { onLink: (key: string) => Promise<void>; onCancel?: () => void; autoFocus?: boolean; label?: string }) {
  const field = useRef<SecretInputHandle>(null);
  const [present, setPresent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    const key = field.current?.take().trim() ?? "";
    if (!key) return;
    setBusy(true);
    setError(null);
    try {
      await props.onLink(key);
    } catch (failure) {
      setError(errorText(failure));
      field.current?.focus();
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="flex flex-col gap-3 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Field label={props.label ?? settingsCopy.key.label} error={error} hint={error ? undefined : settingsCopy.key.where}>
        {(id, describedBy) => <SecretInput ref={field} id={id} describedBy={describedBy} invalid={Boolean(error)} placeholder={settingsCopy.key.placeholder} autoFocus={props.autoFocus} disabled={busy} onPresenceChange={setPresent} onSubmit={() => void submit()} />}
      </Field>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={!present || busy}>
          {busy ? copy.onboarding.linking : settingsCopy.key.link}
        </Button>
        {props.onCancel ? (
          <Button variant="ghost" onClick={props.onCancel} disabled={busy}>
            {copy.common.cancel}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Inline text row: the value becomes a field in place; esc cancels, ⏎ saves, undo in the toast (P8)
// ---------------------------------------------------------------------------

export function InlineTextRow(props: {
  label: string;
  value: string;
  /** Shown in subtle ink when the value is empty. */
  empty?: string;
  placeholder?: string;
  multiline?: boolean;
  required?: string;
  disabled?: boolean;
  onSave: (next: string, previous: string) => Promise<void>;
  testId?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(props.value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const control = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const editButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (editing) control.current?.focus();
  }, [editing]);

  const close = () => {
    setEditing(false);
    setError(null);
    // Focus goes back to where it came from (S7 spirit), after the row re-renders its button.
    requestAnimationFrame(() => editButton.current?.focus());
  };
  const save = async () => {
    const next = draft.trim();
    if (props.required && !next) {
      setError(props.required);
      return;
    }
    if (next === props.value) return close();
    setBusy(true);
    try {
      await props.onSave(next, props.value);
      close();
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setDraft(props.value);
      close();
    } else if (event.key === "Enter" && (!props.multiline || event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void save();
    }
  };

  if (!editing) {
    return (
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border py-2.5 last:border-b-0">
        <div className="text-sm font-medium text-foreground">{props.label}</div>
        <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
          <div className={cn("min-w-0 truncate", !props.value && "text-subtle-foreground")} data-testid={props.testId}>
            {props.value || props.empty}
          </div>
          <Button
            ref={editButton}
            variant="secondary"
            size="sm"
            disabled={props.disabled}
            aria-label={`${props.label}: ${settingsCopy.project.edit}`}
            onClick={() => {
              setDraft(props.value);
              setEditing(true);
            }}
          >
            {settingsCopy.project.edit}
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 border-b border-border py-2.5 last:border-b-0">
      <Field label={props.label} error={error}>
        {(id, describedBy) =>
          props.multiline ? (
            <Textarea ref={control} id={id} aria-describedby={describedBy} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} placeholder={props.placeholder} rows={3} disabled={busy} />
          ) : (
            <Input ref={control} id={id} aria-describedby={describedBy} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} placeholder={props.placeholder} disabled={busy} />
          )
        }
      </Field>
      <div className="flex gap-2">
        <Button variant="primary" size="sm" onClick={() => void save()} disabled={busy}>
          {settingsCopy.project.save}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => {
            setDraft(props.value);
            close();
          }}
        >
          {copy.common.cancel}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overzicht row: label left, the current state right, the whole row a link to its group (S2)
// ---------------------------------------------------------------------------

export function OverviewRow(props: { label: string; value: ReactNode; href: string; openLabel: string; attention?: boolean; testId?: string }) {
  return (
    <a
      href={props.href}
      aria-label={`${props.label}: ${props.openLabel}`}
      data-testid={props.testId}
      className="group flex min-h-11 items-center gap-3 border-b border-border py-2 text-sm outline-none transition-colors duration-100 last:border-b-0 hover:bg-hover/60 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
    >
      <span className="w-32 shrink-0 font-medium text-foreground sm:w-40">{props.label}</span>
      <span className="flex min-w-0 flex-1 items-center justify-end gap-2 text-end text-muted-foreground">
        {props.attention ? <span aria-hidden="true" className="size-1.5 shrink-0 rounded-full bg-amber-9" /> : null}
        <span className="min-w-0 truncate">{props.value}</span>
      </span>
      <ChevronRight aria-hidden="true" className="size-4 shrink-0 text-subtle-foreground transition-transform duration-100 group-hover:translate-x-0.5 motion-reduce:transition-none" />
    </a>
  );
}
