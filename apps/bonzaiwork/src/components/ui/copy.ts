/**
 * Dutch copy owned by the primitives (brief §10). Consolidated into `src/copy.ts` in a later step;
 * screens pass their own words for everything that is not a fixed status.
 */
export const uiCopy = {
  status: {
    /** The agent is working (electric, pulsing). */
    running: "Bezig",
    /** The agent waits for a decision (amber). */
    waiting: "Wacht op jou",
    /** The turn ended in an error (red). */
    failed: "Mislukt",
    /** A capability is blocked by policy or a missing key (lock, neutral ink; P4, C5). */
    locked: "Vergrendeld",
  },
  progress: {
    /** Read to assistive tech while a bar has no value yet. */
    indeterminate: "Bezig",
  },
} as const;
