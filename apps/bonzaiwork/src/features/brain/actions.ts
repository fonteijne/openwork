import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { useBackend } from "~/backend/context";
import { keys } from "~/backend/queries";
import type { BrainStatus } from "~/backend/types";
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
      if (done) toast(done);
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

/** The status in the pill's words (brains plan §8.2). */
export function attention(status: BrainStatus): boolean {
  return status.state === "conflict" || status.state === "error" || status.state === "needs_trust" || status.proposal?.manual === true;
}
