import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Download, FolderOpen } from "lucide-react";
import { datesBetween, isDate, proposal } from "@bonzaiwork/agenda/model";

import { useBackend } from "~/backend/context";
import { keys } from "~/backend/queries";
import { Button } from "~/components/ui/button";
import { Field, Input } from "~/components/ui/field";
import { Row, Skeleton } from "~/components/ui/misc";
import { Dialog } from "~/components/ui/overlay";
import { Select } from "~/components/ui/select";
import { copy } from "~/copy";
import { errorText } from "~/lib/errors";

import { dutchDuration, MAX_PERIOD_DAYS, periodFor, type PeriodKind } from "./format";

/**
 * "Exporteer voor Bridge" (plan §7.4): a period, what the document will propose, and the two ways out:
 * the Markdown on the clipboard for a chat, or a file in Downloads. Nothing blocks: time without a
 * post is a point of attention in the document, not an error here. Confirmations stay in this dialog
 * (plan §7.6: no toast outside the panel).
 */

type Done = { kind: "copied" } | { kind: "saved"; path: string } | { kind: "failed"; text: string };

export function BookingExport(props: { open: boolean; onOpenChange: (open: boolean) => void; today: string; onShowDate: (date: string) => void }) {
  const backend = useBackend();
  const [kind, setKind] = useState<PeriodKind>("today");
  const [custom, setCustom] = useState({ from: props.today, to: props.today });
  const [busy, setBusy] = useState<"copy" | "save" | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  const period = kind === "custom" ? custom : periodFor(kind, props.today);
  const valid = isDate(period.from) && isDate(period.to) && period.to >= period.from;
  const dates = valid ? datesBetween(period.from, period.to) : [];
  const tooLong = dates.length > MAX_PERIOD_DAYS;
  const ready = valid && !tooLong;

  const summary = useQuery({
    queryKey: [...keys.agenda, "period", period.from, period.to],
    queryFn: async () => proposal(await Promise.all(dates.map((date) => backend.agenda.day(date)))),
    enabled: props.open && ready,
    staleTime: 10_000,
  });

  const choose = (value: string) => {
    setDone(null);
    setKind(value === "yesterday" || value === "week" || value === "lastWeek" || value === "custom" ? value : "today");
  };

  async function copyDocument() {
    setBusy("copy");
    setDone(null);
    try {
      const text = await backend.agenda.bookingDocument(period.from, period.to);
      try {
        await navigator.clipboard.writeText(text);
        setDone({ kind: "copied" });
      } catch {
        setDone({ kind: "failed", text: copy.agenda.exportDialog.copyFailed });
      }
    } catch (error) {
      setDone({ kind: "failed", text: errorText(error) });
    } finally {
      setBusy(null);
    }
  }

  async function saveDocument() {
    setBusy("save");
    setDone(null);
    try {
      const { path } = await backend.agenda.saveBookingDocument(period.from, period.to);
      setDone({ kind: "saved", path });
    } catch (error) {
      setDone({ kind: "failed", text: errorText(error) });
    } finally {
      setBusy(null);
    }
  }

  const result = summary.data;
  const firstMissing = result?.missing[0]?.date ?? null;

  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={copy.agenda.exportDialog.title}
      footer={
        <>
          <Button variant="secondary" onClick={() => void saveDocument()} disabled={!ready || busy !== null} data-testid="agenda-export-save">
            <Download />
            {copy.agenda.exportDialog.save}
          </Button>
          <Button variant="primary" onClick={() => void copyDocument()} disabled={!ready || busy !== null} data-testid="agenda-export-copy">
            <Copy />
            {copy.agenda.exportDialog.copy}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4" data-testid="agenda-export">
        <Field label={copy.agenda.exportDialog.period}>
          {(id) => (
            <Select
              id={id}
              label={copy.agenda.exportDialog.period}
              value={kind}
              onValueChange={choose}
              items={(["today", "yesterday", "week", "lastWeek", "custom"] as const).map((value) => ({ value, label: copy.agenda.exportDialog.periods[value] }))}
            />
          )}
        </Field>
        {kind === "custom" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label={copy.agenda.exportDialog.from}>
              {(id) => <Input id={id} type="date" value={custom.from} max={props.today} onChange={(event) => { setDone(null); setCustom({ ...custom, from: event.target.value }); }} />}
            </Field>
            <Field label={copy.agenda.exportDialog.to} error={!valid ? copy.agenda.exportDialog.invalid : tooLong ? copy.agenda.exportDialog.tooLong : null}>
              {(id, describedBy) => <Input id={id} type="date" aria-describedby={describedBy} value={custom.to} max={props.today} onChange={(event) => { setDone(null); setCustom({ ...custom, to: event.target.value }); }} />}
            </Field>
          </div>
        ) : null}

        <div className="border-t border-border" aria-busy={summary.isLoading || undefined}>
          {summary.isError ? (
            <p className="py-3 text-sm text-muted-foreground">
              {copy.agenda.exportDialog.summaryFailed}{" "}
              <button type="button" className="underline underline-offset-2" onClick={() => void summary.refetch()}>
                {copy.agenda.retry}
              </button>
            </p>
          ) : (
            <>
              <Row label={copy.agenda.exportDialog.toBook} value={result ? <span className="font-medium text-foreground">{dutchDuration(result.minutes.book)}</span> : <Skeleton className="h-4 w-12" />} />
              <Row label={copy.agenda.exportDialog.bookings} value={result ? String(result.bookings.length) : <Skeleton className="h-4 w-6" />} />
              <Row
                label={copy.agenda.exportDialog.withoutPost}
                value={result ? dutchDuration(result.minutes.missing) : <Skeleton className="h-4 w-10" />}
                action={
                  firstMissing ? (
                    <Button variant="secondary" size="sm" onClick={() => props.onShowDate(firstMissing)}>
                      {copy.agenda.exportDialog.view}
                    </Button>
                  ) : undefined
                }
              />
              <Row label={copy.agenda.exportDialog.away} value={result ? dutchDuration(result.minutes.away) : <Skeleton className="h-4 w-10" />} />
            </>
          )}
        </div>

        <div role="status" className="min-h-7 text-sm">
          {done?.kind === "copied" ? (
            <span className="inline-flex items-center gap-1.5 text-foreground">
              <Check className="size-4" />
              {copy.agenda.exportDialog.copied}
            </span>
          ) : null}
          {done?.kind === "saved" ? (
            <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1.5 text-foreground">
                <Check className="size-4" />
                {copy.agenda.exportDialog.saved}
              </span>
              <span className="min-w-0 truncate font-mono text-xs text-muted-foreground">{done.path}</span>
              {backend.capabilities.revealPath ? (
                <Button variant="secondary" size="sm" onClick={() => void backend.desktop.revealPath(done.path)}>
                  <FolderOpen />
                  {copy.agenda.exportDialog.reveal}
                </Button>
              ) : null}
            </span>
          ) : null}
          {done?.kind === "failed" ? <span className="text-destructive-foreground">{done.text}</span> : null}
        </div>
      </div>
    </Dialog>
  );
}
