import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useBackend } from "~/backend/context";
import { keys, useToday, useTodaySettings } from "~/backend/queries";
import type { ConnectorStatus, TodaySettings } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { StatusChip } from "~/components/ui/chip";
import { Locked, Row, Section, Skeleton } from "~/components/ui/misc";
import { Switch } from "~/components/ui/switch";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { errorText } from "~/lib/errors";
import { formatWhen } from "~/lib/format";
import { href } from "~/lib/router";

import { InlineTextRow } from "../settings/shared";

/**
 * "Persoonlijke agent" in the app settings (docs/bonzaiwork/persoonlijke-agent-plan.md T10): the
 * one switch that turns the feature on or off without a release, the three sources with their
 * state, how the two local connections start, the model of the rounds and the rounds themselves.
 * Without the routes on the server the switch stays visible with a lock (P4).
 */
type Source = "calendar" | "mail" | "slack";
const SOURCES: readonly Source[] = ["calendar", "mail", "slack"];

function SourceState(props: { status: ConnectorStatus | undefined }) {
  const state = props.status?.state ?? "off";
  if (state === "off") return null;
  const label = copy.today.settings.states[state];
  // Blocked or not set up is neutral ink; only a real failure is red (C5).
  return (
    <span className={state === "error" ? "text-destructive-foreground" : undefined} title={props.status?.detail ?? undefined}>
      {state === "ok" && props.status?.detail ? `${label} · ${props.status.detail}` : label}
    </span>
  );
}

export function AgentAppSection() {
  const backend = useBackend();
  const client = useQueryClient();
  const settings = useTodaySettings();
  const today = useToday();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const available = backend.capabilities.today;
  const current = settings.data?.settings;
  const killed = settings.data?.killed ?? false;
  const view = today.data;

  const refresh = () => Promise.all([client.invalidateQueries({ queryKey: keys.today }), client.invalidateQueries({ queryKey: keys.allRoutines })]);
  const change = async (patch: Partial<TodaySettings>) => {
    setBusy(true);
    setFailure(null);
    try {
      client.setQueryData(keys.todaySettings, await backend.today.setSettings(patch));
      await refresh();
    } catch (error) {
      setFailure(errorText(error));
      throw error;
    } finally {
      setBusy(false);
    }
  };
  const flip = (patch: Partial<TodaySettings>) => void change(patch).catch(() => undefined);
  const test = async () => {
    setBusy(true);
    try {
      await backend.today.checkConnectors();
      toast(copy.today.settings.tested);
      await refresh();
    } catch (error) {
      toast(errorText(error), { tone: "error" });
    } finally {
      setBusy(false);
    }
  };
  const run = async (system: string) => {
    try {
      await backend.today.runRound(system);
      toast(copy.today.settings.ran);
      await refresh();
    } catch (error) {
      toast(errorText(error), { tone: "error" });
    }
  };

  const on = Boolean(current?.enabled) && !killed;
  const anySource = Boolean(current && (current.calendar || current.mail || current.slack));

  return (
    <>
      <Section title={copy.today.settings.group}>
        <Row
          label={copy.today.settings.enable}
          hint={failure ? <span role="alert" className="text-destructive-foreground">{failure}</span> : view?.blocked ? <a className="underline underline-offset-2" href={href({ name: "brain" })}>{copy.today.settings.needsBrain}</a> : undefined}
          action={
            !available ? (
              <Locked>{copy.today.settings.unavailable}</Locked>
            ) : killed ? (
              <Locked>{copy.today.settings.killed}</Locked>
            ) : !current ? (
              <Skeleton className="h-5 w-8" />
            ) : (
              <Switch checked={current.enabled} onCheckedChange={(enabled) => flip({ enabled })} label={copy.today.settings.enable} disabled={busy} />
            )
          }
        />
        {on && current ? (
          <>
            <InlineTextRow label={copy.today.settings.model} value={current.model} required={copy.today.settings.modelRequired} onSave={(model) => change({ model })} testId="agent-model" />
            <InlineTextRow
              label={copy.today.settings.handle}
              value={current.handle ?? ""}
              empty={view?.handles.length ? copy.today.settings.handleFound(view.handles.map((handle) => `@${handle}`).join(", ")) : copy.today.settings.handleEmpty}
              onSave={(handle) => change({ handle: handle || null })}
            />
          </>
        ) : null}
      </Section>

      {on && current ? (
        <>
          <Section
            title={copy.today.settings.sources}
            action={
              anySource ? (
                <Button variant="secondary" size="sm" disabled={busy} onClick={() => void test()} data-testid="agent-test">
                  {copy.today.settings.test}
                </Button>
              ) : undefined
            }
          >
            {SOURCES.map((source) => (
              <Row
                key={source}
                label={copy.today.settings[source]}
                value={<SourceState status={view?.connectors[source]} />}
                action={<Switch checked={current[source]} onCheckedChange={(checked) => flip({ [source]: checked })} label={copy.today.settings[source]} disabled={busy} />}
              />
            ))}
            {current.calendar || current.mail ? (
              <InlineTextRow label={copy.today.settings.ms365Command} value={current.ms365Command} empty={copy.today.settings.commandEmpty} onSave={(ms365Command) => change({ ms365Command })} />
            ) : null}
            {current.slack ? (
              <InlineTextRow label={copy.today.settings.slackCommand} value={current.slackCommand} empty={copy.today.settings.commandEmpty} placeholder={copy.today.settings.slackPlaceholder} onSave={(slackCommand) => change({ slackCommand })} />
            ) : null}
            <p className="pt-2 text-xs text-muted-foreground">{copy.today.settings.sendRule}</p>
          </Section>

          <Section title={copy.today.settings.rounds} action={<a className="text-xs text-muted-foreground underline underline-offset-2" href={href({ name: "routines", routineId: null })}>{copy.today.settings.openRoutines}</a>}>
            {(view?.rounds ?? []).map((round) => (
              <Row
                key={round.system}
                label={round.name}
                value={round.state === "needs_attention" ? <StatusChip status="waiting" label={copy.palette.state.attention} /> : round.nextRunAt ? copy.today.settings.next(formatWhen(round.nextRunAt)) : copy.today.settings.paused}
                action={
                  <Button variant="secondary" size="sm" onClick={() => void run(round.system)}>
                    {copy.today.settings.runNow}
                  </Button>
                }
              />
            ))}
          </Section>
        </>
      ) : null}
    </>
  );
}
