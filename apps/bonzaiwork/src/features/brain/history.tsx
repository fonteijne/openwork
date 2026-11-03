import { Ellipsis, MessageSquare, RotateCcw } from "lucide-react";

import { useBrainAuthor, useBrainHistory } from "~/backend/queries";
import type { BrainHistoryEntry } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { Disclosure } from "~/components/ui/disclosure";
import { Menu, MenuItem } from "~/components/ui/menu";
import { Row, Section, Skeleton } from "~/components/ui/misc";
import { copy, listNames } from "~/copy";
import { relativeTime } from "~/lib/format";
import { navigate } from "~/lib/router";

import { useBrainAction } from "./actions";
import { entryNotes, noteTitle } from "./model";

const RECENT = 6;

function HistoryRow(props: { projectId: string; entry: BrainHistoryEntry; me: string | null; readOnly: boolean }) {
  const { entry } = props;
  const { busy, run, brains } = useBrainAction(props.projectId);
  const notes = entryNotes(entry);
  const mine = entry.author === props.me || entry.author.toLowerCase() === "jij";
  const restorable = entry.files.filter((file) => file.endsWith(".md")).slice(0, 6);
  // A chat exists only on the laptop of whoever had it; a hand-made commit has no turn to revert.
  const canOpenChat = entry.chatId !== null && mine;
  const canRevert = entry.chatId !== null;
  const hasMenu = canOpenChat || (!props.readOnly && (restorable.length > 0 || canRevert));
  return (
    <Row
      className="flex-nowrap min-h-11 py-2"
      label={<span className="block truncate">{entry.title}</span>}
      hint={
        <span className="block truncate">
          {[`${entry.author} · ${relativeTime(entry.at)}`, entry.chatId === null ? copy.brain.history.byHand : null, notes.length ? listNames(notes.slice(0, 3)) : null].filter((part) => part !== null).join(" · ")}
        </span>
      }
      action={
        hasMenu ? (
          <Menu
            align="end"
            trigger={
              <Button variant="quiet" size="icon-sm" aria-label={copy.brain.history.actions} disabled={busy !== null}>
                <Ellipsis />
              </Button>
            }
          >
            {canOpenChat ? (
              <MenuItem icon={<MessageSquare />} onClick={() => navigate({ name: "project", projectId: props.projectId, chatId: entry.chatId })}>
                {copy.brain.openChat}
              </MenuItem>
            ) : null}
            {props.readOnly
              ? null
              : restorable.map((file) => (
                  <MenuItem key={file} icon={<RotateCcw />} onClick={() => void run("restore", () => brains.restore(props.projectId, entry.commit, file), copy.brain.restored)}>
                    {copy.brain.restoreNote}: {noteTitle(file)}
                  </MenuItem>
                ))}
            {!props.readOnly && canRevert ? (
              <MenuItem icon={<RotateCcw />} onClick={() => void run("revert", () => brains.restore(props.projectId, entry.commit, null), copy.brain.restored)}>
                {copy.brain.revertTurn}
              </MenuItem>
            ) : null}
          </Menu>
        ) : undefined
      }
    />
  );
}

/**
 * What changed in the brain and by whom (brief §6, assessment I-10): rows named by the change,
 * notes by title, the generated files hidden, the newest six open and the rest behind a disclosure
 * (P3). "Zet deze notitie terug" per note, "Draai deze beurt terug" only for a turn.
 */
export function HistorySection(props: { projectId: string; readOnly: boolean }) {
  const history = useBrainHistory(props.projectId);
  const author = useBrainAuthor();
  const me = author.data?.author?.name ?? author.data?.suggested?.name ?? null;
  const entries = history.data ?? [];
  const recent = entries.slice(0, RECENT);
  const older = entries.slice(RECENT);
  return (
    <Section title={copy.brain.history.title}>
      {history.isLoading ? (
        <div className="flex flex-col gap-2 py-3" aria-hidden="true">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-3/4" />
        </div>
      ) : !entries.length ? (
        <Row label={<span className="font-normal text-muted-foreground">{copy.brain.historyEmpty}</span>} />
      ) : (
        <>
          {recent.map((entry) => (
            <HistoryRow key={entry.commit} projectId={props.projectId} entry={entry} me={me} readOnly={props.readOnly} />
          ))}
          {older.length ? (
            <Disclosure label={copy.brain.history.older(older.length)} className="mt-1" panelClassName="ps-0">
              {older.map((entry) => (
                <HistoryRow key={entry.commit} projectId={props.projectId} entry={entry} me={me} readOnly={props.readOnly} />
              ))}
            </Disclosure>
          ) : null}
        </>
      )}
    </Section>
  );
}
