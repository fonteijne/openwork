import { useEffect, useRef, useState } from "react";
import { ArrowUp, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { copy } from "~/copy";
import type { BonzaiworkStatus } from "~/lib/bonzaiwork-api";
import type { ServerConnection } from "~/lib/connection";
import { readMessages, sendMessage, startChat, type ChatMessage, type Workspace } from "~/lib/workspace-chat";

const POLL_MS = 600;

/**
 * A minimal chat on the workspace's OpenCode v2 session. Replaces importing
 * upstream's session domain, which pulls in Den, analytics and their whole
 * provider stack (see docs/bonzaiwork/README.md).
 */
export function ChatView(props: {
  connection: ServerConnection;
  workspace: Workspace;
  status: BonzaiworkStatus;
  sessionId: string | null;
  onSession: (sessionId: string | null) => void;
}) {
  const { connection, workspace, sessionId } = props;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [model, setModel] = useState<string | null>(props.status.defaultModel);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!model || !props.status.models.some((entry) => entry.id === model)) setModel(props.status.defaultModel);
  }, [props.status.models, props.status.defaultModel, model]);

  useEffect(() => {
    if (!sessionId) {
      setMessages([]);
      setBusy(false);
      setFailed(false);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const next = await readMessages(connection, workspace, sessionId);
        if (cancelled) return;
        setMessages(next.messages);
        setBusy(next.busy);
        setFailed(next.failed);
        if (next.busy) timer = setTimeout(() => void poll(), POLL_MS);
      } catch (failure) {
        if (!cancelled) setError(failure instanceof Error ? failure.message : String(failure));
      }
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [connection, workspace, sessionId, busy]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length, messages.at(-1)?.text]);

  const send = async () => {
    const text = draft.trim();
    if (!text || !model || busy) return;
    setError(null);
    setDraft("");
    // Keep the person's message on screen while the engine admits it (P11).
    setMessages((current) => [...current, { id: `local-${Date.now()}`, role: "user", text, pending: false, failed: false }]);
    try {
      const id = sessionId ?? await startChat(connection, workspace, model);
      if (!sessionId) props.onSession(id);
      await sendMessage(connection, workspace, id, model, text);
      setBusy(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  const workspaceKey = props.status.workspaces.find((entry) => entry.id === workspace.id);
  const keyMissing = props.status.keyMode === "workspace" && !workspaceKey?.hasKey;

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <h2 className="truncate text-sm font-semibold text-foreground">{workspace.displayName || workspace.name}</h2>
        <Button size="sm" variant="ghost" onClick={() => props.onSession(null)} disabled={!sessionId} data-testid="new-chat">
          <Plus />
          {copy.newChat}
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6" data-testid="chat-messages">
        <div className="mx-auto flex max-w-2xl flex-col gap-4">
          {messages.length === 0 && !busy ? (
            <p className="py-16 text-center text-sm text-muted-foreground">{keyMissing ? copy.workspaceKeyMissing : copy.emptyChat}</p>
          ) : null}
          {messages.map((message) => (
            <div
              key={message.id}
              data-role={message.role}
              className={message.role === "user"
                ? "self-end max-w-[85%] rounded-2xl bg-muted px-3.5 py-2 text-sm whitespace-pre-wrap text-foreground"
                : "self-start max-w-full text-sm whitespace-pre-wrap text-foreground"}
            >
              {message.text || (message.pending ? <span className="inline-block h-4 w-24 animate-pulse rounded bg-muted" /> : null)}
            </div>
          ))}
          {busy && messages.at(-1)?.role === "user" ? (
            <span className="inline-block h-4 w-24 animate-pulse self-start rounded bg-muted" aria-label="Antwoord wordt geschreven" />
          ) : null}
          {failed && !busy ? <p className="text-sm text-destructive" role="alert">{copy.answerFailed}</p> : null}
          {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
          <div ref={bottom} />
        </div>
      </div>

      <form
        className="mx-auto mb-4 flex w-full max-w-2xl flex-col gap-2 rounded-[var(--dls-radius)] border border-border bg-background p-3 shadow-[var(--dls-card-shadow)]"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder={copy.composerPlaceholder}
          rows={2}
          className="min-h-12 resize-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
          data-testid="composer-input"
        />
        <div className="flex items-center justify-between gap-2">
          {props.status.models.length ? (
            <Select value={model} items={props.status.models.map((entry) => ({ value: entry.id, label: entry.name ?? entry.id }))} onValueChange={(value) => { if (value) setModel(value); }}>
              <SelectTrigger size="sm" aria-label={copy.model} data-testid="model-picker">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {props.status.models.map((entry) => <SelectItem key={entry.id} value={entry.id}>{entry.name ?? entry.id}</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
          ) : (
            <span className="text-sm text-muted-foreground">{copy.noModels}</span>
          )}
          <Button type="submit" size="icon-sm" className="rounded-full" disabled={!draft.trim() || !model || busy || keyMissing} aria-label={copy.send} data-testid="composer-send">
            <ArrowUp />
          </Button>
        </div>
      </form>
    </section>
  );
}
