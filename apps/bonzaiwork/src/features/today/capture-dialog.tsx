import { Dialog } from "~/components/ui/overlay";

/** Quick capture (design: Capture). Placeholder until the Today screens land. */
export function CaptureDialog(props: { open: boolean; onOpenChange: (open: boolean) => void; projectId: string | null }) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange} title="Vastleggen">
      <p className="m-0 text-base text-ink-muted">{props.projectId ?? ""}</p>
    </Dialog>
  );
}
