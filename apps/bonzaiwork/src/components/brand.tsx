import { cn } from "~/lib/cn";

/** BonzaiWork's mark: three cloud pads on a bonsai trunk, in a pot. */
export function BrandMark(props: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-6 shrink-0", props.className)}>
      <rect width="32" height="32" rx="8" fill="var(--primary)" />
      <g fill="var(--primary-foreground)">
        <ellipse cx="11" cy="12" rx="5.2" ry="2.9" />
        <ellipse cx="20.5" cy="9" rx="5.6" ry="3" />
        <ellipse cx="21.5" cy="15.5" rx="3.8" ry="2.2" />
        <path d="M15.2 22.5c.3-2.6-1.6-3.9-1.4-6.1.1-1.3 1.4-2.3 2.9-3.1l.9 1.1c-1.1.6-2 1.3-2.1 2.1-.1 1.5 1.6 3 1.3 6z" />
        <path d="M9 22.5h14l-1.6 4.2c-.2.5-.6.8-1.1.8h-8.6c-.5 0-.9-.3-1.1-.8z" />
      </g>
    </svg>
  );
}
