import { useEffect } from "react";

import { useBackend } from "~/backend/context";
import { hasDesktopBridge } from "~/backend/live/desktop";
import { useProject } from "~/backend/queries";
import { whenIdle } from "~/lib/idle";

/**
 * Which project is open, for the agenda's presence minutes (plan §5.3). Sent on every navigation in a
 * quiet moment (`requestIdleCallback`) and never awaited, so navigation never waits for the agenda
 * (plan §7.6). The desktop app measures focus and system idle in the main process; only in a plain
 * browser (development, the demo) does the UI also send focus and the last input, once a minute.
 */

const MINUTE = 60_000;
let lastInputAt = 0;
let listening = false;

function listenForInput() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  const mark = () => (lastInputAt = Date.now());
  for (const type of ["pointerdown", "keydown", "wheel", "pointermove"]) window.addEventListener(type, mark, { capture: true, passive: true });
}

export function useAgendaPresence(projectId: string | null) {
  const backend = useBackend();
  const { project } = useProject(projectId ?? "");
  const name = project?.name ?? null;
  const available = backend.capabilities.agenda;

  useEffect(() => {
    if (!available) return;
    return whenIdle(() => void backend.agenda.reportPresence({ projectId, name }));
  }, [available, backend, projectId, name]);

  useEffect(() => {
    if (!available || hasDesktopBridge()) return;
    listenForInput();
    const report = () =>
      whenIdle(() => void backend.agenda.reportPresence({ projectId, name, focused: document.hasFocus(), lastInputAt: lastInputAt || undefined }));
    const timer = window.setInterval(report, MINUTE);
    return () => window.clearInterval(timer);
  }, [available, backend, projectId, name]);
}
