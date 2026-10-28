import { createStore, type StoreApi } from "zustand/vanilla";

import type {
  Backend,
  Chat,
  ChatGroup,
  Message,
  MessagePart,
  PermissionRequest,
  ProjectEvent,
  QuestionRequest,
} from "~/backend/types";

/**
 * Live state of one open project: its chats, the messages of chats the person
 * opened, and pending permission and question requests. Fed by backend reads
 * and the project's event stream; streaming deltas land here, not in React
 * Query, so a token costs one small immutable update.
 */

export type LoadState = "loading" | "ready" | "error";

export type ProjectState = {
  chats: Record<string, Chat>;
  chatsState: LoadState;
  nextCursor: string | null;
  loadingMore: boolean;
  groups: ChatGroup[];
  assignments: Record<string, string>;
  messages: Record<string, { state: LoadState; list: Message[] }>;
  permissions: Record<string, PermissionRequest[]>;
  questions: Record<string, QuestionRequest[]>;
  connection: "open" | "reconnecting";
};

export type ProjectRuntime = {
  projectId: string;
  store: StoreApi<ProjectState>;
  retain(): () => void;
  reload(): Promise<void>;
  loadMore(): Promise<void>;
  ensureMessages(chatId: string, force?: boolean): Promise<void>;
  ensureInteractions(chatId: string): Promise<void>;
  addLocalMessage(chatId: string, text: string, files: { name: string; mime: string }[]): string;
  removeLocalMessage(chatId: string, messageId: string): void;
  upsertChat(chat: Chat): void;
  removeChat(chatId: string): void;
  dropPermission(chatId: string, requestId: string): void;
  dropQuestion(chatId: string, requestId: string): void;
  reloadGroups(): Promise<void>;
};

const initial = (): ProjectState => ({
  chats: {},
  chatsState: "loading",
  nextCursor: null,
  loadingMore: false,
  groups: [],
  assignments: {},
  messages: {},
  permissions: {},
  questions: {},
  connection: "open",
});

/** Optimistic copies: `local-` until the engine took the turn, then `sent-`. */
export function isOptimistic(message: Message): boolean {
  return message.id.startsWith("local-") || message.id.startsWith("sent-");
}

function userText(message: Message): string {
  return message.parts.map((part) => (part.type === "text" ? part.text : "")).join("").trim();
}

/** Does the engine's history already hold this optimistic message? */
function confirmedBy(local: Message, list: Message[]): boolean {
  const text = userText(local);
  return list.some((entry) => entry.role === "user" && !isOptimistic(entry) && userText(entry) === text && entry.createdAt >= local.createdAt - 15_000);
}

function upsertMessage(list: Message[], message: Message): Message[] {
  const index = list.findIndex((entry) => entry.id === message.id);
  if (index === -1) {
    // A user message from the engine replaces the optimistic copy we showed.
    const withoutLocal = message.role === "user" ? list.filter((entry) => !(isOptimistic(entry) && confirmedBy(entry, [message]))) : list;
    return [...withoutLocal, message].sort((a, b) => a.createdAt - b.createdAt);
  }
  const next = [...list];
  const previous = next[index];
  // Keep parts we streamed when the engine sends message info without parts.
  next[index] = previous && message.parts.length === 0 ? { ...message, parts: previous.parts } : message;
  return next;
}

function upsertPart(message: Message, part: MessagePart): Message {
  const index = message.parts.findIndex((entry) => entry.id === part.id);
  const parts = [...message.parts];
  if (index === -1) parts.push(part);
  else parts[index] = part;
  return { ...message, parts };
}

function appendDelta(message: Message, partId: string, delta: string): Message {
  const index = message.parts.findIndex((entry) => entry.id === partId);
  const parts = [...message.parts];
  const part = parts[index];
  if (!part) {
    parts.push({ type: "text", id: partId, text: delta });
  } else if (part.type === "text" || part.type === "reasoning") {
    parts[index] = { ...part, text: part.text + delta };
  }
  return { ...message, parts };
}

export function createProjectRuntime(backend: Backend, projectId: string): ProjectRuntime {
  const store = createStore<ProjectState>(initial);
  let holders = 0;
  let unsubscribe: (() => void) | null = null;
  let wasConnected = false;

  const set = store.setState;
  const get = store.getState;

  const patchMessages = (chatId: string, update: (list: Message[]) => Message[]) => {
    const current = get().messages[chatId];
    if (!current) return;
    set({ messages: { ...get().messages, [chatId]: { ...current, list: update(current.list) } } });
  };

  const patchMessage = (chatId: string, messageId: string, update: (message: Message) => Message) => {
    patchMessages(chatId, (list) => {
      const index = list.findIndex((entry) => entry.id === messageId);
      if (index === -1) {
        // A part for a message we have not seen: start it, the next read fills it in.
        const now = Date.now();
        return [...list, update({ id: messageId, chatId, role: "assistant", createdAt: now, completedAt: null, parts: [], model: null, tokens: null, error: null })];
      }
      const next = [...list];
      const message = next[index];
      if (message) next[index] = update(message);
      return next;
    });
  };

  const runtime: ProjectRuntime = {
    projectId,
    store,

    retain() {
      holders += 1;
      if (holders === 1) {
        unsubscribe = backend.subscribe(projectId, apply);
        void runtime.reload();
      }
      return () => {
        holders -= 1;
        if (holders === 0) {
          unsubscribe?.();
          unsubscribe = null;
        }
      };
    },

    async reload() {
      if (Object.keys(get().chats).length === 0) set({ chatsState: "loading" });
      try {
        const [page, groups] = await Promise.all([backend.chats.list(projectId, null), backend.groups.list(projectId).catch(() => null)]);
        const chats: Record<string, Chat> = {};
        for (const chat of page.items) chats[chat.id] = chat;
        set({ chats, chatsState: "ready", nextCursor: page.nextCursor, ...(groups ? { groups: groups.groups, assignments: groups.assignments } : {}) });
      } catch {
        set({ chatsState: get().chatsState === "ready" ? "ready" : "error" });
      }
      // Catch up chats the person has open: the event stream has no replay.
      for (const [chatId, entry] of Object.entries(get().messages)) {
        if (entry.state !== "loading") void runtime.ensureMessages(chatId, true);
      }
    },

    async loadMore() {
      const cursor = get().nextCursor;
      if (!cursor || get().loadingMore) return;
      set({ loadingMore: true });
      try {
        const page = await backend.chats.list(projectId, cursor);
        const chats = { ...get().chats };
        for (const chat of page.items) chats[chat.id] = chat;
        set({ chats, nextCursor: page.nextCursor });
      } finally {
        set({ loadingMore: false });
      }
    },

    async ensureMessages(chatId, force = false) {
      const existing = get().messages[chatId];
      if (existing && !force && existing.state !== "error") return;
      if (!existing || existing.state === "error") set({ messages: { ...get().messages, [chatId]: { state: "loading", list: existing?.list ?? [] } } });
      try {
        const list = await backend.chats.messages(projectId, chatId);
        const local = (get().messages[chatId]?.list ?? []).filter((message) => isOptimistic(message) && !confirmedBy(message, list));
        const merged = [...list, ...local].sort((a, b) => a.createdAt - b.createdAt);
        set({ messages: { ...get().messages, [chatId]: { state: "ready", list: merged } } });
      } catch {
        const current = get().messages[chatId];
        set({ messages: { ...get().messages, [chatId]: { state: current?.list.length ? "ready" : "error", list: current?.list ?? [] } } });
      }
      void runtime.ensureInteractions(chatId);
    },

    async ensureInteractions(chatId) {
      const [permissions, questions] = await Promise.all([
        backend.interactions.permissions(projectId, chatId).catch(() => null),
        backend.interactions.questions(projectId, chatId).catch(() => null),
      ]);
      if (permissions) set({ permissions: { ...get().permissions, [chatId]: permissions } });
      if (questions) set({ questions: { ...get().questions, [chatId]: questions } });
    },

    addLocalMessage(chatId, text, files) {
      const id = `local-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const now = Date.now();
      const message: Message = {
        id,
        chatId,
        role: "user",
        createdAt: now,
        completedAt: now,
        parts: [{ type: "text", id: `${id}:t`, text }, ...files.map((file, index) => ({ type: "file" as const, id: `${id}:f${index}`, filename: file.name, mime: file.mime, url: null }))],
        model: null,
        tokens: null,
        error: null,
      };
      const current = get().messages[chatId];
      set({ messages: { ...get().messages, [chatId]: { state: current?.state ?? "ready", list: [...(current?.list ?? []), message] } } });
      return id;
    },

    removeLocalMessage(chatId, messageId) {
      patchMessages(chatId, (list) => list.filter((entry) => entry.id !== messageId));
    },

    upsertChat(chat) {
      set({ chats: { ...get().chats, [chat.id]: { ...get().chats[chat.id], ...chat } } });
    },

    removeChat(chatId) {
      const { [chatId]: _removed, ...chats } = get().chats;
      const { [chatId]: _messages, ...messages } = get().messages;
      set({ chats, messages });
    },

    dropPermission(chatId, requestId) {
      set({ permissions: { ...get().permissions, [chatId]: (get().permissions[chatId] ?? []).filter((entry) => entry.id !== requestId) } });
    },

    dropQuestion(chatId, requestId) {
      set({ questions: { ...get().questions, [chatId]: (get().questions[chatId] ?? []).filter((entry) => entry.id !== requestId) } });
    },

    async reloadGroups() {
      const groups = await backend.groups.list(projectId).catch(() => null);
      if (groups) set({ groups: groups.groups, assignments: groups.assignments });
    },
  };

  function apply(event: ProjectEvent) {
    switch (event.type) {
      case "connection":
        if (event.state === "open" && wasConnected && get().connection === "reconnecting") void runtime.reload();
        if (event.state === "open") wasConnected = true;
        set({ connection: event.state });
        return;
      case "chat.upserted": {
        const previous = get().chats[event.chat.id];
        runtime.upsertChat(event.chat);
        if (previous && previous.status !== "waiting" && event.chat.status === "waiting" && get().messages[event.chat.id]) void runtime.ensureInteractions(event.chat.id);
        return;
      }
      case "chat.deleted":
        runtime.removeChat(event.chatId);
        return;
      case "chat.status": {
        const chat = get().chats[event.chatId];
        if (chat) set({ chats: { ...get().chats, [event.chatId]: { ...chat, status: event.status } } });
        // The engine took the turn: the optimistic message is no longer pending.
        if (event.status === "running" || event.status === "waiting") {
          patchMessages(event.chatId, (list) => (list.some((entry) => entry.id.startsWith("local-")) ? list.map((entry) => (entry.id.startsWith("local-") ? { ...entry, id: entry.id.replace(/^local-/, "sent-") } : entry)) : list));
        }
        return;
      }
      case "message.upserted":
        patchMessages(event.message.chatId, (list) => upsertMessage(list, event.message));
        return;
      case "message.removed":
        patchMessages(event.chatId, (list) => list.filter((entry) => entry.id !== event.messageId));
        return;
      case "part.upserted":
        patchMessage(event.chatId, event.messageId, (message) => upsertPart(message, event.part));
        return;
      case "part.delta":
        patchMessage(event.chatId, event.messageId, (message) => appendDelta(message, event.partId, event.delta));
        return;
      case "history.changed":
        if (get().messages[event.chatId]) void runtime.ensureMessages(event.chatId, true);
        return;
      case "permission.asked": {
        const list = (get().permissions[event.request.chatId] ?? []).filter((entry) => entry.id !== event.request.id);
        set({ permissions: { ...get().permissions, [event.request.chatId]: [...list, event.request] } });
        return;
      }
      case "permission.resolved":
        runtime.dropPermission(event.chatId, event.requestId);
        return;
      case "question.asked": {
        const list = (get().questions[event.request.chatId] ?? []).filter((entry) => entry.id !== event.request.id);
        set({ questions: { ...get().questions, [event.request.chatId]: [...list, event.request] } });
        return;
      }
      case "question.resolved":
        runtime.dropQuestion(event.chatId, event.requestId);
        return;
      case "groups.changed":
        void runtime.reloadGroups();
        return;
    }
  }

  return runtime;
}

const runtimes = new Map<string, ProjectRuntime>();

/** One runtime per project for the app's lifetime; only retained ones listen. */
export function projectRuntime(backend: Backend, projectId: string): ProjectRuntime {
  let runtime = runtimes.get(projectId);
  if (!runtime) {
    runtime = createProjectRuntime(backend, projectId);
    runtimes.set(projectId, runtime);
  }
  return runtime;
}
