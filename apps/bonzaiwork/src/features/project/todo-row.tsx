import { useRef, useState, type ReactNode } from "react";
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { Check, TriangleAlert } from "lucide-react";

import type { Todo } from "~/backend/cockpit";
import { useCockpitMutation } from "~/backend/cockpit-queries";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/field";
import { toast } from "~/components/ui/toast";
import { projectsCopy } from "~/copy/projects";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";

import { dayLabel } from "./dates";

const C = projectsCopy.overview;

/** Checks a to-do off (or opens it again), with undo in the toast (P8). */
export function useToggleTodo() {
  const update = useCockpitMutation((cockpit, input: { id: string; done: boolean }) => cockpit.todos.update(input.id, { done: input.done }));
  return (todo: Todo) => {
    const done = !todo.done;
    update.mutate(
      { id: todo.id, done },
      {
        onSuccess: () => toast(done ? C.todoDone : C.todoReopened, { action: { label: C.undo, onClick: () => update.mutate({ id: todo.id, done: !done }) } }),
        onError: (failure) => toast(errorText(failure), { tone: "error" }),
      },
    );
  };
}

/** One to-do as a hairline row: a 22px box, the title, then a date or "Te laat" on the right. */
export function TodoRow(props: { todo: Todo; onToggle: (todo: Todo) => void; meta?: ReactNode; trailing?: ReactNode; now: number }) {
  const { todo } = props;
  const overdue = !todo.done && todo.due !== null && todo.due.at < new Date(props.now).setHours(0, 0, 0, 0);
  return (
    <li className="flex min-h-[72px] flex-wrap items-center gap-x-4 gap-y-1 border-b border-line-strong py-3">
      <CheckboxPrimitive.Root
        checked={todo.done}
        onCheckedChange={() => props.onToggle(todo)}
        aria-label={C.completeTodo(todo.title)}
        className="relative flex size-[22px] shrink-0 items-center justify-center rounded-[4px] ring-[1.5px] ring-inset ring-ink outline-none transition-colors before:absolute before:-inset-3 before:content-[''] focus-visible:ring-2 focus-visible:ring-ring data-[checked]:bg-primary data-[checked]:ring-primary"
      >
        <CheckboxPrimitive.Indicator className="text-primary-foreground">
          <Check className="size-4" strokeWidth={2.5} aria-hidden="true" />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <span className="flex min-w-0 flex-[1_1_200px] flex-col">
        <span className={cn("text-lg font-semibold text-ink", todo.done && "text-ink-muted line-through")}>{todo.title}</span>
        {props.meta ? <span className="text-sm text-ink-muted">{props.meta}</span> : null}
      </span>
      <span className="ms-auto flex shrink-0 items-center gap-4">
        {overdue ? (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
            <TriangleAlert className="size-4" aria-hidden="true" />
            {C.overdue}
          </span>
        ) : todo.due ? (
          <span className="text-sm text-ink-muted">{dayLabel(todo.due.at, props.now)}</span>
        ) : null}
        {props.trailing}
      </span>
    </li>
  );
}

/** "To-do toevoegen" as an inline row: a field, Toevoegen, Annuleren. */
export function AddTodoForm(props: { projectId: string; onClose: () => void }) {
  const [title, setTitle] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const create = useCockpitMutation((cockpit, text: string) => cockpit.todos.create({ title: text, projectId: props.projectId, due: null }));
  const submit = () => {
    const text = title.trim();
    if (!text) {
      input.current?.focus();
      return;
    }
    create.mutate(text, {
      onSuccess: () => {
        setTitle("");
        toast(C.todoAdded);
        input.current?.focus();
      },
      onError: (failure) => toast(errorText(failure), { tone: "error" }),
    });
  };
  return (
    <form
      className="flex flex-wrap items-center gap-3 border-b border-line-strong py-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label className="min-w-0 flex-[1_1_240px]">
        <span className="sr-only">{C.todoField}</span>
        <Input
          ref={input}
          autoFocus
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={C.todoPlaceholder}
          onKeyDown={(event) => {
            if (event.key === "Escape") props.onClose();
          }}
          className="h-12 rounded-full px-5"
        />
      </label>
      <Button type="submit" variant="primary" size="xl" disabled={create.isPending}>
        {C.todoAdd}
      </Button>
      <Button variant="ghost" size="xl" onClick={props.onClose}>
        {C.cancel}
      </Button>
    </form>
  );
}
