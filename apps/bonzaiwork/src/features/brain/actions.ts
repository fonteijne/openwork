import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { useBackend } from "~/backend/context";
import { keys } from "~/backend/queries";
import type { BrainStatus } from "~/backend/types";
import { copy } from "~/copy";
import { toast } from "~/components/ui/toast";
import { errorText } from "~/lib/errors";

/**
 * Brain actions with one busy flag and one place that refreshes what they
 * change. A failure is a toast in the user's words (DESIGN.md C6); the
 * brain's own state already says what happened.
 */
export function useBrainAction(projectId: string) {
  const backend = useBackend();
  const client = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async <T,>(name: string, task: () => Promise<T>, done?: string): Promise<T | null> => {
    if (busy) return null;
    setBusy(name);
    try {
      const result = await task();
      // A failed push or update comes back as a status, not an error: then say that, never "Gedeeld"
      // (DESIGN.md C2, review #5).
      const failed = statusProblem(result);
      if (failed) toast(failed, { tone: "error" });
      else if (result === "timeout") toast(copy.brain.updateSlow);
      else if (done) toast(done);
      return result;
    } catch (failure) {
      toast(errorText(failure), { tone: "error" });
      return null;
    } finally {
      setBusy(null);
      await Promise.all([
        client.invalidateQueries({ queryKey: keys.brains }),
        client.invalidateQueries({ queryKey: keys.brainHistory(projectId) }),
      ]);
    }
  };
  return { busy, run, brains: backend.brains };
}

function isStatus(value: unknown): value is BrainStatus {
  return typeof value === "object" && value !== null && "state" in value && "error" in value && "pendingTrust" in value;
}

/** The status's own sentence when it reports a problem; also inside `{ status }`. */
function statusProblem(value: unknown): string | null {
  const status = isStatus(value) ? value : typeof value === "object" && value !== null && "status" in value && isStatus(value.status) ? value.status : null;
  if (!status) return null;
  const failing = status.state === "error" || status.state === "offline" || status.state === "conflict" || (status.state === "read_only" && status.mode !== "read_only");
  return failing ? status.error ?? copy.errors.generic : null;
}

/** The status in the pill's words (brains plan §8.2). */
export function attention(status: BrainStatus): boolean {
  return status.state === "conflict" || status.state === "error" || status.state === "needs_trust" || status.proposal?.manual === true;
}
