import { History } from "lucide-react";
import { validEntityId, POST_LABEL_MAX } from "@bonzaiwork/agenda/model";

import type { BridgePost } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { Field, Input } from "~/components/ui/field";
import { Menu, MenuItem, MenuLabel } from "~/components/ui/menu";
import { copy } from "~/copy";
import { cn } from "~/lib/cn";

/**
 * A Bridge post as two fields (plan §2.6): the entity id (`bridge add_worklog --entity`) and an
 * optional name you recognise. The recent posts fill both in one go. Validation is the server's
 * (`validEntityId`); BonzaiWork never checks a post with Bridge itself.
 */

export type PostDraft = { entityId: string; label: string };

export const emptyPost = (post: BridgePost | null): PostDraft => ({ entityId: post?.entityId ?? "", label: post?.label ?? "" });

/** Null for an empty draft; "invalid" when the entity id does not pass. */
export function draftPost(draft: PostDraft): BridgePost | null | "invalid" {
  const entityId = draft.entityId.trim();
  const label = draft.label.replace(/\s+/g, " ").trim();
  if (!entityId && !label) return null;
  if (!validEntityId(entityId) || label.length > POST_LABEL_MAX) return "invalid";
  return { entityId, label: label || null };
}

export function BridgePostField(props: { value: PostDraft; onChange: (value: PostDraft) => void; recent: BridgePost[]; showError: boolean; disabled?: boolean; autoFocus?: boolean }) {
  const invalid = props.showError && draftPost(props.value) === "invalid";
  return (
    <div className="flex flex-col gap-3">
      <Field label={copy.agenda.post.entityId} error={invalid ? copy.agenda.post.invalid : null}>
        {(id, describedBy) => (
          <div className="flex items-center gap-1.5">
            <Input
              id={id}
              aria-describedby={describedBy}
              aria-invalid={invalid || undefined}
              value={props.value.entityId}
              onChange={(event) => props.onChange({ ...props.value, entityId: event.target.value })}
              placeholder={copy.agenda.post.entityPlaceholder}
              autoComplete="off"
              spellCheck={false}
              autoFocus={props.autoFocus}
              disabled={props.disabled}
              data-testid="bridge-post-entity"
              className="font-mono"
            />
            <Menu
              align="end"
              trigger={
                <Button variant="quiet" size="icon" aria-label={copy.agenda.post.recent} disabled={props.disabled}>
                  <History />
                </Button>
              }
            >
              <MenuLabel>{copy.agenda.post.recent}</MenuLabel>
              {props.recent.length ? (
                props.recent.map((post) => (
                  <MenuItem key={post.entityId} onClick={() => props.onChange(emptyPost(post))}>
                    <span className="font-mono text-xs">{post.entityId}</span>
                    {post.label ? <span className="ms-2 text-muted-foreground">{post.label}</span> : null}
                  </MenuItem>
                ))
              ) : (
                <MenuItem disabled>{copy.agenda.post.noRecent}</MenuItem>
              )}
            </Menu>
          </div>
        )}
      </Field>
      <Field label={copy.agenda.post.label} optional>
        {(id) => (
          <Input
            id={id}
            value={props.value.label}
            maxLength={POST_LABEL_MAX}
            onChange={(event) => props.onChange({ ...props.value, label: event.target.value })}
            placeholder={copy.agenda.post.labelPlaceholder}
            disabled={props.disabled}
          />
        )}
      </Field>
    </div>
  );
}

/**
 * A post as people read it (C3): the name first, the entity id only in a tooltip; the id in mono
 * when the post has no name; or "Geen Bridge-post" in neutral ink (C5).
 */
export function PostLine(props: { post: BridgePost | null; className?: string }) {
  if (!props.post) return <span className={props.className ?? "text-muted-foreground"}>{copy.agenda.noPost}</span>;
  if (!props.post.label) return <span className={cn("min-w-0 truncate font-mono text-[0.75rem] text-foreground", props.className)}>{props.post.entityId}</span>;
  return (
    <span className={cn("min-w-0 truncate text-foreground", props.className)} title={props.post.entityId}>
      {props.post.label}
    </span>
  );
}
