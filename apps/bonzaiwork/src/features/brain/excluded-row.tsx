import { useState } from "react";

import type { Brain } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/field";
import { copy } from "~/copy";

import { useBrainAction } from "./actions";

/**
 * Folders the AI does not open, for a folder of the person's own notes: the personal brain, and a
 * brain that became a project ("Nu omzetten") and stays that folder.
 */
export function ExcludedRow(props: { brain: Brain; readOnly: boolean }) {
  const current = props.brain.status.excluded.join(", ");
  const [value, setValue] = useState(current);
  const { busy, run, brains } = useBrainAction(props.brain.projectId);
  const folders = value.split(",").map((folder) => folder.trim()).filter(Boolean);
  return (
    <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border py-2.5">
      <label className="text-sm font-medium text-foreground" htmlFor="brain-excluded">
        {copy.brain.excluded}
      </label>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:max-w-sm">
        <Input id="brain-excluded" value={value} disabled={props.readOnly} onChange={(event) => setValue(event.target.value)} placeholder={copy.brain.excludedPlaceholder} />
        <Button variant="secondary" size="sm" disabled={props.readOnly || busy !== null || value === current} onClick={() => void run("excluded", () => brains.setExcluded(props.brain.projectId, folders), copy.settings.saved)}>
          {copy.brain.personal.excludedSave}
        </Button>
      </div>
    </div>
  );
}
