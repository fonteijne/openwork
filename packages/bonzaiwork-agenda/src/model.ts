/**
 * The pure part of the agenda for the BonzaiWork UI and its demo backend: the types of the routes,
 * the quarter clock, the view of a day and the booking document. No I/O and no Node APIs, so it
 * bundles for the browser; the server uses the same functions, so the demo and the UI count, label
 * and export exactly like the server does.
 */
export {
  AWAY_LABEL,
  type AgendaDay,
  type AgendaProject,
  type Block,
  type BridgePost,
  type ChatRef,
  type Correction,
  type DayTotal,
  type DayView,
  type Measured,
  type QuarterKind,
  type QuarterRecord,
  type QuarterView,
} from "./types.ts";
export type { AgendaSettingsView } from "./routes.ts";
export { addDays, dateOf, datesBetween, isDate, keyStart, quarterKey, quartersOfDay, QUARTER_MS, timeOf, weekOf, weekday } from "./clock.ts";
export { dayQuarters, type ViewContext } from "./quarters.ts";
export { dayView, dutchDuration, proposal, QUARTER_MINUTES, type Proposal } from "./overview.ts";
export { bookingDocument } from "./booking-doc.ts";
export { parseBridgePost, POST_LABEL_MAX, rememberPost, validEntityId } from "./bridge.ts";
export { NOTE_MAX, OTHER_LABEL_MAX, REFERENCE_MAX } from "./parse.ts";
