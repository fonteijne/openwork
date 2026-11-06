import type { LibraryChange } from "~/backend/cockpit";
import { cn } from "~/lib/cn";

/**
 * The lines of a Library change: removed lines struck through, added lines underlined, unchanged
 * lines plain. The sign is visual; screen readers hear "Verwijderd:" / "Toegevoegd:".
 */
export function DiffLines(props: { diff: LibraryChange["diff"]; labels: { removed: string; added: string }; size?: "md" | "lg"; className?: string }) {
  return (
    <ul className={cn("m-0 flex list-none flex-col gap-2 p-0", props.size === "lg" ? "text-lg" : "text-base", props.className)}>
      {props.diff.map((line, index) => (
        <li key={index} className={cn("flex gap-3", line.op === "remove" && "text-ink-muted")}>
          <span aria-hidden="true" className="w-4 shrink-0 font-bold">
            {line.op === "add" ? "+" : line.op === "remove" ? "−" : ""}
          </span>
          <span className="min-w-0">
            {line.op === "remove" ? (
              <>
                <span className="sr-only">{props.labels.removed}</span>
                <s>{line.text}</s>
              </>
            ) : line.op === "add" ? (
              <>
                <span className="sr-only">{props.labels.added}</span>
                <span className="underline decoration-2 underline-offset-[5px]">{line.text}</span>
              </>
            ) : (
              line.text
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function diffCounts(changes: readonly LibraryChange[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const change of changes)
    for (const line of change.diff) {
      if (line.op === "add") added += 1;
      if (line.op === "remove") removed += 1;
    }
  return { added, removed };
}
