import { useState, type ReactElement } from "react";
import { Archive, ArchiveRestore, FolderInput, GitFork, Pencil, Pin, PinOff, Plus, Trash2 } from "lucide-react";

import { useBackend } from "~/backend/context";
import type { Chat } from "~/backend/types";
import { PromptDialog } from "~/components/prompt-dialog";
import { Menu, MenuItem, MenuSeparator, SubMenu } from "~/components/ui/menu";
import { ConfirmDialog } from "~/components/ui/overlay";
import { toast } from "~/components/ui/toast";
import { copy } from "~/copy";
import { errorText } from "~/lib/errors";
import { navigate, useRoute } from "~/lib/router";

import { useProjectState, useRuntime } from "../project/runtime";

/** Everything you can do to a chat, from its row and from its header (DESIGN.md S6: one action, one home). */
export function ChatActions(props: { chat: Chat; trigger: ReactElement<Record<string, unknown>> }) {
  const backend = useBackend();
  const runtime = useRuntime();
  const route = useRoute();
  const groups = useProjectState((state) => state.groups);
  const [renaming, setRenaming] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const { chat } = props;
  const projectId = chat.projectId;

  const run = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch (failure) {
      toast(errorText(failure), { tone: "error" });
    }
  };

  const setPinned = (pinned: boolean) =>
    run(async () => {
      runtime.upsertChat({ ...chat, pinned });
      await backend.chats.setPinned(projectId, chat.id, pinned);
    });

  const setArchived = (archived: boolean) =>
    run(async () => {
      runtime.upsertChat({ ...chat, archived });
      await backend.chats.setArchived(projectId, chat.id, archived);
      toast(archived ? copy.chat.archived : copy.chat.restored, {
        action: { label: copy.common.undo, onClick: () => void setArchived(!archived) },
      });
    });

  const assign = (groupId: string | null) =>
    run(async () => {
      runtime.upsertChat({ ...chat, groupId });
      await backend.groups.assign(projectId, chat.id, groupId);
      await runtime.reloadGroups();
    });

  const fork = () =>
    run(async () => {
      const copyChat = await backend.chats.fork(projectId, chat.id, null);
      runtime.upsertChat(copyChat);
      toast(copy.chat.forked);
      navigate({ name: "project", projectId, chatId: copyChat.id });
    });

  const remove = async () => {
    setBusy(true);
    try {
      await backend.chats.remove(projectId, chat.id);
      runtime.removeChat(chat.id);
      setDeleting(false);
      toast(copy.chat.removed);
      if (route.name === "project" && route.chatId === chat.id) navigate({ name: "project", projectId, chatId: null }, { replace: true });
    } catch (failure) {
      toast(errorText(failure), { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Menu trigger={props.trigger} align="end">
        <MenuItem icon={<Pencil />} onClick={() => setRenaming(true)}>
          {copy.chat.rename}
        </MenuItem>
        <MenuItem icon={chat.pinned ? <PinOff /> : <Pin />} onClick={() => void setPinned(!chat.pinned)}>
          {chat.pinned ? copy.chat.unpin : copy.chat.pin}
        </MenuItem>
        {!chat.parentId ? (
          <SubMenu icon={<FolderInput />} label={copy.chatList.moveTo}>
            <MenuItem checked={!chat.groupId} onClick={() => void assign(null)}>
              {copy.chatList.noGroup}
            </MenuItem>
            {groups.map((group) => (
              <MenuItem key={group.id} checked={chat.groupId === group.id} onClick={() => void assign(group.id)}>
                {group.label}
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuItem icon={<Plus />} onClick={() => setCreatingGroup(true)}>
              {copy.chatList.newGroup}
            </MenuItem>
          </SubMenu>
        ) : null}
        <MenuItem icon={<GitFork />} onClick={() => void fork()}>
          {copy.chat.fork}
        </MenuItem>
        <MenuItem icon={chat.archived ? <ArchiveRestore /> : <Archive />} onClick={() => void setArchived(!chat.archived)}>
          {chat.archived ? copy.chat.unarchive : copy.chat.archive}
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={<Trash2 />} danger onClick={() => setDeleting(true)}>
          {copy.chat.remove}
        </MenuItem>
      </Menu>

      <PromptDialog
        open={renaming}
        onOpenChange={setRenaming}
        title={copy.chat.rename}
        label={copy.settings.name}
        initialValue={chat.title}
        submitLabel={copy.settings.save}
        onSubmit={async (title) => {
          const renamed = await backend.chats.rename(projectId, chat.id, title);
          runtime.upsertChat(renamed);
          toast(copy.chat.renamed);
        }}
      />
      <PromptDialog
        open={creatingGroup}
        onOpenChange={setCreatingGroup}
        title={copy.chatList.newGroup}
        label={copy.chatList.groupName}
        placeholder="Bijv. Nieuwe klanten"
        submitLabel={copy.settings.add}
        onSubmit={async (label) => {
          const group = await backend.groups.create(projectId, label);
          await backend.groups.assign(projectId, chat.id, group.id);
          runtime.upsertChat({ ...chat, groupId: group.id });
          await runtime.reloadGroups();
        }}
      />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={copy.chat.removeTitle}
        body={copy.chat.removeBody}
        confirmLabel={copy.chat.removeConfirm}
        onConfirm={() => void remove()}
        busy={busy}
      />
    </>
  );
}
