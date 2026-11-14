import { useEffect, useMemo, useRef, useState } from "react";

import type { AttentionItem, Brain, Project, Routine } from "~/backend/types";
import { Disclosure } from "~/components/ui/disclosure";
import { Skeleton } from "~/components/ui/misc";
import { copy } from "~/copy";
import { formatWhen } from "~/lib/format";
import { focusCard } from "~/lib/card-keys";

import { trustDismissed } from "../brain/model";
import { AttentionCard } from "./attention-cards";
import { attentionKey, attentionProjectId, MAX_CARDS } from "./model";

/** A card that was answered stays gone until the poll agrees, or for this long when it does not. */
const HIDE_MS = 20_000;

export function SectionHeading(props: { title: string; count?: number; trailing?: React.ReactNode; id?: string }) {
  return (
    <div className="mb-2 flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1">
      <h2 id={props.id} className="shrink-0 text-sm font-semibold text-foreground">
        {props.title}
      </h2>
      {props.count !== undefined ? <span className="text-xs text-muted-foreground">{props.count}</span> : null}
      {props.trailing ? <div className="ms-auto flex min-w-0 items-center gap-2">{props.trailing}</div> : null}
    </div>
  );
}

/**
 * "Voor jou" (brief §5): one Callout per open decision, in the backend's order; at most five, the
 * rest behind "Nog n". After an answer the card leaves, the page stays (P11, S5) and focus moves
 * to the next card, or to nothing moves when none is left. The first card is the focal element by
 * weight only (P7: its action is the one filled primary); arriving moves no focus (S5).
 */
export function AttentionSection(props: {
  items: readonly AttentionItem[] | undefined;
  loading: boolean;
  projects: ReadonlyMap<string, Project>;
  brains: ReadonlyMap<string, Brain>;
  routines: ReadonlyMap<string, Routine>;
  nextRoutine: Routine | null;
  /** False when another element on the page is the focal one ("Start hier"): then no card gets the filled primary by weight (P7). */
  focal?: boolean;
  /** How many cards before "Nog n"; fewer when the page has more to show beside them. */
  maxCards?: number;
}) {
  const refs = useRef(new Map<string, HTMLElement>());
  const [hidden, setHidden] = useState<Map<string, number>>(() => new Map());
  const [advanceTo, setAdvanceTo] = useState<number | null>(null);

  const visible = useMemo(() => {
    const now = Date.now();
    return (props.items ?? []).filter((item) => {
      const projectId = attentionProjectId(item);
      if (projectId && !props.projects.has(projectId)) return false;
      // "Nu niet" on the trust card is remembered per device (brief §8); the poll still carries the item.
      if (item.kind === "brain" && item.state === "needs_trust") {
        const brain = props.brains.get(item.projectId);
        if (brain && trustDismissed(item.projectId, brain.status)) return false;
      }
      const until = hidden.get(attentionKey(item));
      return until === undefined || until < now;
    });
  }, [props.items, props.projects, hidden]);

  // A hidden key the poll no longer carries can be forgotten.
  useEffect(() => {
    if (!hidden.size || !props.items) return;
    const present = new Set(props.items.map(attentionKey));
    const next = new Map([...hidden].filter(([key, until]) => present.has(key) && until > Date.now()));
    if (next.size !== hidden.size) setHidden(next);
  }, [props.items, hidden]);

  const resolve = (key: string) => {
    const index = visible.findIndex((item) => attentionKey(item) === key);
    setHidden((current) => new Map(current).set(key, Date.now() + HIDE_MS));
    setAdvanceTo(index === -1 ? null : index);
  };

  // Focus moves to the card that took the answered one's place; the composer when none is left.
  // Only after the person answered a card: arriving on the page moves no focus (S5), so a stray
  // esc or ⏎ never answers a decision nobody looked at (brief §4).
  useEffect(() => {
    if (advanceTo === null) return;
    const target = visible[Math.min(advanceTo, visible.length - 1)];
    const element = target ? refs.current.get(attentionKey(target)) : undefined;
    if (element) focusCard(element);
    setAdvanceTo(null);
  }, [advanceTo, visible]);

  const card = (item: AttentionItem, index: number) => {
    const key = attentionKey(item);
    const projectId = attentionProjectId(item);
    return (
      <AttentionCard
        key={key}
        item={item}
        project={projectId ? (props.projects.get(projectId) ?? null) : null}
        brain={projectId ? (props.brains.get(projectId) ?? null) : null}
        routine={item.kind === "routine" ? (props.routines.get(item.routineId) ?? null) : null}
        isFocal={index === 0 && props.focal !== false}
        onResolved={() => resolve(key)}
        cardRef={(element) => {
          if (element) refs.current.set(key, element);
          else refs.current.delete(key);
        }}
      />
    );
  };

  if (props.loading && !props.items) {
    return (
      <section aria-labelledby="home-for-you" aria-busy="true">
        <SectionHeading id="home-for-you" title={copy.home.forYou} />
        <Skeleton className="h-24 w-full rounded-window" />
      </section>
    );
  }

  const maxCards = props.maxCards ?? MAX_CARDS;
  const shown = visible.slice(0, maxCards);
  const more = visible.slice(maxCards);

  return (
    <section aria-labelledby="home-for-you" data-testid="home-for-you">
      <SectionHeading id="home-for-you" title={copy.home.forYou} count={visible.length || undefined} />
      {visible.length ? (
        <div className="flex flex-col gap-3">
          {shown.map(card)}
          {more.length ? (
            <Disclosure label={copy.home.more(more.length)} panelClassName="flex flex-col gap-3 ps-0 pt-2">
              {more.map((item) => card(item, maxCards))}
            </Disclosure>
          ) : null}
        </div>
      ) : (
        // One line, no explanation (C6, P1).
        <p className="text-sm text-muted-foreground">{props.nextRoutine?.nextRunAt ? copy.home.nothingWaitingNext(formatWhen(props.nextRoutine.nextRunAt)) : copy.home.nothingWaiting}</p>
      )}
    </section>
  );
}
