import { forwardRef, type KeyboardEvent, type ReactNode } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { Search } from "lucide-react";

import { cn } from "~/lib/cn";

/**
 * A searchable list of commands (the ⌘K palette, later the composer's `/` picker; brief §12,
 * DESIGN.md P5, S7). Base UI's combobox rendered inline inside whatever surface holds it (a dialog,
 * a popover): the input owns focus and `aria-activedescendant`, ↑/↓ move the highlight through
 * every group with scrolling, ⏎ activates the highlighted row, typing re-highlights the first
 * match. Nothing here listens on `document` or `window` (S7).
 *
 * The parts compose: `Command` → `CommandInput` + `CommandList` → `CommandGroup` → `CommandItem`.
 */
export function Command(props: {
  query: string;
  onQueryChange: (query: string) => void;
  /** The highlighted row's `value`, or null when the input has the virtual focus. */
  onHighlight?: (value: string | null) => void;
  /**
   * Default: typing highlights the first match, so ⏎ opens it; before typing, ↓ chooses. Off: ⏎
   * does nothing until ↓ or a pointer chose a row.
   */
  autoHighlight?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Combobox.Root<string>
      inline
      open
      modal={false}
      value={null}
      inputValue={props.query}
      onInputValueChange={(value, details) => {
        // Choosing a row writes its label into the input (single selection); the palette does not want that.
        if (details.reason === "item-press") return;
        props.onQueryChange(value);
      }}
      autoHighlight={props.autoHighlight ?? true}
      onItemHighlighted={(value) => props.onHighlight?.(value ?? null)}
    >
      <div className={cn("flex min-h-0 flex-col", props.className)}>{props.children}</div>
    </Combobox.Root>
  );
}

/** The search field: a leading glyph, the input, an optional trailing slot (a scope chip, a chord). */
export const CommandInput = forwardRef<
  HTMLInputElement,
  {
    placeholder: string;
    /** Names the field for assistive tech; defaults to the placeholder. */
    label?: string;
    trailing?: ReactNode;
    /** Runs before Base UI's own handling; `event.preventDefault()` keeps a key for the caller. */
    onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
    autoFocus?: boolean;
    className?: string;
  }
>(function CommandInput(props, ref) {
  return (
    <div className={cn("flex shrink-0 items-center gap-2.5 border-b border-border px-4", props.className)}>
      <Search aria-hidden="true" className="size-4 shrink-0 text-subtle-foreground" />
      <Combobox.Input
        ref={ref}
        autoFocus={props.autoFocus}
        placeholder={props.placeholder}
        aria-label={props.label ?? props.placeholder}
        autoComplete="off"
        spellCheck={false}
        onKeyDown={props.onKeyDown}
        // 16px on phones so the browser does not zoom the field.
        className="h-12 min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-subtle-foreground max-sm:text-[16px]"
      />
      {props.trailing}
    </div>
  );
});

/** The scrolling listbox. Rows truncate; nothing scrolls sideways (S7). */
export function CommandList(props: { children: ReactNode; className?: string; "aria-label"?: string }) {
  return (
    <Combobox.List aria-label={props["aria-label"]} className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5 outline-none", props.className)}>
      {props.children}
    </Combobox.List>
  );
}

/** A labelled group of rows; the label is the group's accessible name. */
export function CommandGroup(props: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Combobox.Group className={cn("pb-1 last:pb-0", props.className)}>
      <Combobox.GroupLabel className="px-2.5 pt-2 pb-1 text-xs text-subtle-foreground">{props.label}</Combobox.GroupLabel>
      {props.children}
    </Combobox.Group>
  );
}

/**
 * One row: icon · label (and an optional second line) · meta on the right · trailing slot (a chord,
 * a secondary action). `onSelect` runs on click and on ⏎ while highlighted. The highlight is Base
 * UI's `data-highlighted`; hover highlights too, so the row has no separate hover state.
 */
export function CommandItem(props: {
  value: string;
  onSelect: () => void;
  icon?: ReactNode;
  children: ReactNode;
  /** A second line in muted ink (a snippet, a result sentence). */
  detail?: ReactNode;
  /** Right of the label: project chip, state word, time. */
  meta?: ReactNode;
  trailing?: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Combobox.Item
      value={props.value}
      disabled={props.disabled}
      onClick={props.onSelect}
      className={cn(
        "group/row flex min-h-9 cursor-default select-none items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-foreground outline-none data-[highlighted]:bg-hover data-[disabled]:opacity-45 pointer-coarse:min-h-11 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground",
        props.className,
      )}
    >
      {props.icon}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{props.children}</span>
        {props.detail ? <span className="truncate text-xs text-muted-foreground">{props.detail}</span> : null}
      </span>
      {props.meta ? <span className="flex shrink-0 items-center gap-2 text-xs text-subtle-foreground max-sm:min-w-0 max-sm:max-w-[45%] max-sm:shrink">{props.meta}</span> : null}
      {props.trailing}
    </Combobox.Item>
  );
}

/**
 * Below the rows, outside the listbox: what to do when nothing matched (C6), or a typed intent.
 * It is not an option, so the input never pre-highlights it; a real button inside it is reached
 * with ↓ from the input (the caller wires that) or with the pointer.
 */
export function CommandFooter(props: { children: ReactNode; className?: string }) {
  return <div className={cn("shrink-0", props.className)}>{props.children}</div>;
}
