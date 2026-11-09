import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleHelp, Info, Keyboard, Megaphone, RotateCcw } from "lucide-react";

import { useBackend } from "~/backend/context";
import { keys } from "~/backend/queries";
import type { Backend, EngineState } from "~/backend/types";
import { Button } from "~/components/ui/button";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "~/components/ui/menu";
import { copy } from "~/copy";
import { navigate } from "~/lib/router";
import { chord } from "~/lib/shortcuts";

import { useUi } from "./ui-store";

const NO_ENGINE: NonNullable<Backend["engine"]> = { current: () => "ready", subscribe: () => () => undefined, error: () => null, retry: () => undefined };

const ENGINE_LABEL: Record<EngineState, string> = {
  ready: copy.shell.engine.ready,
  starting: copy.shell.engine.starting,
  failed: copy.shell.engine.failed,
};

/**
 * "?" in the sidebar footer (brief §4): the rare actions in one place (P3) with the versions and
 * the engine state as plain rows, never as a page-wide banner competitor.
 */
export function HelpMenu() {
  const backend = useBackend();
  const engine = backend.engine ?? NO_ENGINE;
  const engineState = useSyncExternalStore(engine.subscribe, engine.current);
  const setShortcuts = useUi((state) => state.setShortcuts);
  const setFeedback = useUi((state) => state.setFeedback);
  const versions = useQuery({ queryKey: keys.versions, queryFn: () => backend.settings.versions(), staleTime: Number.POSITIVE_INFINITY });
  const detail = versions.data ? copy.shell.versions(versions.data.server, versions.data.engine) : "";

  return (
    <Menu
      side="top"
      align="start"
      trigger={
        <Button variant="quiet" size="icon-sm" aria-label={copy.shell.help} data-testid="help-menu">
          <CircleHelp />
        </Button>
      }
    >
      <MenuItem icon={<Keyboard />} shortcut={chord("shortcuts")} onClick={() => setShortcuts(true)}>
        {copy.shell.shortcutsTitle}
      </MenuItem>
      <MenuItem icon={<Megaphone />} onClick={() => setFeedback(true)}>
        {copy.shell.feedback}
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon={<Info />} onClick={() => navigate({ name: "settings", group: "technisch" })}>
        {copy.shell.about}
      </MenuItem>
      {versions.data ? (
        <MenuLabel>
          {copy.shell.version(versions.data.app)}
          {detail ? ` · ${detail}` : ""}
        </MenuLabel>
      ) : null}
      {engineState === "failed" ? (
        <MenuItem icon={<RotateCcw />} danger onClick={() => engine.retry()}>
          {ENGINE_LABEL.failed} · {copy.boot.retry}
        </MenuItem>
      ) : (
        <MenuLabel>{ENGINE_LABEL[engineState]}</MenuLabel>
      )}
    </Menu>
  );
}
