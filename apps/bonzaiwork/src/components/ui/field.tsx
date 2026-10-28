import { forwardRef, useId, useImperativeHandle, useRef, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";

import { copy } from "~/copy";
import { cn } from "~/lib/cn";

const CONTROL =
  "w-full bg-background px-3.5 text-sm text-foreground ring-1 ring-inset ring-input placeholder:text-subtle-foreground transition-[box-shadow] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 aria-invalid:ring-red-9 max-sm:text-[16px]";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(CONTROL, "h-8 rounded-full pointer-coarse:h-10", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(CONTROL, "min-h-20 resize-y rounded-2xl py-2.5 leading-relaxed", className)} {...props} />;
});

/** Label above, control, then an error or hint. One of hint or error, never both. */
export function Field(props: { label: ReactNode; hint?: ReactNode; error?: string | null; optional?: boolean; children: (id: string, describedBy: string | undefined) => ReactNode; className?: string }) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = props.error ?? props.hint;
  return (
    <div className={cn("flex flex-col gap-1.5", props.className)}>
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {props.label}
        {props.optional ? <span className="ms-1.5 font-normal text-subtle-foreground">({copy.common.optional})</span> : null}
      </label>
      {props.children(id, message ? messageId : undefined)}
      {message ? (
        <p id={messageId} className={cn("text-xs", props.error ? "text-destructive-foreground" : "text-muted-foreground")} role={props.error ? "alert" : undefined}>
          {message}
        </p>
      ) : null}
    </div>
  );
}

export type SecretInputHandle = { take(): string; focus(): void; clear(): void };

/**
 * A key field that never renders its value back into React state, so the key
 * can't leak through devtools, re-renders or error reports (OpenWork's
 * secret-input pattern). The value travels once, via take().
 */
export const SecretInput = forwardRef<SecretInputHandle, { id: string; placeholder?: string; disabled?: boolean; autoFocus?: boolean; invalid?: boolean; describedBy?: string; testId?: string; onPresenceChange?: (present: boolean) => void; onSubmit?: () => void }>(
  function SecretInput(props, ref) {
    const input = useRef<HTMLInputElement>(null);
    const [visible, setVisible] = useState(false);
    useImperativeHandle(ref, () => ({
      take() {
        const value = input.current?.value ?? "";
        if (input.current) input.current.value = "";
        props.onPresenceChange?.(false);
        return value;
      },
      focus() {
        input.current?.focus();
      },
      clear() {
        if (input.current) input.current.value = "";
        props.onPresenceChange?.(false);
      },
    }));
    return (
      <div className="relative">
        <input
          ref={input}
          id={props.id}
          type={visible ? "text" : "password"}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          placeholder={props.placeholder}
          disabled={props.disabled}
          autoFocus={props.autoFocus}
          aria-invalid={props.invalid || undefined}
          aria-describedby={props.describedBy}
          data-testid={props.testId}
          data-1p-ignore=""
          data-lpignore="true"
          className={cn(CONTROL, "h-9 rounded-full pe-10 font-mono pointer-coarse:h-10")}
          onInput={(event) => props.onPresenceChange?.(event.currentTarget.value.trim().length > 0)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              props.onSubmit?.();
            }
          }}
        />
        <button
          type="button"
          className="absolute inset-y-0 end-0 flex w-10 items-center justify-center rounded-e-full text-muted-foreground hover:text-foreground"
          onClick={() => setVisible((value) => !value)}
          aria-label={visible ? copy.keys.hide : copy.keys.show}
          aria-pressed={visible}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    );
  },
);
