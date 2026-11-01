import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BadgeCheck } from "lucide-react";

import { useBackend } from "~/backend/context";
import { keys, useBrain, useConcept, useStatus } from "~/backend/queries";
import type { ConceptView } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { errorText } from "~/lib/errors";
import { formatDateTime } from "~/lib/format";

function tierLabel(concept: ConceptView): string {
  const tiers = copy.brain.tiers;
  if (concept.tier !== "human") return tiers[concept.tier];
  const last = concept.verified.at(-1);
  // OKF records reviewers as "human:<name>"; the user sees the name.
  return tiers.human((last?.by ?? "").replace(/^human:/, ""), last?.at ? formatDateTime(Date.parse(last.at)) : "");
}

/** The concept's path inside the brain, whether the preview got it relative or absolute. */
function conceptPath(path: string, root: string): string {
  const prefix = `${root.replace(/[\\/]+$/, "")}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

/**
 * Who wrote a knowledge note and who checked it (OKF trust, brains plan
 * §6.2), above the note itself. One action, "Klopt", for whoever read it
 * and agrees (DESIGN.md S2); it records the check in the note.
 */
export function ConceptFacts(props: { projectId: string; path: string | null }) {
  const backend = useBackend();
  const client = useQueryClient();
  const status = useStatus();
  const brain = useBrain(props.projectId);
  const path = brain && props.path ? conceptPath(props.path, brain.path) : null;
  const concept = useConcept(props.projectId, brain ? path : null);
  const [busy, setBusy] = useState(false);
  if (!path || !concept.data) return null;
  const view = concept.data;
  const readOnly = (status.data?.readOnly ?? false) || brain?.status.mode === "read_only";

  const verify = async () => {
    setBusy(true);
    try {
      const next = await backend.brains.verify(props.projectId, path);
      client.setQueryData(keys.concept(props.projectId, path), next);
      toast(copy.brain.correctDone);
    } catch (failure) {
      toast(errorText(failure), { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  const sources = view.sources.flatMap((source) => {
    const label = source.title ?? source.resource ?? source.id;
    return label ? [label] : [];
  });

  return (
    <div className="mb-4 flex flex-col gap-2 rounded-2xl bg-muted/70 px-4 py-3" data-testid="concept-facts">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm text-foreground [&_svg]:size-4">
          {view.tier === "human" ? <BadgeCheck className="text-jade-11" /> : null}
          {tierLabel(view)}
        </p>
        <Button variant="secondary" size="sm" disabled={busy || readOnly} onClick={() => void verify()}>
          {copy.brain.correct}
        </Button>
      </div>
      <p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
        <span>{copy.brain.statuses[view.status]}</span>
        {view.stale ? <span className="font-medium text-amber-11">{copy.brain.stale}</span> : null}
        {view.tags.length ? <span>{view.tags.join(", ")}</span> : null}
      </p>
      {sources.length ? (
        <p className="text-xs text-muted-foreground">
          {copy.brain.sources}: {sources.slice(0, 4).join(", ")}
        </p>
      ) : null}
    </div>
  );
}
