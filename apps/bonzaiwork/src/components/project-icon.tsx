import {
  BookOpen,
  Briefcase,
  Calendar,
  ChartColumn,
  Code,
  FileText,
  Folder,
  Lightbulb,
  Mail,
  Megaphone,
  Scale,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { ProjectColor, ProjectIcon as ProjectIconName } from "~/backend/types";
import { cn } from "~/lib/cn";

export const PROJECT_ICON_COMPONENTS: Record<ProjectIconName, LucideIcon> = {
  folder: Folder,
  briefcase: Briefcase,
  "file-text": FileText,
  chart: ChartColumn,
  megaphone: Megaphone,
  users: Users,
  scale: Scale,
  lightbulb: Lightbulb,
  book: BookOpen,
  calendar: Calendar,
  mail: Mail,
  code: Code,
};

export function ProjectIcon(props: { icon: ProjectIconName; color: ProjectColor; size?: "sm" | "md" | "lg"; className?: string }) {
  const Icon = PROJECT_ICON_COMPONENTS[props.icon] ?? Folder;
  const size = props.size ?? "md";
  return (
    <span
      data-project-color={props.color}
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center bg-[var(--project-soft)] text-[var(--project-ink)]",
        size === "sm" && "size-5 rounded-[5px] [&_svg]:size-3",
        size === "md" && "size-7 rounded-md [&_svg]:size-4",
        size === "lg" && "size-10 rounded-lg [&_svg]:size-5",
        props.className,
      )}
    >
      <Icon strokeWidth={1.75} />
    </span>
  );
}
