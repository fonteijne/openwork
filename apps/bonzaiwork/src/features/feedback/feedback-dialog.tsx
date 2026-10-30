import { useEffect, useRef, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { useBackend } from "~/backend/context";
import { keys } from "~/backend/queries";
import type { FeedbackReport, Versions } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { Field, Textarea } from "~/components/ui/field";
import { Dialog } from "~/components/ui/overlay";
import { Switch } from "~/components/ui/switch";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { cn } from "~/lib/cn";
import { recentErrors } from "~/lib/recent-errors";
import { useRoute } from "~/lib/router";

import { issueUrl, type FeedbackCategory } from "./issue-url";

// The window is captured before the dialog shows; past this the dialog opens anyway.
const COLLECT_PATIENCE_MS = 1_500;

type Phase = "collecting" | "editing" | "saved";

/** Facts for the GitHub form: short, no logs, nothing personal. */
function environmentText(input: { versions: Versions | undefined; system: string | null; route: string }): string {
  const lines = [
    `- BonzaiWork: ${input.versions?.app ?? __APP_VERSION__}`,
    input.versions?.server ? `- Server: ${input.versions.server}` : null,
    input.versions?.engine ? `- Engine: ${input.versions.engine}` : null,
    `- Systeem: ${input.system ?? navigator.userAgent}`,
    `- Scherm: ${input.route}`,
  ];
  return lines.filter(Boolean).join("\n");
}

function CategoryPicker(props: { value: FeedbackCategory; onChange: (value: FeedbackCategory) => void }) {
  const options: Array<[FeedbackCategory, string]> = [["bug", copy.feedback.bug], ["idea", copy.feedback.idea]];
  return (
    <div role="radiogroup" aria-label={copy.feedback.category} className="grid grid-cols-2 gap-1 rounded-full bg-hover p-1">
      {options.map(([value, label]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={props.value === value}
          onClick={() => props.onChange(value)}
          className={cn(
            "h-7 rounded-full px-3 text-sm text-muted-foreground transition-colors duration-100 hover:text-foreground pointer-coarse:h-9",
            props.value === value && "bg-background font-medium text-foreground shadow-card",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Attachments(props: { report: FeedbackReport | null; collecting: boolean; screenshot: boolean; onScreenshot: (value: boolean) => void }) {
  if (props.collecting) return <p className="text-sm text-muted-foreground">{copy.feedback.collecting}</p>;
  if (!props.report) return <p className="text-sm text-muted-foreground">{copy.feedback.unavailable}</p>;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {props.report.screenshot ? (
          <img
            src={props.report.screenshot}
            alt={copy.feedback.screenshotAlt}
            className={cn("h-16 w-28 shrink-0 rounded-lg object-cover object-top ring-1 ring-border transition-opacity duration-150", !props.screenshot && "opacity-40")}
          />
        ) : (
          <span className="flex h-16 w-28 shrink-0 items-center justify-center rounded-lg bg-hover px-2 text-center text-xs text-muted-foreground">{copy.feedback.noScreenshot}</span>
        )}
        <label className="flex flex-1 items-center justify-between gap-3 text-sm text-foreground">
          {copy.feedback.screenshot}
          <Switch checked={props.screenshot && !!props.report.screenshot} onCheckedChange={props.onScreenshot} label={copy.feedback.screenshot} disabled={!props.report.screenshot} />
        </label>
      </div>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-1 text-sm text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-4 transition-transform duration-150 group-open:rotate-90" />
          {copy.feedback.showLogs}
        </summary>
        <pre className="mt-2 max-h-40 overflow-auto rounded-lg bg-hover p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-all text-muted-foreground">{props.report.logs}</pre>
      </details>
      <p className="text-xs text-muted-foreground">{copy.feedback.attachHint}</p>
    </div>
  );
}

/**
 * Feedback for issue #9 (docs/bonzaiwork/feedback.md): the person picks a
 * category and writes a few words; we open the prefilled GitHub form and, for
 * a bug, save a screenshot and redacted logs to drag into it.
 */
export function FeedbackDialog(props: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const backend = useBackend();
  const route = useRoute();
  const versions = useQuery({ queryKey: keys.versions, queryFn: () => backend.settings.versions(), staleTime: 5 * 60_000, enabled: props.open });
  const [phase, setPhase] = useState<Phase>("collecting");
  const [category, setCategory] = useState<FeedbackCategory>("bug");
  const [message, setMessage] = useState("");
  const [report, setReport] = useState<FeedbackReport | null>(null);
  const [collected, setCollected] = useState(false);
  const [screenshot, setScreenshot] = useState(true);
  const [folder, setFolder] = useState<string | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const routeName = route.name;

  useEffect(() => {
    if (!props.open) return;
    let current = true;
    setPhase("collecting");
    setCategory("bug");
    setMessage("");
    setReport(null);
    setCollected(false);
    setScreenshot(true);
    setFolder(null);
    setSaveFailed(false);
    const notes = [`BonzaiWork ${__APP_VERSION__}, scherm: ${routeName}`, ...(recentErrors().length ? ["Laatste fouten in de app:", ...recentErrors()] : [])].join("\n");
    const patience = window.setTimeout(() => current && setPhase((value) => (value === "collecting" ? "editing" : value)), COLLECT_PATIENCE_MS);
    void backend.feedback
      .collect(notes)
      .catch(() => null)
      .then((value) => {
        if (!current) return;
        setReport(value);
        setCollected(true);
        setPhase((phaseNow) => (phaseNow === "collecting" ? "editing" : phaseNow));
      });
    return () => {
      current = false;
      window.clearTimeout(patience);
    };
    // Once per opening, on the screen the person was looking at (routeName is read, not watched).
  }, [props.open, backend]);

  const openGithub = async () => {
    const url = issueUrl({ category, message, environment: environmentText({ versions: versions.data, system: report?.system ?? null, route: routeName }) });
    await backend.desktop.openUrl(url);
  };

  const submit = async () => {
    if (!message.trim() || busy) return;
    setBusy(true);
    try {
      if (category === "bug" && report && !saveFailed) {
        try {
          const saved = await backend.feedback.save(report.id, { screenshot });
          setFolder(saved);
          await backend.desktop.revealPath(saved);
        } catch {
          setSaveFailed(true);
          return;
        }
        await openGithub();
        setPhase("saved");
        return;
      }
      await openGithub();
      toast(copy.feedback.opened);
      props.onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const folderName = folder?.split(/[\\/]/).filter(Boolean).at(-1) ?? "";
  const visible = props.open && phase !== "collecting";

  const saved = phase === "saved";
  // One dialog for both steps, so the popup stays put while its content changes.
  return (
    <Dialog
      open={visible}
      onOpenChange={props.onOpenChange}
      title={saved ? copy.feedback.savedTitle : copy.feedback.title}
      initialFocus={saved ? undefined : textarea}
      footer={
        saved ? (
          <>
            {backend.capabilities.revealPath && folder ? (
              <Button variant="secondary" onClick={() => void backend.desktop.revealPath(folder)}>
                {copy.feedback.openFolder}
              </Button>
            ) : null}
            <Button variant="primary" onClick={() => props.onOpenChange(false)}>
              {copy.feedback.done}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => props.onOpenChange(false)}>
              {copy.common.cancel}
            </Button>
            <Button variant="primary" onClick={() => void submit()} disabled={!message.trim() || busy}>
              {saveFailed ? copy.feedback.submitAnyway : copy.feedback.submit}
            </Button>
          </>
        )
      }
    >
      {saved ? (
        <p className="text-sm text-foreground">{copy.feedback.savedBody(folderName)}</p>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <CategoryPicker value={category} onChange={setCategory} />
          <Field label={category === "bug" ? copy.feedback.bugLabel : copy.feedback.ideaLabel} hint={category === "idea" ? copy.feedback.githubHint : undefined}>
            {(id, describedBy) => (
              <Textarea
                ref={textarea}
                id={id}
                aria-describedby={describedBy}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder={category === "bug" ? copy.feedback.bugPlaceholder : copy.feedback.ideaPlaceholder}
                rows={4}
              />
            )}
          </Field>
          {category === "bug" ? (
            <section className="flex flex-col gap-2" aria-label={copy.feedback.attachTitle}>
              <h3 className="text-sm font-medium text-foreground">{copy.feedback.attachTitle}</h3>
              <Attachments report={report} collecting={!collected} screenshot={screenshot} onScreenshot={setScreenshot} />
              {saveFailed ? (
                <p className="text-xs text-destructive-foreground" role="alert">
                  {copy.feedback.saveFailed}
                </p>
              ) : null}
            </section>
          ) : null}
        </form>
      )}
    </Dialog>
  );
}
