import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { useBackend } from "~/backend/context";
import { keys } from "~/backend/queries";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/field";
import { Section, Skeleton } from "~/components/ui/misc";
import { toast } from "~/components/ui/toast";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";

import { settingsCopy } from "./copy";

const AUTOSAVE_MS = 800;

type SaveState = "idle" | "dirty" | "saving" | "saved";

/**
 * Instructions as a proportional, autosaving editor (brief §6; assessment P-3): no Save button,
 * the row state says "Opgeslagen zojuist · Ongedaan maken" (P8), starter chips append a line.
 * No sentence explains the mechanism (P1); the file name lives under Technisch.
 */
export function InstructionsSection(props: { projectId: string }) {
  const backend = useBackend();
  const client = useQueryClient();
  const query = useQuery({ queryKey: keys.instructions(props.projectId), queryFn: () => backend.config.instructions(props.projectId) });
  const [value, setValue] = useState<string | null>(null);
  const [state, setState] = useState<SaveState>("idle");
  const [previous, setPrevious] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const latest = useRef("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const text = value ?? query.data ?? "";
  latest.current = text;

  const persist = async (next: string, before: string) => {
    setState("saving");
    try {
      await backend.config.setInstructions(props.projectId, next);
      client.setQueryData(keys.instructions(props.projectId), next);
      setPrevious(before);
      setState("saved");
    } catch (failure) {
      toast(errorText(failure), { tone: "error" });
      setState("dirty");
    }
  };
  const schedule = (next: string) => {
    const before = query.data ?? "";
    setValue(next);
    setState("dirty");
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void persist(latest.current, before);
    }, AUTOSAVE_MS);
  };
  // Leaving the group with a pending save flushes it: nothing typed is lost (assessment P-3).
  useEffect(
    () => () => {
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        void backend.config.setInstructions(props.projectId, latest.current).then(() => client.invalidateQueries({ queryKey: keys.instructions(props.projectId) }));
      }
    },
    [backend, client, props.projectId],
  );
  const undo = () => {
    if (previous === null) return;
    const restored = previous;
    setValue(restored);
    setPrevious(null);
    void persist(restored, text).then(() => toast(settingsCopy.instructions.undone));
  };
  const addLine = (line: string) => {
    const base = text.replace(/\s+$/, "");
    schedule(base ? `${base}\n- ${line}` : `- ${line}`);
    textarea.current?.focus();
  };
  const lines = text.split("\n").filter((line) => line.trim()).length;

  return (
    <Section
      title={settingsCopy.instructions.title}
      action={
        <span className="flex items-center gap-2 text-xs text-muted-foreground" role="status" aria-live="polite">
          {state === "saving" ? settingsCopy.instructions.saving : state === "saved" ? settingsCopy.instructions.savedJustNow : state === "dirty" ? settingsCopy.instructions.unsaved : lines ? settingsCopy.lines(lines) : null}
          {state === "saved" && previous !== null ? (
            <>
              <span aria-hidden="true">·</span>
              <button type="button" className="font-medium text-foreground underline-offset-2 hover:underline" onClick={undo}>
                {settingsCopy.instructions.undo}
              </button>
            </>
          ) : null}
        </span>
      }
    >
      <div className="flex flex-col gap-3 py-3">
        {query.isLoading ? (
          <Skeleton className="h-40 w-full rounded-2xl" />
        ) : (
          <Textarea
            ref={textarea}
            value={text}
            onChange={(event) => schedule(event.target.value)}
            placeholder={settingsCopy.instructions.placeholder}
            rows={8}
            aria-label={settingsCopy.instructions.title}
            className={cn("min-h-40 leading-relaxed")}
            data-testid="settings-instructions"
          />
        )}
        <div className="flex flex-wrap items-center gap-1.5" aria-label={settingsCopy.instructions.starters}>
          {settingsCopy.instructions.starterChips.map((chip) => (
            <Button key={chip} variant="secondary" size="sm" onClick={() => addLine(chip)} disabled={query.isLoading || text.includes(chip)}>
              <Plus />
              {chip}
            </Button>
          ))}
        </div>
      </div>
    </Section>
  );
}
