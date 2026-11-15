import { FolderOpen } from "lucide-react";

import { useBackend } from "~/backend/context";
import { Button } from "~/components/ui/button";
import { toast } from "~/components/ui/toast";
import { Tooltip } from "~/components/ui/tooltip";
import { copy } from "~/copy";
import { fileManager } from "~/lib/platform";

/**
 * The icon-only button next to a folder path: opens that folder in Finder, Explorer or the Linux
 * file manager. Absent where the backend has no file system (the browser demo), like every reveal.
 */
export function OpenFolderButton(props: { path: string; className?: string }) {
  const backend = useBackend();
  if (!backend.capabilities.revealPath || !props.path.trim()) return null;
  const label = copy.ui.openFolder[fileManager];
  return (
    <Tooltip label={label}>
      <Button
        variant="quiet"
        size="icon-sm"
        aria-label={label}
        className={props.className}
        data-testid="open-folder"
        onClick={() => void backend.desktop.openFolder(props.path).catch(() => toast(copy.ui.openFolder.failed, { tone: "error" }))}
      >
        <FolderOpen />
      </Button>
    </Tooltip>
  );
}
