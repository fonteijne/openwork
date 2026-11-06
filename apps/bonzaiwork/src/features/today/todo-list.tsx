import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { TriangleAlert } from "lucide-react";

import type { Todo } from "~/backend/cockpit";
import { useCockpitMutation } from "~/backend/cockpit-queries";
import { toast } from "~/components/ui/toast";
import { todayCopy } from "~/copy/today";
import { cn } from "~/lib/cn";
import { href, navigate } from "~/lib/router";
import { isEditable } from "~/lib/shortcuts";

import { dueLabel, formatShortDate } from "./model";
import { PillLink, TickBox } from "./parts";

const t = todayCopy.todos;

/** Completing a to-do: undo over confirm (P8), the toast names what was done. */
export function useCompleteTodo() {
  const update = useCockpitMutation((cockpit, input: { todoId: string; done: boolean }) => cockpit.todos.update(input.todoId, { done: input.done }));
  return (todo: Pick<Todo, "id" | "title">, onSettled?: () => void) =>
    update.mutate(
      { todoId: todo.id, done: true },
      {
        onSuccess: () =>
          toast(t.done(todo.title), {
            action: {
              label: t.undo,
              onClick: () => update.mutate({ todoId: todo.id, done: false }, { onSuccess: () => toast(t.undone), onError: () => toast(t.failed, { tone: "error" }) }),
            },
          }),
        onError: () => toast(t.failed, { tone: "error" }),
        onSettled,
      },
    );
}

/**
 * Today's to-dos as hairline rows (design v2-Main). One row is selected: it is the tab stop, it
 * carries the Delegeren button, and only it answers D (delegate) and X (complete) — the keys
 * belong to the focused row, never to the window (DESIGN.md S6). ↑/↓ move between rows.
 */
export function TodoList(props: { todos: readonly Todo[]; projectNames: ReadonlyMap<string, string>; now: number; compact?: boolean; hintId?: string }) {
  const complete = useCompleteTodo();
  const [completing, setCompleting] = useState<ReadonlySet<string>>(new Set());
  const suggested = props.todos.find((todo) => todo.external && todo.runId === null) ?? props.todos[0] ?? null;
  const [selectedId, setSelectedId] = useState<string | null>(suggested?.id ?? null);
  const list = useRef<HTMLUListElement>(null);
  const labelId = useId();

  // The selection follows the list: a completed row hands it to the next one.
  const selected = props.todos.find((todo) => todo.id === selectedId) ?? suggested;
  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  const finish = (todo: Todo) => {
    setCompleting((current) => new Set(current).add(todo.id));
    complete(todo, () =>
      setCompleting((current) => {
        const next = new Set(current);
        next.delete(todo.id);
        return next;
      }),
    );
  };

  const focusRow = (index: number) => {
    const rows = list.current?.querySelectorAll<HTMLElement>("[data-todo-row]");
    const row = rows?.[Math.max(0, Math.min(index, rows.length - 1))];
    row?.focus();
  };

  const onRowKey = (todo: Todo, index: number) => (event: KeyboardEvent<HTMLLIElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.repeat || isEditable(event.target)) return;
    const key = event.key.toLowerCase();
    if (key === "d") {
      event.preventDefault();
      navigate({ name: "delegate", todoId: todo.id });
    } else if (key === "x") {
      event.preventDefault();
      finish(todo);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (event.target !== event.currentTarget) return;
      event.preventDefault();
      focusRow(index + (event.key === "ArrowDown" ? 1 : -1));
    }
  };

  return (
    <ul ref={list} aria-label={t.listLabel} aria-describedby={props.hintId} className="m-0 list-none border-t border-line-strong p-0">
      {props.todos.map((todo, index) => {
        const isSelected = todo.id === selected?.id;
        const due = dueLabel(todo, props.now);
        const project = todo.projectId ? props.projectNames.get(todo.projectId) : null;
        const origin = todo.origin ? `${todo.origin}${todo.external ? `, ${t.external}` : ""}` : null;
        const showButton = isSelected && !props.compact;
        const meta = [project, origin, showButton && todo.due ? due.text : null].filter(Boolean).join(" · ");
        const checked = completing.has(todo.id);
        return (
          <li
            key={todo.id}
            data-todo-row=""
            tabIndex={isSelected ? 0 : -1}
            aria-labelledby={`${labelId}-${todo.id}`}
            aria-keyshortcuts="D X"
            onFocus={() => setSelectedId(todo.id)}
            onClick={() => setSelectedId(todo.id)}
            onKeyDown={onRowKey(todo, index)}
            className={cn(
              "flex items-center outline-none transition-[background-color,box-shadow] duration-150",
              props.compact ? "min-h-14 gap-3 border-b border-line-strong py-2" : "min-h-[72px] flex-wrap gap-4 border-b border-line-strong py-3",
              isSelected && !props.compact && "rounded-card border-transparent bg-surface px-4 ring-2 ring-inset ring-accent",
              props.compact && "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
              !isSelected && !props.compact && "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
            )}
          >
            <TickBox checked={checked} disabled={checked} onCheckedChange={(value) => value && finish(todo)} label={t.complete(todo.title)} />
            <span className={cn("flex min-w-0 flex-col", props.compact ? "flex-1" : "flex-[1_1_260px]")}>
              <span id={`${labelId}-${todo.id}`} className={cn("font-semibold text-ink", props.compact ? "text-[15px] leading-[22px]" : "text-lg")}>
                {todo.title}
              </span>
              {!props.compact && meta ? <span className="text-sm text-ink-muted">{meta}</span> : null}
            </span>
            {showButton ? (
              <PillLink href={href({ name: "delegate", todoId: todo.id })} aria-label={t.delegateLabel(todo.title)}>
                {t.delegate}
              </PillLink>
            ) : (
              <DueText tone={due.tone} compact={props.compact}>
                {props.compact && todo.due ? (due.tone === "overdue" ? t.overdueShort : formatShortDate(todo.due.at)) : due.text}
              </DueText>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function DueText(props: { tone: "overdue" | "today" | "plain"; compact?: boolean; children: string }) {
  if (props.tone === "overdue")
    return (
      <span className={cn("inline-flex shrink-0 items-center gap-1.5 font-semibold text-ink", props.compact ? "text-[13px]" : "text-sm")}>
        <TriangleAlert className="size-4" aria-hidden="true" />
        {props.children}
      </span>
    );
  return <span className={cn("shrink-0 text-ink-muted", props.compact ? "text-[13px]" : "text-sm")}>{props.children}</span>;
}
