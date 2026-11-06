import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, Lock, TriangleAlert } from "lucide-react";

import { useBackend } from "~/backend/context";
import { useAgentSettings, useBriefs } from "~/backend/cockpit-queries";
import { keys, usePersonalBrain, useProjects, useStatus, useUsage } from "~/backend/queries";
import type { Project, ProjectBrief, Usage } from "~/backend/types";
import { Column, Columns, DataTable, Eyebrow, LinkArrow, LockedNote, Panel, PermissionLine, PermissionList, SectionTitle, StatusBadge } from "~/components/io";
import { Button } from "~/components/ui/button";
import { Locked, Skeleton } from "~/components/ui/misc";
import { ConfirmDialog } from "~/components/ui/overlay";
import { Select } from "~/components/ui/select";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { settingsCopy } from "~/copy/settings";
import { cn } from "~/lib/cn";
import { formatTime } from "~/lib/format";
import { href } from "~/lib/router";

import { ConnectionsSection } from "./connections";
import { attempt, KeyForm } from "./shared";

const t = settingsCopy;
const LOW_BUDGET = 20;

const shortDate = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short" });

/** Budget left on a key, 0–100: from the spend of this month when the backend reads it, else the brief. */
export function budgetLeft(usage: Usage | null | undefined, brief: ProjectBrief | undefined): { percent: number; reset: string | null } | null {
  if (usage && usage.maxBudget !== null && usage.maxBudget > 0) {
    const percent = Math.max(0, Math.min(100, Math.round((1 - usage.spend / usage.maxBudget) * 100)));
    return { percent, reset: usage.budgetResetAt !== null ? shortDate.format(usage.budgetResetAt).replace(".", "") : null };
  }
  if (brief?.keyLeft !== null && brief?.keyLeft !== undefined) return { percent: brief.keyLeft, reset: null };
  return null;
}

/**
 * Verbindingen (design v2-ModelKeys): the model service, the keys per project with their budget and
 * status, the key of your agent chats, tools on this computer, how keys work, and the connections
 * of each project. The vendor is never named (C3).
 */
export function VerbindingenGroup() {
  return (
    <div className="flex flex-col gap-14">
      <ServicePanel />
      <ProjectKeys />
      <div className="grid gap-6 md:grid-cols-2">
        <PersonalKeyCard />
        <ToolsCard />
      </div>
      <HowKeys />
      <ServicesSection />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The model service
// ---------------------------------------------------------------------------

function ServicePanel() {
  const status = useStatus();
  const agent = useAgentSettings();
  const data = status.data;
  const selfCheck = agent.data?.selfCheck;
  return (
    <Panel as="section" label={t.service.eyebrow} className="flex flex-wrap items-center gap-6">
      <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-2">
        <Eyebrow>{t.service.eyebrow}</Eyebrow>
        <h2 className="m-0 text-xl font-semibold text-ink">{t.service.name}</h2>
        {data ? (
          <p className="m-0 min-w-0 text-base text-ink">
            <span className="break-all font-mono text-sm">{data.litellmBaseUrl}</span>
            <span className="text-ink-muted"> · {t.service.models(data.models.length)}</span>
          </p>
        ) : (
          <Skeleton className="h-5 w-72" />
        )}
        <p className="m-0 text-base text-ink-muted">
          {t.service.centrally} {selfCheck ? (selfCheck.ok ? t.service.safety(formatTime(selfCheck.at)) : t.service.safetyFailed) : null}
        </p>
      </div>
      {data ? data.models.length > 0 ? <StatusBadge kind="connected">{t.service.connected}</StatusBadge> : <StatusBadge kind="unknown">{t.service.unchecked}</StatusBadge> : null}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Project keys
// ---------------------------------------------------------------------------

function ProjectKeys() {
  const backend = useBackend();
  const status = useStatus();
  const projects = useProjects();
  const briefs = useBriefs();
  const personal = usePersonalBrain();
  const userMode = status.data?.keyMode === "user";
  const active = (projects.data ?? []).filter((project) => !project.archivedAt && project.id !== personal?.projectId);
  const withKey = active.filter((project) => project.key.hasKey).length;

  return (
    <section aria-labelledby="settings-project-keys" className="flex flex-col">
      <SectionTitle
        id="settings-project-keys"
        title={t.projectKeys.title}
        count={!userMode && projects.data ? t.projectKeys.count(withKey, active.length - withKey) : undefined}
        action={!userMode ? <span className="text-sm text-ink-muted">{t.projectKeys.note}</span> : undefined}
        className="mb-5"
      />
      {userMode ? (
        <Panel>
          <p className="m-0 text-base text-ink-muted">{t.projectKeys.userMode}</p>
        </Panel>
      ) : projects.isLoading ? (
        <Panel className="flex flex-col gap-4">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </Panel>
      ) : active.length === 0 ? (
        <Panel>
          <p className="m-0 text-base text-ink-muted">{t.projectKeys.empty}</p>
        </Panel>
      ) : (
        <Panel className="py-2 lg:py-2">
          <DataTable
            label={t.projectKeys.label}
            className="hidden pt-4 md:block"
            head={[t.projectKeys.head.project, t.projectKeys.head.key, t.projectKeys.head.budget, t.projectKeys.head.status, <span key="a" className="sr-only">{t.projectKeys.head.actions}</span>]}
          >
            {active.map((project) => (
              <KeyRow key={project.id} project={project} brief={briefs.data?.find((entry) => entry.projectId === project.id)} readOnly={status.data?.readOnly ?? false} layout="table" />
            ))}
          </DataTable>
          <ul aria-label={t.projectKeys.label} className="m-0 list-none p-0 md:hidden">
            {active.map((project) => (
              <KeyRow key={project.id} project={project} brief={briefs.data?.find((entry) => entry.projectId === project.id)} readOnly={status.data?.readOnly ?? false} layout="card" />
            ))}
          </ul>
          {!backend.capabilities.usage ? <p className="m-0 pb-4 text-sm text-ink-muted">{t.projectKeys.usageLocked}</p> : null}
        </Panel>
      )}
      {status.data?.keyStorePersistent === false ? <Locked className="pt-3">{copy.onboarding.notPersistent}</Locked> : null}
    </section>
  );
}

function KeyRow(props: { project: Project; brief: ProjectBrief | undefined; readOnly: boolean; layout: "table" | "card" }) {
  const backend = useBackend();
  const client = useQueryClient();
  const usage = useUsage(props.project.id);
  const [adding, setAdding] = useState(false);
  const { project, brief } = props;
  const left = project.key.hasKey ? budgetLeft(usage.data, brief) : null;
  const low = left !== null && left.percent < LOW_BUDGET;
  const area = brief ? (brief.area.client ? t.projectKeys.client(brief.area.client) : brief.area.name) : null;
  const meta = [area, brief?.state === "on_hold" ? t.projectKeys.onHold : null].filter(Boolean).join(" · ");

  const name = (
    <>
      <a href={href({ name: "project-overview", projectId: project.id })} className="text-base font-semibold text-ink no-underline hover:underline">
        {project.name}
      </a>
      {meta ? <span className="block text-sm font-normal text-ink-muted">{meta}</span> : null}
    </>
  );
  const keyCell = project.key.hasKey ? (
    <>
      {brief?.keyAlias ? <span className="block">{brief.keyAlias}</span> : null}
      <span className="block">{project.key.keyHint}</span>
    </>
  ) : (
    <span className="font-sans text-base text-ink-muted">{t.projectKeys.noKey}</span>
  );
  const budget = !project.key.hasKey ? (
    <span className="text-ink-muted">–</span>
  ) : usage.isLoading ? (
    <Skeleton className="h-4 w-28" />
  ) : left ? (
    t.projectKeys.budget(left.percent, left.reset)
  ) : (
    <span className="text-ink-muted">{t.projectKeys.noLimit}</span>
  );
  const state = !project.key.hasKey ? (
    <StatusLine icon={<TriangleAlert />} strong>
      {t.projectKeys.statusBlocked}
    </StatusLine>
  ) : low ? (
    <StatusLine icon={<TriangleAlert />} strong>
      {t.projectKeys.statusLow}
    </StatusLine>
  ) : (
    <StatusLine icon={<Check className="text-success" />}>{t.projectKeys.statusOk}</StatusLine>
  );
  const action = project.key.hasKey ? (
    <LinkArrow href={href({ name: "project-settings", projectId: project.id, group: "toegang" })} aria-label={t.projectKeys.manageLabel(project.name)}>
      {t.projectKeys.manage}
    </LinkArrow>
  ) : (
    <Button variant="secondary" size="lg" disabled={props.readOnly} aria-expanded={adding} aria-label={t.projectKeys.addLabel(project.name)} onClick={() => setAdding((open) => !open)}>
      {t.projectKeys.add}
    </Button>
  );
  const form =
    adding && !project.key.hasKey ? (
      <div className="max-w-md">
        <KeyForm
          autoFocus
          label={t.projectKeys.keyFor(project.name)}
          onCancel={() => setAdding(false)}
          onLink={async (key) => {
            client.setQueryData(keys.status, await backend.keys.linkProject(project.id, key));
            await Promise.all([client.invalidateQueries({ queryKey: keys.projects }), client.invalidateQueries({ queryKey: keys.usage(project.id) })]);
            setAdding(false);
            toast(copy.keys.linkedToast);
          }}
        />
      </div>
    ) : null;

  if (props.layout === "card")
    return (
      <li className="flex flex-col gap-3 border-b border-line py-5 last:border-b-0">
        <div>{name}</div>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-mono text-sm text-ink [&>span]:inline [&>span+span]:ms-2">{keyCell}</span>
          <span className={cn("text-base", low ? "font-semibold text-ink" : "text-ink")}>{budget}</span>
        </div>
        {state}
        <div>{action}</div>
        {form}
      </li>
    );

  return (
    <>
      <tr>
        <th scope="row" className="py-5 pe-6 text-start align-top font-semibold text-ink">
          {name}
        </th>
        <td className="font-mono text-sm text-ink">{keyCell}</td>
        <td className={cn("text-base", low ? "font-semibold text-ink" : "text-ink")}>{budget}</td>
        <td>{state}</td>
        <td className="text-end">{action}</td>
      </tr>
      {form ? (
        <tr>
          <td colSpan={5} className="pt-0!">
            {form}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function StatusLine(props: { icon: ReactNode; children: ReactNode; strong?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-base text-ink [&_svg]:size-4 [&_svg]:shrink-0", props.strong && "font-semibold")}>
      <span aria-hidden="true" className="flex">
        {props.icon}
      </span>
      {props.children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// The key of your agent chats
// ---------------------------------------------------------------------------

function CardHead(props: { eyebrow: string; badge?: ReactNode; title: string; id: string }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Eyebrow className="flex-1">{props.eyebrow}</Eyebrow>
        {props.badge}
      </div>
      <h2 id={props.id} className="m-0 text-xl font-semibold text-ink">
        {props.title}
      </h2>
    </>
  );
}

function OkBadge(props: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold leading-4 text-success">
      <Check className="size-4" aria-hidden="true" />
      {props.children}
    </span>
  );
}

function PersonalKeyCard() {
  const status = useStatus();
  const projects = useProjects();
  const personal = usePersonalBrain();
  const data = status.data;
  const project = personal ? projects.data?.find((entry) => entry.id === personal.projectId) : undefined;
  return (
    <Panel as="section" label={t.personal.title} className="flex flex-col gap-4">
      {!data ? (
        <Skeleton className="h-32 w-full" />
      ) : data.keyMode === "user" ? (
        <UserKey />
      ) : project ? (
        <ProjectAsPersonalKey project={project} readOnly={data.readOnly} />
      ) : (
        <>
          <CardHead id="settings-personal-key" eyebrow={t.personal.eyebrow} title={t.personal.title} />
          <p className="m-0 text-base text-ink-muted">{t.personal.noBrain}</p>
          <LinkArrow href={href({ name: "settings", group: "geheugen" })}>{t.personal.toMemory}</LinkArrow>
        </>
      )}
    </Panel>
  );
}

function PersonalLines() {
  return (
    <PermissionList>
      <PermissionLine kind="allow">{t.personal.usedFor}</PermissionLine>
      <PermissionLine kind="deny">{t.personal.never}</PermissionLine>
    </PermissionList>
  );
}

/** Keys per user (O1): the one key of the person, linked, replaced or unlinked here. */
function UserKey() {
  const backend = useBackend();
  const client = useQueryClient();
  const status = useStatus();
  const [replacing, setReplacing] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const data = status.data;
  if (!data) return null;
  const hasKey = data.user.hasKey;
  return (
    <>
      <CardHead id="settings-personal-key" eyebrow={t.personal.eyebrow} title={t.personal.title} badge={hasKey ? <OkBadge>{t.personal.linked}</OkBadge> : undefined} />
      {hasKey && !replacing ? (
        <>
          <p className="m-0 font-mono text-sm text-ink">{data.user.keyHint}</p>
          <PersonalLines />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <LinkArrow href={href({ name: "agent", chatId: null })}>{t.personal.open}</LinkArrow>
            <Button variant="secondary" size="sm" disabled={data.readOnly} onClick={() => setReplacing(true)}>
              {t.personal.replace}
            </Button>
            <Button variant="quiet" size="sm" disabled={data.readOnly} onClick={() => setUnlinking(true)}>
              {t.personal.unlink}
            </Button>
          </div>
        </>
      ) : (
        <>
          {!hasKey ? <p className="m-0 text-base text-ink-muted">{t.personal.missingBody}</p> : null}
          <KeyForm
            autoFocus={replacing}
            label={copy.settings.key.personal}
            onCancel={hasKey ? () => setReplacing(false) : undefined}
            onLink={async (key) => {
              client.setQueryData(keys.status, await backend.keys.linkUser(key));
              setReplacing(false);
              toast(copy.keys.linkedToast);
            }}
          />
        </>
      )}
      <ConfirmDialog
        open={unlinking}
        onOpenChange={setUnlinking}
        title={copy.keys.confirmUnlink}
        body={copy.keys.confirmUnlinkBody}
        confirmLabel={copy.settings.key.unlink}
        onConfirm={() => {
          setUnlinking(false);
          void attempt(async () => {
            client.setQueryData(keys.status, await backend.keys.unlinkUser());
          }, copy.keys.unlinked);
        }}
      />
    </>
  );
}

/** Keys per project: the agent chats live in the personal brain, so its key is the personal key. */
function ProjectAsPersonalKey(props: { project: Project; readOnly: boolean }) {
  const backend = useBackend();
  const client = useQueryClient();
  const usage = useUsage(props.project.id);
  const briefs = useBriefs();
  const { project } = props;
  const brief = briefs.data?.find((entry) => entry.projectId === project.id);
  const left = budgetLeft(usage.data, brief);
  return (
    <>
      <CardHead id="settings-personal-key" eyebrow={t.personal.eyebrow} title={t.personal.title} badge={project.key.hasKey ? <OkBadge>{t.personal.linked}</OkBadge> : undefined} />
      {project.key.hasKey ? (
        <>
          <p className="m-0 text-base text-ink">
            <span className="font-mono text-sm">{dotJoin(brief?.keyAlias ?? null, project.key.keyHint)}</span>
            {left ? <span>{` · ${t.personal.left(left.percent)}${left.reset ? `, reset ${left.reset}` : ""}`}</span> : null}
          </p>
          <PersonalLines />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <LinkArrow href={href({ name: "agent", chatId: null })}>{t.personal.open}</LinkArrow>
            <LinkArrow href={href({ name: "project-settings", projectId: project.id, group: "toegang" })}>{t.personal.manage}</LinkArrow>
          </div>
        </>
      ) : (
        <>
          <p className="m-0 text-base text-ink-muted">{t.personal.missingBody}</p>
          {props.readOnly ? (
            <Locked>{copy.settings.readOnly}</Locked>
          ) : (
            <KeyForm
              label={copy.settings.key.personal}
              onLink={async (key) => {
                client.setQueryData(keys.status, await backend.keys.linkProject(project.id, key));
                await client.invalidateQueries({ queryKey: keys.projects });
                toast(copy.keys.linkedToast);
              }}
            />
          )}
        </>
      )}
    </>
  );
}

function dotJoin(...parts: Array<string | null>): string {
  return parts.filter((part): part is string => Boolean(part)).join(" · ");
}

// ---------------------------------------------------------------------------
// Tools on this computer (demo shows a found tool; live keeps the card with its reason, P4)
// ---------------------------------------------------------------------------

function ToolsCard() {
  const backend = useBackend();
  const demo = backend.mode === "demo";
  return (
    <Panel as="section" label={t.tools.eyebrow} className="flex flex-col gap-4">
      <CardHead id="settings-tools" eyebrow={t.tools.eyebrow} title={t.tools.title} badge={demo ? <OkBadge>{t.tools.found}</OkBadge> : <Lock className="size-4 text-ink" aria-hidden="true" />} />
      {demo ? (
        <>
          <p className="m-0 font-mono text-sm text-ink">{t.tools.path}</p>
          <p className="m-0 text-base text-ink-muted">{t.tools.body}</p>
        </>
      ) : (
        <LockedNote title={t.tools.lockedTitle}>{t.tools.locked}</LockedNote>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// How keys work
// ---------------------------------------------------------------------------

function HowKeys() {
  return (
    <section aria-labelledby="settings-how-keys">
      <SectionTitle id="settings-how-keys" title={t.how.title} />
      <Columns min={220}>
        {t.how.items.map((item, index) => (
          <Column key={item.title} index={String(index + 1).padStart(2, "0")} title={item.title}>
            {item.body}
          </Column>
        ))}
      </Columns>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Connections with services, per project (the existing connection rows)
// ---------------------------------------------------------------------------

function ServicesSection() {
  const projects = useProjects();
  const active = (projects.data ?? []).filter((project) => !project.archivedAt);
  const [chosen, setChosen] = useState<string | null>(null);
  const projectId = chosen && active.some((project) => project.id === chosen) ? chosen : (active[0]?.id ?? null);
  return (
    <section aria-labelledby="settings-services">
      <SectionTitle
        id="settings-services"
        title={t.services.title}
        lead={t.services.lead}
        action={
          active.length > 0 ? (
            <Select label={t.services.project} value={projectId} onValueChange={setChosen} items={active.map((project) => ({ value: project.id, label: project.name }))} className="h-11 w-auto min-w-64 gap-4 bg-surface text-base ring-line-strong" />
          ) : undefined
        }
      />
      <Panel>{projectId ? <ConnectionsSection projectId={projectId} /> : <p className="m-0 text-base text-ink-muted">{t.services.none}</p>}</Panel>
    </section>
  );
}
