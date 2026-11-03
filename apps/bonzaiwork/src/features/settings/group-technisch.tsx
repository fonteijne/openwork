import { useQuery } from "@tanstack/react-query";
import { FolderOpen } from "lucide-react";

import { useBackend } from "~/backend/context";
import { keys } from "~/backend/queries";
import type { Project } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { Disclosure } from "~/components/ui/disclosure";
import { Locked, Row, Section, Skeleton } from "~/components/ui/misc";
import { copy } from "~/copy";
import { formatDateTime } from "~/lib/format";


/**
 * Technisch group (brief §6; P3): the full path, the engine, plugins (locked until they exist),
 * and the activity log behind a collapsed disclosure (S3). Nothing here is a decision people
 * make daily, so nothing here is open by default except the facts.
 */
export function TechnischGroup(props: { project: Project }) {
  const backend = useBackend();
  const versions = useQuery({ queryKey: keys.versions, queryFn: () => backend.settings.versions(), staleTime: 5 * 60_000 });
  const audit = useQuery({ queryKey: keys.audit(props.project.id), queryFn: () => backend.config.audit(props.project.id) });
  const demo = backend.mode === "demo";
  return (
    <div className="flex flex-col gap-8">
      <Section title={copy.settings.technical.title}>
        <Row
          label={copy.settings.technical.path}
          value={<span className="font-mono text-xs">{props.project.path}</span>}
          action={
            backend.capabilities.revealPath ? (
              <Button variant="secondary" size="sm" onClick={() => void backend.desktop.revealPath(props.project.path)}>
                <FolderOpen />
                {copy.settings.project.reveal}
              </Button>
            ) : undefined
          }
        />
        <Row label={copy.settings.technical.engine} value={versions.isLoading ? <Skeleton className="h-4 w-24" /> : (versions.data?.engine ?? (demo ? copy.boot.demoBadge : "—"))} />
        <Row label={copy.settings.technical.server} value={versions.isLoading ? <Skeleton className="h-4 w-24" /> : (versions.data?.server ?? (demo ? copy.boot.demoBadge : "—"))} />
        <Row label={copy.settings.technical.plugins} value={<Locked>{copy.settings.technical.pluginsLocked}</Locked>} />
      </Section>
      <Disclosure label={copy.settings.technical.activity} trailing={audit.data ? copy.settings.changes(audit.data.length) : undefined} testId="settings-activity" panelClassName="ps-0 pt-0">
        <div className="border-t border-border">
          {audit.isLoading ? (
            <Skeleton className="my-3 h-4 w-48" />
          ) : audit.data?.length ? (
            audit.data.map((entry) => (
              <Row
                key={entry.id}
                label={entry.summary}
                value={
                  <span className="text-xs">
                    {entry.actor} · {formatDateTime(entry.at)}
                  </span>
                }
              />
            ))
          ) : (
            <p className="py-3 text-sm text-muted-foreground">{copy.settings.technical.activityEmpty}</p>
          )}
        </div>
      </Disclosure>
    </div>
  );
}
