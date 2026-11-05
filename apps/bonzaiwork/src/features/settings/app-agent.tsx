import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { Check, Lock, TriangleAlert, X } from "lucide-react";

import { useBackend } from "~/backend/context";
import { useAgentSettings, useCockpitMutation } from "~/backend/cockpit-queries";
import type { AgentSettings, RiskClass, RiskRule, Werkwijze } from "~/backend/cockpit";
import { keys, useProjects } from "~/backend/queries";
import { DataTable, Eyebrow, LinkArrow, Panel, PermissionLine, PermissionList, SectionTitle } from "~/components/io";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/misc";
import { Dialog } from "~/components/ui/overlay";
import { toast } from "~/components/ui/toast";
import { settingsCopy } from "~/copy/settings";
import { cn } from "~/lib/cn";
import { errorText } from "~/lib/errors";
import { formatMoney, formatTime, formatWhen } from "~/lib/format";
import { href } from "~/lib/router";

const t = settingsCopy.agent;

type Choice = "allow" | "ask" | "deny";
const CHOICES: readonly Choice[] = ["allow", "ask", "deny"];

/** The self-check line under the hero of Agent en rechten. */
export function SelfCheckLine() {
  const agent = useAgentSettings();
  const check = agent.data?.selfCheck;
  if (!check) return agent.isLoading ? <Skeleton className="h-5 w-96 max-w-full" /> : null;
  return (
    <p className="m-0 flex items-start gap-2 text-base text-ink">
      <span aria-hidden="true" className={cn("mt-1 flex [&_svg]:size-4", check.ok ? "text-success" : "text-ink")}>
        {check.ok ? <Check /> : <TriangleAlert />}
      </span>
      <span>{check.ok ? t.selfCheck(formatTime(check.at), check.text) : t.selfCheckFailed(formatTime(check.at), check.text)}</span>
    </p>
  );
}

/**
 * Agent en rechten (design v2-Settings): what each werkwijze may do, the safe default, the caps per
 * run, the permission inspector (R0–R5, editable where the class allows it), recent denials and the
 * merged rules. A refused change keeps the control visible and says why in a toast (P4).
 */
export function AgentGroup() {
  const agent = useAgentSettings();
  if (agent.isError)
    return (
      <Panel className="flex flex-wrap items-center justify-between gap-4">
        <p className="m-0 text-base text-ink">{t.error}</p>
        <Button variant="secondary" size="lg" onClick={() => void agent.refetch()}>
          {t.retry}
        </Button>
      </Panel>
    );
  const data = agent.data;
  if (!data)
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-8 w-80" />
        <div className="grid gap-6 md:grid-cols-2">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-52 rounded-[24px]" />
          ))}
        </div>
      </div>
    );
  return (
    <div className="flex flex-col gap-14">
      <MaySection data={data} />
      <Inspector rules={data.rules} />
      <Denials data={data} />
      <RulesCard contradictions={data.contradictions} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// What each werkwijze may do
// ---------------------------------------------------------------------------

function WerkwijzeCard(props: { werkwijze: Werkwijze }) {
  return (
    <Panel as="article" className="flex flex-col gap-4">
      <Eyebrow>{props.werkwijze.label}</Eyebrow>
      <h3 className="m-0 text-xl font-semibold text-ink">{props.werkwijze.name}</h3>
      <PermissionList>
        {props.werkwijze.grants.map((grant) => (
          <PermissionLine key={grant.text} kind={grant.kind}>
            {grant.text}
          </PermissionLine>
        ))}
      </PermissionList>
    </Panel>
  );
}

function MaySection(props: { data: AgentSettings }) {
  const { data } = props;
  const [caps, setCaps] = useState(false);
  return (
    <section aria-labelledby="settings-may" className="flex flex-col gap-6">
      <SectionTitle id="settings-may" title={t.may} lead={t.mayLead} className="mb-0" />
      <div className="grid gap-6 md:grid-cols-2">
        {data.werkwijzen.map((werkwijze) => (
          <WerkwijzeCard key={werkwijze.id} werkwijze={werkwijze} />
        ))}
        <div className="flex flex-wrap gap-6 rounded-[24px] border border-dashed border-line-strong p-6 md:col-span-2 lg:p-8">
          <div className="flex flex-[1_1_240px] flex-col gap-2">
            <Eyebrow>{t.safeEyebrow}</Eyebrow>
            <h3 className="m-0 text-xl font-semibold text-ink">{t.safeTitle}</h3>
          </div>
          <PermissionList className="flex-[2_1_360px]">
            {data.safeDefault.map((grant) => (
              <PermissionLine key={grant.text} kind={grant.kind}>
                {grant.text}
              </PermissionLine>
            ))}
          </PermissionList>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-base text-ink">
        <span>{t.caps(formatMoney(data.caps.money, data.caps.currency), data.caps.toolCalls, data.caps.minutes)}</span>
        <LinkArrow onClick={() => setCaps(true)}>{t.capsEdit}</LinkArrow>
        <span className="text-ink-muted">{t.capsNote}</span>
      </div>
      <Dialog
        open={caps}
        onOpenChange={setCaps}
        title={t.capsDialog}
        footer={
          <Button variant="primary" onClick={() => setCaps(false)}>
            {t.close}
          </Button>
        }
      >
        <dl className="m-0 flex flex-col">
          {[
            [t.capsMoney, formatMoney(data.caps.money, data.caps.currency)],
            [t.capsCalls, String(data.caps.toolCalls)],
            [t.capsMinutes, t.capsMinutesValue(data.caps.minutes)],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 border-b border-line py-3 text-base">
              <dt className="text-ink-muted">{label}</dt>
              <dd className="m-0 font-semibold text-ink">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mb-0 mt-4 flex items-start gap-2 text-sm text-ink-muted">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t.capsWhy}
        </p>
      </Dialog>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Permission inspector
// ---------------------------------------------------------------------------

function Inspector(props: { rules: RiskRule[] }) {
  const change = useCockpitMutation((cockpit, input: { risk: RiskClass; effect: Choice }) => cockpit.settings.setRisk(input.risk, input.effect));
  const set = (rule: RiskRule, effect: Choice) => {
    const previous = rule.effect;
    change.mutate(
      { risk: rule.risk, effect },
      {
        onError: (failure) => toast(errorText(failure), { tone: "error" }),
        onSuccess: () =>
          toast(t.changed(rule.risk, t.effects[effect]), {
            action:
              previous === "allow" || previous === "ask" || previous === "deny"
                ? { label: t.undo, onClick: () => change.mutate({ risk: rule.risk, effect: previous }, { onError: (failure) => toast(errorText(failure), { tone: "error" }) }) }
                : undefined,
          }),
      },
    );
  };
  return (
    <section aria-labelledby="settings-inspector" className="flex flex-col gap-6">
      <SectionTitle id="settings-inspector" title={t.inspector} lead={t.inspectorLead} className="mb-0" />
      <Panel className="py-2 lg:py-2">
        <DataTable label={t.inspectorLabel} className="hidden pt-4 md:block" head={[t.head.action, t.head.className, t.head.effect]}>
          {props.rules.map((rule) => {
            const pending = change.isPending && change.variables?.risk === rule.risk ? change.variables.effect : null;
            return (
              <tr key={rule.risk}>
                <td className="max-w-[28rem] text-base text-ink">{rule.action}</td>
                <td className={cn("whitespace-nowrap text-base text-ink", rule.risk === "R4" && "font-semibold")}>{rule.className}</td>
                <td>
                  <Effect rule={rule} pending={pending} onChange={(effect) => set(rule, effect)} />
                </td>
              </tr>
            );
          })}
        </DataTable>
        <ul aria-label={t.inspectorLabel} className="m-0 list-none p-0 md:hidden">
          {props.rules.map((rule) => {
            const pending = change.isPending && change.variables?.risk === rule.risk ? change.variables.effect : null;
            return (
              <li key={rule.risk} className="flex flex-col gap-3 border-b border-line py-5 last:border-b-0">
                <span className={cn("text-[13px] uppercase leading-4 tracking-[0.08em] text-ink-muted", rule.risk === "R4" ? "font-bold" : "font-semibold")}>{rule.className}</span>
                <span className="text-base text-ink">{rule.action}</span>
                <Effect rule={rule} pending={pending} onChange={(effect) => set(rule, effect)} />
              </li>
            );
          })}
        </ul>
      </Panel>
    </section>
  );
}

function Effect(props: { rule: RiskRule; pending: Choice | null; onChange: (effect: Choice) => void }) {
  const { rule } = props;
  if (rule.effect === "locked")
    return (
      <span className="flex flex-col gap-1">
        <span className="inline-flex items-center gap-1.5 text-base font-semibold text-ink">
          <Lock className="size-4" aria-hidden="true" />
          {t.effects.locked}
        </span>
        {rule.note ? <span className="text-sm text-ink-muted">{rule.note}</span> : null}
      </span>
    );
  if (rule.choices.length === 0)
    return (
      <span className="inline-flex items-center gap-1.5 text-base text-ink">
        <span aria-hidden="true" className={cn("flex [&_svg]:size-4", rule.effect === "deny" ? "text-danger" : "text-success")}>
          {rule.effect === "deny" ? <X /> : <Check />}
        </span>
        {t.effects[rule.effect]}
      </span>
    );
  const current = props.pending ?? rule.effect;
  const noteId = `effect-note-${rule.risk}`;
  return (
    <span className="flex flex-col items-start gap-2">
      <RadioGroup
        value={current}
        onValueChange={(value) => {
          const choice = CHOICES.find((entry) => entry === value);
          if (choice && choice !== rule.effect) props.onChange(choice);
        }}
        aria-label={t.effectLabel(rule.risk)}
        aria-describedby={rule.note ? noteId : undefined}
        className="inline-flex gap-1 rounded-full bg-surface-alt p-1"
      >
        {CHOICES.map((choice) => (
          <Radio.Root
            key={choice}
            value={choice}
            disabled={!rule.choices.includes(choice)}
            className="flex h-9 select-none items-center whitespace-nowrap rounded-full px-4 text-base text-ink outline-none transition-colors duration-200 hover:bg-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-[checked]:bg-surface-inverse data-[checked]:font-semibold data-[checked]:text-ink-inverse data-[disabled]:pointer-events-none data-[disabled]:opacity-40 pointer-coarse:h-11"
          >
            {t.effects[choice]}
          </Radio.Root>
        ))}
      </RadioGroup>
      {rule.note ? (
        <span id={noteId} className="max-w-[22rem] text-sm text-ink-muted">
          {rule.note}
        </span>
      ) : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Recently denied
// ---------------------------------------------------------------------------

function Denials(props: { data: AgentSettings }) {
  const [classifying, setClassifying] = useState<string | null>(null);
  const denial = props.data.denials.find((entry) => entry.id === classifying) ?? null;
  return (
    <section aria-labelledby="settings-denied" className="flex flex-col">
      <SectionTitle id="settings-denied" title={t.denied} count={props.data.denials.length} className="mb-5" />
      {props.data.denials.length === 0 ? (
        <p className="m-0 border-t border-line-strong pt-5 text-base text-ink-muted">{t.deniedEmpty}</p>
      ) : (
        <ul className="m-0 list-none border-t border-line-strong p-0">
          {props.data.denials.map((entry) => (
            <li key={entry.id} className="flex min-h-[72px] flex-wrap items-center gap-4 border-b border-line-strong py-3">
              <span className="flex min-w-0 flex-[1_1_360px] flex-col">
                <span className="inline-flex items-start gap-2 text-lg font-semibold text-ink">
                  <X className="mt-1.5 size-4 shrink-0 text-danger" aria-hidden="true" />
                  {entry.title}
                </span>
                <span className="text-sm text-ink-muted">{[entry.runId, formatWhen(entry.at), entry.detail].join(" · ")}</span>
              </span>
              {entry.reason === "unclassified" ? (
                <Button variant="secondary" size="lg" onClick={() => setClassifying(entry.id)}>
                  {t.classify}
                </Button>
              ) : (
                <LinkArrow href={href({ name: "run", runId: entry.runId })} aria-label={t.whyLabel(entry.title)}>
                  {t.why}
                </LinkArrow>
              )}
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={denial !== null}
        onOpenChange={(open) => !open && setClassifying(null)}
        title={t.classifyTitle}
        footer={
          <Button variant="primary" onClick={() => setClassifying(null)}>
            {t.close}
          </Button>
        }
      >
        {denial ? (
          <div className="flex flex-col gap-4">
            <p className="m-0 text-base font-semibold text-ink">{denial.title}</p>
            <p className="m-0 text-base text-ink-muted">{t.classifyBody}</p>
            <LinkArrow href={href({ name: "run", runId: denial.runId })} onClick={() => setClassifying(null)}>
              {t.openRun}
            </LinkArrow>
          </div>
        ) : null}
      </Dialog>
    </section>
  );
}

// ---------------------------------------------------------------------------
// The rules in force: the instructions of every project, with their source
// ---------------------------------------------------------------------------

function RulesCard(props: { contradictions: number }) {
  const [open, setOpen] = useState(false);
  return (
    <Panel as="section" label={t.rules} className="flex flex-wrap items-center gap-6">
      <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-2">
        <h2 className="m-0 text-xl font-semibold text-ink">{t.rules}</h2>
        <p className="m-0 text-base text-ink-muted">{t.rulesLead}</p>
        {props.contradictions > 0 ? (
          <p className="m-0 inline-flex items-center gap-2 text-base font-semibold text-ink">
            <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
            {t.contradictions(props.contradictions)}
          </p>
        ) : null}
      </div>
      <Button variant="secondary" size="lg" onClick={() => setOpen(true)}>
        {t.rulesOpen}
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        size="lg"
        title={t.rulesDialog}
        footer={
          <Button variant="primary" onClick={() => setOpen(false)}>
            {t.close}
          </Button>
        }
      >
        {open ? <MergedRules /> : null}
      </Dialog>
    </Panel>
  );
}

function MergedRules() {
  const backend = useBackend();
  const projects = useProjects();
  const active = (projects.data ?? []).filter((project) => !project.archivedAt);
  const results = useQueries({ queries: active.map((project) => ({ queryKey: keys.instructions(project.id), queryFn: () => backend.config.instructions(project.id) })) });
  if (projects.isLoading || results.some((result) => result.isLoading)) return <Skeleton className="h-24 w-full" />;
  const withRules = active.flatMap((project, index) => {
    const text = results[index]?.data?.trim();
    return text ? [{ project, lines: text.split("\n").map((line) => line.trim()).filter(Boolean) }] : [];
  });
  if (withRules.length === 0) return <p className="m-0 text-base text-ink-muted">{t.rulesEmpty}</p>;
  return (
    <div className="flex flex-col">
      {withRules.map(({ project, lines }) => (
        <section key={project.id} className="flex flex-col gap-2 border-b border-line py-4 last:border-b-0">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <Eyebrow>{t.rulesSource(project.name)}</Eyebrow>
            <a href={href({ name: "project-settings", projectId: project.id, group: "agent" })} aria-label={t.rulesEditLabel(project.name)} className="text-sm font-semibold text-accent">
              {t.rulesEdit}
            </a>
          </div>
          <ul className="m-0 flex list-none flex-col gap-1 p-0">
            {lines.map((line, index) => (
              <li key={index} className="text-base text-ink">
                {line}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
