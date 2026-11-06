import { useMemo, useState, type ReactNode } from "react";
import { Check } from "lucide-react";

import { useAgentSettings } from "~/backend/cockpit-queries";
import type { Werkwijze } from "~/backend/cockpit";
import { useProjects, useWorkflows } from "~/backend/queries";
import type { Workflow } from "~/backend/types";
import { Column, Columns, DataTable, Eyebrow, LinkArrow, Panel, PermissionLine, PermissionList, SectionTitle } from "~/components/io";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/misc";
import { Dialog } from "~/components/ui/overlay";
import { Select } from "~/components/ui/select";
import { settingsCopy } from "~/copy/settings";
import { href } from "~/lib/router";

import { MethodsSection } from "./werkwijzen";

const t = settingsCopy.werkwijzen;

/** One version of a werkwijze as the table and the cards show it: a cockpit recipe or an ICM workflow in a brain. */
type Version = {
  key: string;
  name: string;
  /** "v3", or "map" for a workflow folder in the project's brain. */
  version: string;
  origin: Werkwijze["origin"];
  stages: string[];
  meta: string;
  werkwijze: Werkwijze | null;
  workflow: Workflow | null;
};

function fromWerkwijze(werkwijze: Werkwijze): Version {
  return {
    key: werkwijze.id,
    name: werkwijze.name,
    version: t.version(werkwijze.version),
    origin: werkwijze.origin,
    stages: werkwijze.stages,
    meta: werkwijze.key === "personal" ? t.keyPersonal : t.keyProject,
    werkwijze,
    workflow: null,
  };
}

function fromWorkflow(workflow: Workflow): Version {
  return {
    key: `icm:${workflow.name}`,
    name: workflow.title,
    version: t.folder,
    origin: "project",
    stages: workflow.stages.map((stage) => stage.task),
    meta: t.brainFolder,
    werkwijze: null,
    workflow,
  };
}

/** The row per werkwijze name: the version from each origin, and which one wins (project › yours › the app's). */
type Line = { name: string; project: Version | null; personal: Version | null; app: Version | null; used: Version };

function lines(versions: readonly Version[]): Line[] {
  const byName = new Map<string, Version[]>();
  for (const version of versions) byName.set(version.name, [...(byName.get(version.name) ?? []), version]);
  const result: Line[] = [];
  for (const [name, list] of byName) {
    const project = list.find((version) => version.origin === "project") ?? null;
    const personal = list.find((version) => version.origin === "personal") ?? null;
    const app = list.find((version) => version.origin === "app") ?? null;
    const used = project ?? personal ?? app;
    if (used) result.push({ name, project, personal, app, used });
  }
  return result;
}

/** The hero action: workflows come from a brain, linked under Geheugen. */
export function WerkwijzenHeroAction() {
  return (
    <a
      href={href({ name: "settings", group: "geheugen" })}
      className="inline-flex h-14 items-center rounded-full border border-ink px-7 text-base font-semibold text-ink no-underline transition-colors duration-200 hover:bg-ink hover:text-surface"
    >
      {t.addBrain}
    </a>
  );
}

/**
 * Werkwijzen (design v2-Workspaces): the order in which a version wins, what one project gets (the
 * version used per werkwijze), your own versions and the project's own, then the skills and commands
 * every project can use (the former "Voor alle projecten" group).
 */
export function WerkwijzenGroup() {
  const agent = useAgentSettings();
  const projects = useProjects();
  const active = useMemo(() => (projects.data ?? []).filter((project) => !project.archivedAt), [projects.data]);
  const [chosen, setChosen] = useState<string | null>(null);
  const project = active.find((entry) => entry.id === chosen) ?? active[0] ?? null;
  const workflows = useWorkflows(project?.id ?? "");
  const [viewing, setViewing] = useState<Version | null>(null);

  const all = agent.data?.werkwijzen ?? [];
  const personal = all.filter((werkwijze) => werkwijze.origin === "personal").map(fromWerkwijze);
  const app = all.filter((werkwijze) => werkwijze.origin === "app").map(fromWerkwijze);
  const own = project ? [...all.filter((werkwijze) => werkwijze.origin === "project" && werkwijze.projectId === project.id).map(fromWerkwijze), ...(project ? (workflows.data ?? []).map(fromWorkflow) : [])] : [];
  const table = lines([...own, ...personal, ...app]);

  return (
    <div className="flex flex-col gap-14">
      <section aria-labelledby="settings-order" className="flex flex-col gap-6">
        <SectionTitle id="settings-order" title={t.order} className="mb-0" />
        <Columns min={200}>
          {t.orderSteps.map((step, index) => (
            <Column key={step.title} index={String(index + 1).padStart(2, "0")} eyebrow={step.eyebrow} title={step.title} rule={index === 0 ? "strong" : "line"}>
              {step.body}
            </Column>
          ))}
        </Columns>
        <p className="m-0 max-w-[72ch] text-lg text-ink">{t.orderBody}</p>
      </section>

      <section aria-labelledby="settings-project-gets" className="flex flex-col gap-5">
        <SectionTitle
          id="settings-project-gets"
          title={t.projectGets}
          className="mb-0 items-center"
          action={
            active.length > 0 && project ? (
              <span className="flex items-center gap-3">
                <span className="text-base text-ink-muted" aria-hidden="true">
                  {t.project}
                </span>
                <Select label={t.project} value={project.id} onValueChange={setChosen} items={active.map((entry) => ({ value: entry.id, label: entry.name }))} className="h-11 w-auto min-w-64 gap-4 bg-surface text-base ring-line-strong" />
              </span>
            ) : undefined
          }
        />
        <Panel className="py-2 lg:py-2">
          {agent.isLoading || projects.isLoading ? (
            <div className="flex flex-col gap-4 py-6">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-8 w-full" />
              ))}
            </div>
          ) : !project ? (
            <p className="m-0 py-6 text-base text-ink-muted">{t.noProject}</p>
          ) : table.length === 0 ? (
            <p className="m-0 py-6 text-base text-ink-muted">{t.empty}</p>
          ) : (
            <DataTable label={t.tableLabel(project.name)} className="pt-4" head={[t.head.name, t.head.project, t.head.personal, t.head.app, t.head.stages]}>
              {table.map((line) => (
                <tr key={line.name}>
                  <th scope="row" className="py-5 pe-6 text-start align-top text-base font-semibold text-ink">
                    {line.name}
                  </th>
                  <td>
                    <VersionCell version={line.project} used={line.used} />
                  </td>
                  <td>
                    <VersionCell version={line.personal} used={line.used} />
                  </td>
                  <td>
                    <VersionCell version={line.app} used={line.used} />
                  </td>
                  <td className="text-base text-ink">{line.used.stages.length}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </Panel>
        <p className="m-0 text-base text-ink-muted">{t.oneRun}</p>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <VersionList id="settings-yours" title={t.yours} empty={t.yoursEmpty} versions={personal} onOpen={setViewing} loading={agent.isLoading} />
        {project ? (
          <VersionList id="settings-project-own" title={t.projectOwn(project.name)} empty={t.projectEmpty} versions={own} onOpen={setViewing} loading={agent.isLoading} projectId={project.id} note={t.projectNote} />
        ) : null}
      </div>

      <section aria-labelledby="settings-global-methods" className="flex flex-col gap-5">
        <SectionTitle id="settings-global-methods" title={t.global} lead={t.globalLead} className="mb-0" />
        <Panel>
          <MethodsSection projectId={active[0]?.id ?? null} scope="global" />
        </Panel>
      </section>

      <Dialog
        open={viewing !== null}
        onOpenChange={(open) => !open && setViewing(null)}
        title={viewing ? `${viewing.name} ${viewing.version}` : ""}
        footer={
          <Button variant="primary" onClick={() => setViewing(null)}>
            {t.close}
          </Button>
        }
      >
        {viewing ? <VersionDetail version={viewing} /> : null}
      </Dialog>
    </div>
  );
}

function VersionCell(props: { version: Version | null; used: Version }) {
  if (!props.version) return <span className="text-base text-ink-muted">{t.none}</span>;
  if (props.version.key === props.used.key)
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-inverse px-3 py-1 text-[13px] font-semibold leading-4 text-ink-inverse">
        <Check className="size-3.5" aria-hidden="true" />
        {t.used(props.version.version)}
      </span>
    );
  return <span className="text-base text-ink-muted">{props.version.version}</span>;
}

function VersionList(props: { id: string; title: string; empty: string; versions: Version[]; onOpen: (version: Version) => void; loading: boolean; projectId?: string; note?: ReactNode }) {
  return (
    <Panel as="section" label={props.title} className="flex flex-col gap-4">
      <h2 id={props.id} className="m-0 text-xl font-semibold text-ink">
        {props.title}
      </h2>
      {props.loading ? (
        <Skeleton className="h-24 w-full" />
      ) : props.versions.length === 0 ? (
        <p className="m-0 border-t border-line pt-4 text-base text-ink-muted">{props.empty}</p>
      ) : (
        <ul className="m-0 list-none border-t border-line p-0">
          {props.versions.map((version) => (
            <li key={version.key} className="flex flex-wrap items-center gap-3 border-b border-line py-4 last:border-b-0">
              <span className="flex min-w-0 flex-[1_1_200px] flex-col">
                <span className="text-lg font-semibold text-ink">
                  {version.name} <span className="font-normal text-ink-muted">{`${version.version} · ${t.stages(version.stages.length)}`}</span>
                </span>
                <span className="text-sm text-ink-muted">{version.meta}</span>
              </span>
              {version.workflow && props.projectId ? (
                <LinkArrow href={href({ name: "project-brain", projectId: props.projectId })}>{t.openBrain}</LinkArrow>
              ) : (
                <LinkArrow onClick={() => props.onOpen(version)}>
                  {t.open}
                  <span className="sr-only">{` ${version.name}`}</span>
                </LinkArrow>
              )}
            </li>
          ))}
        </ul>
      )}
      {props.note ? <p className="m-0 text-base text-ink-muted">{props.note}</p> : null}
    </Panel>
  );
}

function VersionDetail(props: { version: Version }) {
  const { version } = props;
  return (
    <div className="flex flex-col gap-5">
      <p className="m-0 text-sm text-ink-muted">{[t.origin[version.origin], version.meta].join(" · ")}</p>
      <div className="flex flex-col gap-2">
        <Eyebrow>{t.stagesTitle}</Eyebrow>
        <ol className="m-0 flex list-none flex-col gap-1 p-0">
          {version.stages.map((stage, index) => (
            <li key={stage} className="flex gap-3 text-base text-ink">
              <span className="w-6 shrink-0 text-ink-muted">{String(index + 1).padStart(2, "0")}</span>
              {stage}
            </li>
          ))}
        </ol>
      </div>
      {version.werkwijze ? (
        <div className="flex flex-col gap-2">
          <Eyebrow>{t.grantsTitle}</Eyebrow>
          <PermissionList>
            {version.werkwijze.grants.map((grant) => (
              <PermissionLine key={grant.text} kind={grant.kind}>
                {grant.text}
              </PermissionLine>
            ))}
          </PermissionList>
        </div>
      ) : null}
    </div>
  );
}
