/**
 * The pure part of Vandaag for the BonzaiWork UI and its demo backend: the types of the routes, the
 * to-do notation and the choosing. No I/O and no Node APIs, so it bundles for the browser; the
 * server uses the same functions, so the demo and the UI read, rank and group exactly like it.
 */
export * from "./types.ts";
export { DEADLINE_MARK, WAITING_MARK, formatTodoLine, isDate, normalizeHandle, ownHandles, parseTeam, parseTodoLine, type ParsedTodo, type TeamMember } from "./notation.ts";
export { MEETING_LEAD_MS, addDays, bucketOf, daysBetween, localDate, meetingIsNear, pickStart, rankTodos, upcomingRows, visibleItems, type Ranked } from "./rank.ts";
