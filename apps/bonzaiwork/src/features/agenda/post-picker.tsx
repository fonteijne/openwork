import { useState, type ReactElement } from "react";
import { Check } from "lucide-react";
import { POST_LABEL_MAX } from "@bonzaiwork/agenda/model";

import type { BridgePost } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { Disclosure } from "~/components/ui/disclosure";
import { Field, Input } from "~/components/ui/field";
import { Popover } from "~/components/ui/popover";
import { copy } from "~/copy";
import { cn } from "~/lib/cn";

import { draftPost } from "./bridge-post-field";

/**
 * "Kies post": one anchored surface (Base UI Popover, S7) with the recent Bridge posts as rows
 * and "Andere post" behind a disclosure (P3) for an id you still have to look up. Names first,
 * ids in mono under them (C3): the post is the thing people recognise. One press chooses and
 * closes; focus returns to the trigger.
 */
export function PostPicker(props: {
  recent: readonly BridgePost[];
  current?: BridgePost | null;
  onChoose: (post: BridgePost) => void;
  trigger: ReactElement<Record<string, unknown>>;
  side?: "top" | "bottom";
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ entityId: "", label: "" });
  const [tried, setTried] = useState(false);
  const parsed = draftPost(draft);
  const invalid = tried && (parsed === "invalid" || parsed === null);

  const choose = (post: BridgePost) => {
    setOpen(false);
    props.onChoose(post);
  };

  const chooseOther = () => {
    setTried(true);
    if (parsed === "invalid" || parsed === null) return;
    choose(parsed);
    setDraft({ entityId: "", label: "" });
    setTried(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen} label={copy.agenda.picker.label} trigger={props.trigger} side={props.side} align={props.align} modal className="w-72">
      <p className="px-2 pt-1 pb-1.5 text-xs font-semibold text-muted-foreground">{copy.agenda.picker.recent}</p>
      {props.recent.length ? (
        <ul className="flex flex-col" aria-label={copy.agenda.picker.recent}>
          {props.recent.map((post) => {
            const chosen = props.current?.entityId === post.entityId;
            return (
              <li key={post.entityId}>
                <button
                  type="button"
                  onClick={() => choose(post)}
                  aria-current={chosen ? "true" : undefined}
                  className="flex w-full min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 text-start outline-none transition-colors duration-100 hover:bg-hover focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                  data-testid="agenda-post-option"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={cn("truncate text-sm text-foreground", chosen && "font-semibold")}>{post.label ?? post.entityId}</span>
                    {post.label ? <span className="truncate font-mono text-[0.6875rem] text-subtle-foreground">{post.entityId}</span> : null}
                  </span>
                  {chosen ? <Check aria-hidden="true" className="size-4 shrink-0 text-foreground" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-2 pb-2 text-sm text-muted-foreground">{copy.agenda.picker.noRecent}</p>
      )}
      <div className="mt-1 border-t border-border pt-1">
        <Disclosure label={copy.agenda.picker.other} size="sm" panelClassName="ps-1 pt-2">
          <form
            className="flex flex-col gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              chooseOther();
            }}
          >
            <Field label={copy.agenda.picker.entityId} error={invalid ? copy.agenda.post.invalid : null}>
              {(id, describedBy) => (
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={invalid || undefined}
                  value={draft.entityId}
                  onChange={(event) => setDraft({ ...draft, entityId: event.target.value })}
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono"
                  data-testid="bridge-post-entity"
                />
              )}
            </Field>
            <Field label={copy.agenda.picker.name} optional>
              {(id) => <Input id={id} value={draft.label} maxLength={POST_LABEL_MAX} onChange={(event) => setDraft({ ...draft, label: event.target.value })} placeholder={copy.agenda.post.labelPlaceholder} />}
            </Field>
            <div>
              <Button type="submit" variant="secondary" size="sm">
                {copy.agenda.picker.use}
              </Button>
            </div>
          </form>
        </Disclosure>
      </div>
    </Popover>
  );
}
