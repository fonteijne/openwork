import { useProject } from "~/backend/queries";
import { PageTitle, TopBar } from "~/components/top-bar";
import { Button } from "~/components/ui/button";
import { EmptyState, Skeleton } from "~/components/ui/misc";
import { Sheet } from "~/components/ui/overlay";
import { copy } from "~/copy";
import { navigate } from "~/lib/router";
import { useMediaQuery, WIDE } from "~/lib/use-media";

import { ChatView } from "../chat/chat-view";
import { ProjectHome } from "../chat/project-home";
import { Sidecar } from "../chat/sidecar";
import { useUi } from "../shell/ui-store";

export function ProjectMissing() {
  return (
    <div className="flex h-full flex-col">
      <TopBar>
        <PageTitle>{copy.nav.projects}</PageTitle>
      </TopBar>
      <EmptyState
        title={copy.errors.not_found}
        action={
          <Button variant="secondary" onClick={() => navigate({ name: "projects" })}>
            {copy.nav.allProjects}
          </Button>
        }
      />
    </div>
  );
}

export function ProjectLoading() {
  return (
    <div className="flex h-full flex-col" aria-busy="true">
      <TopBar>
        <Skeleton className="h-4 w-40" />
      </TopBar>
      <div className="mx-auto mt-[14vh] w-full max-w-2xl px-6">
        <Skeleton className="mx-auto mb-5 h-6 w-72" />
        <Skeleton className="h-28 w-full rounded-shell" />
      </div>
    </div>
  );
}

/** Chat (or the project's start) in the middle, the sidecar on the right. */
export function ProjectPage(props: { projectId: string; chatId: string | null }) {
  const { project, isLoading } = useProject(props.projectId);
  const wide = useMediaQuery(WIDE);
  const sidecarPinned = useUi((state) => state.sidecarPinned);
  const sheetOpen = useUi((state) => state.sidecarSheetOpen);
  const setSheet = useUi((state) => state.setSidecarSheet);

  if (!project) return isLoading ? <ProjectLoading /> : <ProjectMissing />;

  return (
    <div className="flex h-full min-h-0" data-sidecar-pinned={wide && sidecarPinned ? "" : undefined}>
      <div className="flex min-w-0 flex-1 flex-col">{props.chatId ? <ChatView key={props.chatId} project={project} chatId={props.chatId} /> : <ProjectHome project={project} />}</div>
      {wide && sidecarPinned ? (
        <aside className="hidden w-80 shrink-0 border-s border-border bg-background xl:flex xl:flex-col" aria-label={copy.sidecar.title}>
          <Sidecar project={project} chatId={props.chatId} />
        </aside>
      ) : null}
      <Sheet open={sheetOpen && !wide} onOpenChange={setSheet} side="right" label={copy.sidecar.title}>
        <Sidecar project={project} chatId={props.chatId} onClose={() => setSheet(false)} />
      </Sheet>
    </div>
  );
}
