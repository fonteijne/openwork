import { useState } from "react";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";

import { PROJECT_COLORS, PROJECT_ICONS, type ProjectColor, type ProjectIcon as ProjectIconName } from "~/backend/types";
import { PROJECT_ICON_COMPONENTS, ProjectIcon } from "~/components/project-icon";
import { Popover } from "~/components/ui/popover";
import { copy } from "~/copy";

import type { Look } from "./look";

const isColor = (value: unknown): value is ProjectColor => PROJECT_COLORS.some((color) => color === value);
const isIcon = (value: unknown): value is ProjectIconName => PROJECT_ICONS.some((icon) => icon === value);

/** Nine swatches as one radio group: one tab stop, arrows move the choice (P5; assessment P-8). */
function ColorChoice(props: { value: ProjectColor; onChange: (value: ProjectColor) => void }) {
  return (
    <RadioGroup
      value={props.value}
      onValueChange={(value) => {
        if (isColor(value)) props.onChange(value);
      }}
      aria-label={copy.newProject.color}
      className="flex flex-wrap gap-1.5"
    >
      {PROJECT_COLORS.map((color) => (
        <Radio.Root
          key={color}
          value={color}
          aria-label={copy.colors[color]}
          title={copy.colors[color]}
          data-project-color={color}
          className="flex size-7 items-center justify-center rounded-full bg-[var(--project-solid)] outline-none ring-offset-2 ring-offset-popover transition-shadow duration-100 hover:ring-2 hover:ring-border-strong focus-visible:ring-2 focus-visible:ring-ring data-[checked]:ring-2 data-[checked]:ring-foreground pointer-coarse:size-9"
        >
          <Radio.Indicator className="size-2 rounded-full bg-background" />
        </Radio.Root>
      ))}
    </RadioGroup>
  );
}

/** Twelve icons as one radio group with Dutch names, tinted with the chosen color. */
function IconChoice(props: { value: ProjectIconName; color: ProjectColor; onChange: (value: ProjectIconName) => void }) {
  return (
    <RadioGroup
      value={props.value}
      onValueChange={(value) => {
        if (isIcon(value)) props.onChange(value);
      }}
      aria-label={copy.newProject.icon}
      data-project-color={props.color}
      className="grid grid-cols-6 gap-1"
    >
      {PROJECT_ICONS.map((icon) => {
        const Icon = PROJECT_ICON_COMPONENTS[icon];
        return (
          <Radio.Root
            key={icon}
            value={icon}
            aria-label={copy.icons[icon]}
            title={copy.icons[icon]}
            className="flex size-9 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors duration-100 hover:bg-hover hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-[checked]:bg-[var(--project-soft)] data-[checked]:text-[var(--project-ink)] data-[checked]:ring-1 data-[checked]:ring-[var(--project-solid)] pointer-coarse:size-10 [&_svg]:size-4"
          >
            <Icon strokeWidth={1.75} />
          </Radio.Root>
        );
      })}
    </RadioGroup>
  );
}

/**
 * The 40px tile next to the name field (assessment I-5): a live preview of the look, and the
 * trigger of a Popover (S7) with the color and icon groups. Picking something marks the look as
 * the person's own choice, so the name no longer changes it.
 */
export function LookTile(props: { look: Look; name: string; onChange: (look: Look) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      label={copy.newProject.look}
      modal
      trigger={
        <button
          type="button"
          disabled={props.disabled}
          aria-label={copy.newProject.lookFor(props.name.trim())}
          title={copy.newProject.look}
          className="shrink-0 rounded-lg outline-none transition-[box-shadow] duration-100 hover:ring-2 hover:ring-border focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 data-[popup-open]:ring-2 data-[popup-open]:ring-ring"
          data-testid="project-look"
        >
          <ProjectIcon icon={props.look.icon} color={props.look.color} size="lg" />
        </button>
      }
    >
      <div className="flex w-64 flex-col gap-3 p-1">
        <ColorChoice value={props.look.color} onChange={(color) => props.onChange({ ...props.look, color })} />
        <IconChoice value={props.look.icon} color={props.look.color} onChange={(icon) => props.onChange({ ...props.look, icon })} />
      </div>
    </Popover>
  );
}
