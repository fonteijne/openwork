import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { BadgeCheck } from "lucide-react";

import { useBackend } from "~/backend/context";
import { keys, useStatus } from "~/backend/queries";
import type { ConceptView } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { StatusChip } from "~/components/ui/chip";
import { Row, Section, Skeleton } from "~/components/ui/misc";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { errorText } from "~/lib/errors";
import { formatDateTime } from "~/lib/format";

import { conceptChecked, conceptTitle, groupKnowledge, isKnowledgeNote, knowledgeCounts, type KnowledgeItem } from "./model";

/** Who wrote the note and who checked it, in people words (OKF trust, plan §6.2). */
export function tierLabel(concept: ConceptView): string {
  const tiers = copy.brain.tiers;
  if (concept.tier !== "human") return tiers[concept.tier];
  const last = concept.verified.at(-1);
  // OKF records reviewers as "human:<name>"; the user sees the name.
  return tiers.human((last?.by ?? "").replace(/^human:/, ""), last?.at ? formatDateTime(Date.parse(last.at)) : "");
}

/** The note's state as icon + word (V2): amber only when it needs a look again. */
function conceptChip(concept: ConceptView | null) {
  if (!concept) return null;
  if (concept.stale) return <StatusChip status="waiting" label={copy.brain.stale} />;
  return <StatusChip status="idle" label={copy.brain.statuses[concept.status]} />;
}

function KnowledgeRow(props: { projectId: string; item: KnowledgeItem; readOnly: boolean; onOpen?: (path: string) => void }) {
  const backend = useBackend();
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { item } = props;
  const verify = async () => {
    setBusy(true);
    try {
      const next = await backend.brains.verify(props.projectId, item.path);
      client.setQueryData(keys.concept(props.projectId, item.path), next);
      toast(copy.brain.correctDone);
    } catch (failure) {
      toast(errorText(failure), { tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  const title = conceptTitle(item);
  const checked = conceptChecked(item.concept);
  return (
    <Row
      className="flex-nowrap min-h-11 py-2"
      label={
        props.onOpen ? (
          <button type="button" className="block max-w-full truncate rounded text-start text-sm font-medium text-foreground underline-offset-2 hover:underline" onClick={() => props.onOpen?.(item.path)}>
            {title}
          </button>
        ) : (
          <span className="block truncate">{title}</span>
        )
      }
      hint={
        item.concept ? (
          <span className="flex items-center gap-1 [&_svg]:size-3.5">
            {checked ? <BadgeCheck className="shrink-0 text-jade-11" aria-hidden="true" /> : null}
            <span className="truncate">{tierLabel(item.concept)}</span>
          </span>
        ) : undefined
      }
      value={conceptChip(item.concept)}
      action={
        item.concept && !checked ? (
          <Button variant="secondary" size="sm" disabled={busy || props.readOnly} onClick={() => void verify()}>
            {copy.brain.knowledge.verify}
          </Button>
        ) : undefined
      }
    />
  );
}

/**
 * What the brain knows (brief §6, assessment P-10): the notes under knowledge/ as rows grouped by
 * OKF type, each with its trust in people words, a state chip and "Klopt" inline (S2). Rows open
 * the note where the page reads files (`onOpen`); without a reader they are plain titles.
 */
export function KnowledgeSection(props: { projectId: string; readOnly: boolean; onOpen?: (path: string) => void; onSetUp?: () => void; setUpBusy?: boolean }) {
  const backend = useBackend();
  const status = useStatus();
  const files = useQuery({ queryKey: keys.files(props.projectId), queryFn: () => backend.config.files(props.projectId), staleTime: 15_000 });
  const notes = (files.data ?? []).map((file) => file.path).filter(isKnowledgeNote);
  const concepts = useQueries({
    queries: notes.map((path) => ({ queryKey: keys.concept(props.projectId, path), queryFn: () => backend.brains.concept(props.projectId, path), staleTime: 60_000 })),
  });
  const readOnly = props.readOnly || (status.data?.readOnly ?? false);
  const items: KnowledgeItem[] = notes.map((path, index) => ({ path, concept: concepts[index]?.data ?? null }));
  const counts = knowledgeCounts(items);
  const summary = copy.brain.knowledge.counts(counts.stale, counts.unverified);

  return (
    <Section title={copy.brain.knowledge.title} action={summary ? <span className="text-xs text-muted-foreground">{summary}</span> : undefined}>
      {files.isLoading ? (
        <div className="flex flex-col gap-2 py-3" aria-hidden="true">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-5/6" />
          <Skeleton className="h-9 w-2/3" />
        </div>
      ) : !items.length ? (
        <Row
          label={<span className="font-normal text-muted-foreground">{copy.brain.knowledge.empty}</span>}
          action={
            props.onSetUp ? (
              <Button variant="secondary" size="sm" disabled={readOnly || props.setUpBusy} onClick={props.onSetUp}>
                {copy.brain.knowledge.setUp}
              </Button>
            ) : undefined
          }
        />
      ) : (
        groupKnowledge(items).map((group) => (
          <div key={group.type || "other"} data-testid="knowledge-group">
            <h3 className="pt-3 pb-0.5 text-xs font-medium text-subtle-foreground">{group.label}</h3>
            {group.items.map((item) => (
              <KnowledgeRow key={item.path} projectId={props.projectId} item={item} readOnly={readOnly} onOpen={props.onOpen} />
            ))}
          </div>
        ))
      )}
    </Section>
  );
}
