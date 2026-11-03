import { Kbd } from "~/components/ui/misc";
import { Dialog } from "~/components/ui/overlay";
import { copy } from "~/copy";
import { chord, SHORTCUTS } from "~/lib/shortcuts";

import { useUi } from "./ui-store";

/** The chords of one row: the nine project chords collapse to a range. */
function rows(): { label: string; keys: string[] }[] {
  const out: { label: string; keys: string[] }[] = [];
  let projectsListed = false;
  for (const entry of SHORTCUTS) {
    if (entry.id.startsWith("project")) {
      if (projectsListed) continue;
      projectsListed = true;
      out.push({ label: copy.shell.shortcuts.projects, keys: [chord("project1"), chord("project9")] });
      continue;
    }
    out.push({ label: entry.label, keys: [chord(entry.id)] });
  }
  return out;
}

/** ⌘⇧/: the shortcuts table (brief §4), read from the same source as the listener (S6). */
export function ShortcutsSheet() {
  const open = useUi((state) => state.shortcutsOpen);
  const setOpen = useUi((state) => state.setShortcuts);
  return (
    <Dialog open={open} onOpenChange={setOpen} title={copy.shell.shortcutsTitle}>
      <dl className="flex flex-col">
        {rows().map((row) => (
          <div key={row.label} className="flex min-h-10 items-center justify-between gap-4 border-b border-border py-2 last:border-b-0">
            <dt className="text-sm text-foreground">{row.label}</dt>
            <dd className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
              {row.keys.map((key, index) => (
                <span key={key} className="flex items-center gap-1">
                  {index > 0 ? <span aria-hidden="true">…</span> : null}
                  <Kbd>{key}</Kbd>
                </span>
              ))}
            </dd>
          </div>
        ))}
        <div className="flex min-h-10 items-center justify-between gap-4 py-2">
          <dt className="text-sm text-foreground">{copy.shell.shortcuts.cardOnly}</dt>
          <dd className="shrink-0 text-xs text-muted-foreground">
            <Kbd>{copy.shell.shortcuts.cardKeys}</Kbd>
          </dd>
        </div>
      </dl>
    </Dialog>
  );
}
