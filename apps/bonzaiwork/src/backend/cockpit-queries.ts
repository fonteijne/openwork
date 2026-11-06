import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useBackend } from "./context";
import type { CockpitBackend } from "./cockpit";

/**
 * TanStack Query hooks for `Backend.cockpit`. Every key starts with "cockpit", so one invalidation
 * after a mutation refreshes every surface (a decision answered on Today also leaves Runs and the
 * status line). Runs, decisions and the status line poll: runs move on by themselves.
 */

const POLL = 5_000;

export const cockpitKeys = {
  all: ["cockpit"] as const,
  status: ["cockpit", "status"] as const,
  needsYou: ["cockpit", "needs-you"] as const,
  away: (since: number) => ["cockpit", "away", since] as const,
  calendar: (day: string) => ["cockpit", "calendar", day] as const,
  todos: ["cockpit", "todos"] as const,
  waiting: ["cockpit", "waiting"] as const,
  inbox: ["cockpit", "inbox"] as const,
  plan: ["cockpit", "plan"] as const,
  runs: ["cockpit", "runs"] as const,
  run: (runId: string) => ["cockpit", "run", runId] as const,
  werkwijzen: (projectId: string | null) => ["cockpit", "werkwijzen", projectId ?? "all"] as const,
  draft: (todoId: string | null, goal: string | null) => ["cockpit", "draft", todoId ?? "none", goal ?? ""] as const,
  approvals: ["cockpit", "approvals"] as const,
  approval: (approvalId: string) => ["cockpit", "approval", approvalId] as const,
  activity: ["cockpit", "activity"] as const,
  sent: ["cockpit", "sent"] as const,
  shelves: ["cockpit", "shelves"] as const,
  pages: (shelfId: string | null) => ["cockpit", "pages", shelfId ?? "all"] as const,
  page: (pageId: string) => ["cockpit", "page", pageId] as const,
  requests: ["cockpit", "requests"] as const,
  proposals: ["cockpit", "proposals"] as const,
  proposal: (proposalId: string) => ["cockpit", "proposal", proposalId] as const,
  areas: ["cockpit", "areas"] as const,
  briefs: ["cockpit", "briefs"] as const,
  brief: (projectId: string) => ["cockpit", "brief", projectId] as const,
  projectProposal: (chatKey: string) => ["cockpit", "project-proposal", chatKey] as const,
  review: (projectId: string) => ["cockpit", "review", projectId] as const,
  agent: ["cockpit", "agent"] as const,
  search: (query: string) => ["cockpit", "search", query] as const,
};

export function useCockpit(): CockpitBackend {
  return useBackend().cockpit;
}

/** Refreshes every cockpit query (and the existing project lists, which counts may change). */
export function useCockpitRefresh(): () => Promise<void> {
  const client = useQueryClient();
  return async () => {
    await Promise.all([client.invalidateQueries({ queryKey: cockpitKeys.all }), client.invalidateQueries({ queryKey: ["attention"] }), client.invalidateQueries({ queryKey: ["projects"] })]);
  };
}

/** A cockpit mutation that refreshes the cockpit when it settles. */
export function useCockpitMutation<TInput, TResult>(fn: (cockpit: CockpitBackend, input: TInput) => Promise<TResult>) {
  const cockpit = useCockpit();
  const refresh = useCockpitRefresh();
  return useMutation({ mutationFn: (input: TInput) => fn(cockpit, input), onSettled: () => refresh() });
}

export function useCockpitStatus() {
  const cockpit = useCockpit();
  return useQuery({ queryKey: cockpitKeys.status, queryFn: () => cockpit.status(), refetchInterval: POLL * 2 });
}

export function useNeedsYou() {
  const cockpit = useCockpit();
  return useQuery({ queryKey: cockpitKeys.needsYou, queryFn: () => cockpit.needsYou(), refetchInterval: POLL });
}

export function useAway(since: number) {
  const cockpit = useCockpit();
  return useQuery({ queryKey: cockpitKeys.away(since), queryFn: () => cockpit.away(since) });
}

export function useCalendar(day: number) {
  const cockpit = useCockpit();
  const key = new Date(day).toDateString();
  return useQuery({ queryKey: cockpitKeys.calendar(key), queryFn: () => cockpit.calendar(day), enabled: cockpit.capabilities.calendar === null });
}

export function useTodos() {
  const cockpit = useCockpit();
  return useQuery({ queryKey: cockpitKeys.todos, queryFn: () => cockpit.todos.list() });
}

export function useWaiting() {
  const cockpit = useCockpit();
  return useQuery({ queryKey: cockpitKeys.waiting, queryFn: () => cockpit.todos.waiting() });
}

export function useInbox() {
  const cockpit = useCockpit();
  return useQuery({ queryKey: cockpitKeys.inbox, queryFn: () => cockpit.inbox.list() });
}

export function useDayPlan() {
  const cockpit = useCockpit();
  return useQuery({ queryKey: cockpitKeys.plan, queryFn: () => cockpit.plan.get() });
}

export function useRuns() {
  const cockpit = useCockpit();
  return useQuery({ queryKey: cockpitKeys.runs, queryFn: () => cockpit.runs.list(), refetchInterval: POLL });
}

export function useRun(runId: string) {
  const cockpit = useCockpit();
  return useQuery({ queryKey: cockpitKeys.run(runId), queryFn: () => cockpit.runs.get(runId), refetchInterval: POLL });
}

export function useWerkwijzen(projectId: string | null) {
  const cockpit = useCockpit();
  return useQuery({ queryKey: cockpitKeys.werkwijzen(projectId), queryFn: () => cockpit.runs.werkwijzen(projectId) });
}

export function useDelegateDraft(todoId: string | null, goal: string | null) {
  const cockpit = useCockpit();
  return useQuery({ queryKey: cockpitKeys.draft(todoId, goal), queryFn: () => cockpit.runs.draft(todoId, goal), staleTime: Infinity });
}

export function useApprovals() {
  const cockpit = useCockpit();
  return useQuery({ queryKey: cockpitKeys.approvals, queryFn: () => cockpit.approvals.list() });
}

export function useApproval(approvalId: string) {
  const cockpit = useCockpit();
  return useQuery({ queryKey: cockpitKeys.approval(approvalId), queryFn: () => cockpit.approvals.get(approvalId) });
}

export function useActivity() {
  const cockpit = useCockpit();
  return useQuery({ queryKey: cockpitKeys.activity, queryFn: () => cockpit.activity.list() });
}

export function useSent() {
  const cockpit = useCockpit();
  return useQuery({ queryKey: cockpitKeys.sent, queryFn: () => cockpit.activity.sent(), refetchInterval: POLL });
}

export function useShelves() {
  const cockpit = useCockpit();
  return useQuery({ queryKey: cockpitKeys.shelves, queryFn: () => cockpit.library.shelves() });
}

export function useLibraryPages(shelfId: string | null) {
  const cockpit = useCockpit();
  return useQuery({ queryKey: cockpitKeys.pages(shelfId), queryFn: () => cockpit.library.pages(shelfId) });
}

export function useLibraryPage(pageId: string) {
  const cockpit = useCockpit();
  return useQuery({ queryKey: cockpitKeys.page(pageId), queryFn: () => cockpit.library.page(pageId) });
}

export function useLibraryRequests() {
  const cockpit = useCockpit();
  return useQuery({ queryKey: cockpitKeys.requests, queryFn: () => cockpit.library.requests() });
}

export function useLibraryProposals() {
  const cockpit = useCockpit();
  return useQuery({ queryKey: cockpitKeys.proposals, queryFn: () => cockpit.library.proposals() });
}

export function useLibraryProposal(proposalId: string) {
  const cockpit = useCockpit();
  return useQuery({ queryKey: cockpitKeys.proposal(proposalId), queryFn: () => cockpit.library.proposal(proposalId) });
}

export function useAreas() {
  const cockpit = useCockpit();
  return useQuery({ queryKey: cockpitKeys.areas, queryFn: () => cockpit.projects.areas() });
}

export function useBriefs() {
  const cockpit = useCockpit();
  return useQuery({ queryKey: cockpitKeys.briefs, queryFn: () => cockpit.projects.briefs() });
}

export function useBrief(projectId: string) {
  const cockpit = useCockpit();
  return useQuery({ queryKey: cockpitKeys.brief(projectId), queryFn: () => cockpit.projects.brief(projectId) });
}

export function useProjectProposal(fromChat: { projectId: string; chatId: string } | null) {
  const cockpit = useCockpit();
  return useQuery({
    queryKey: cockpitKeys.projectProposal(fromChat ? `${fromChat.projectId}/${fromChat.chatId}` : "blank"),
    queryFn: () => cockpit.projects.proposal(fromChat),
    staleTime: Infinity,
  });
}

export function useProjectReview(projectId: string) {
  const cockpit = useCockpit();
  return useQuery({ queryKey: cockpitKeys.review(projectId), queryFn: () => cockpit.projects.review(projectId), staleTime: Infinity });
}

export function useAgentSettings() {
  const cockpit = useCockpit();
  return useQuery({ queryKey: cockpitKeys.agent, queryFn: () => cockpit.settings.agent() });
}

export function useCockpitSearch(query: string) {
  const cockpit = useCockpit();
  return useQuery({ queryKey: cockpitKeys.search(query), queryFn: () => cockpit.search(query), enabled: query.trim().length > 0, placeholderData: (previous) => previous });
}
