import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Check } from "lucide-react";

import { cn } from "~/lib/cn";
import { copy } from "~/copy";

import { STARTERS, type StarterId } from "./starters";

const isStarter = (value: unknown): value is StarterId => STARTERS.some((starter) => starter.id === value);

/**
 * "Begin met": four quiet chips under the name (assessment I-4). Base UI's ToggleGroup gives
 * arrow-key movement and `aria-pressed`; one chip at most, pressing it again clears the choice.
 * The pressed chip is an ink pill with a check, the rest hairline pills (V7: no chip soup, one
 * row, one choice).
 */
export function StarterChips(props: { value: StarterId | null; onChange: (value: StarterId | null) => void; disabled?: boolean; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", props.className)}>
      <span id="project-starters-label" className="text-sm font-medium text-foreground">
        {copy.newProject.starters}
      </span>
      <ToggleGroup
        value={props.value ? [props.value] : []}
        onValueChange={(values) => {
          const next = values[0];
          props.onChange(isStarter(next) ? next : null);
        }}
        aria-labelledby="project-starters-label"
        disabled={props.disabled}
        className="flex flex-wrap gap-1.5"
        data-testid="project-starters"
      >
        {STARTERS.map((starter) => (
          <Toggle
            key={starter.id}
            value={starter.id}
            className="inline-flex h-7 select-none items-center gap-1 whitespace-nowrap rounded-full bg-background px-3 text-xs font-medium text-muted-foreground ring-1 ring-inset ring-border outline-none transition-[background-color,color,box-shadow] duration-100 hover:text-foreground hover:ring-border-strong focus-visible:ring-2 focus-visible:ring-ring data-[pressed]:bg-foreground data-[pressed]:text-background data-[pressed]:ring-foreground disabled:pointer-events-none disabled:opacity-45 pointer-coarse:h-9 [&_svg]:size-3.5"
          >
            {props.value === starter.id ? <Check aria-hidden="true" /> : null}
            {starter.name}
          </Toggle>
        ))}
      </ToggleGroup>
    </div>
  );
}
