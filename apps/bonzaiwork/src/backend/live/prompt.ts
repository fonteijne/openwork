/**
 * An OpenCode v2 prompt is one string. BonzaiWork encodes attachments the way
 * OpenWork does (apps/app/src/app/lib/v2-prompt-context.ts), so chats stay
 * readable in both apps:
 *  - an attached file is marked in place: `<attachment>name</attachment>`;
 *  - pasted text is wrapped in `<pasted-text>`;
 *  - hidden context (the attachment paths for tools) follows in one
 *    `<openwork-context>` block.
 */

export type PromptAttachment = { filename: string; workspacePath: string; url: string; bytes: number };

const NOTE_HEADER = "Attached files were copied into this worker workspace for tool access:";
const NOTE_FOOTER = "Use these paths with Read/Bash/MCP/Docling when a tool needs the file bytes.";
const CONTEXT_RE = /(?:^|\n\n)<openwork-context>\n([\s\S]*)\n<\/openwork-context>$/;
const NOTE_RE = /Attached files were copied into this worker workspace for tool access:\n((?:- [^\n]*\n)*)Use these paths with Read\/Bash\/MCP\/Docling when a tool needs the file bytes\./;
const NOTE_LINE_RE = /^- ([^:\n]+?)(?: \((\d+(?:\.\d+)? (?:B|KB|MB|GB))\))?: .+ \((file:\/\/[^\n]*)\)$/;
const INLINE_RE = /<pasted-text>\n([\s\S]*?)\n<\/pasted-text>|<attachment>([^<>\n]+)<\/attachment>/g;
const UNITS = ["B", "KB", "MB", "GB"];

function formatBytes(bytes: number): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? Math.round(value) : Number(value.toFixed(1))} ${UNITS[unit]}`;
}

export function encodePrompt(words: string, attachments: PromptAttachment[]): string {
  if (!attachments.length) return words;
  const markers = attachments.map((item) => `<attachment>${item.filename}</attachment>`).join("");
  const note = [NOTE_HEADER, ...attachments.map((item) => `- ${item.filename} (${formatBytes(item.bytes)}): ${item.workspacePath} (${item.url})`), NOTE_FOOTER].join("\n");
  const body = words.trim() ? `${words}${markers}` : markers;
  return `${body}\n\n<openwork-context>\n${note}\n</openwork-context>`;
}

/** The words the person typed and the files they attached, from a stored prompt. */
export function decodePrompt(text: string): { words: string; files: string[] } {
  let words = text;
  let context: string | null = null;
  const block = text.match(CONTEXT_RE);
  if (block && block.index !== undefined) {
    words = text.slice(0, block.index);
    context = block[1] ?? null;
  } else {
    const note = text.match(NOTE_RE);
    if (note && note.index !== undefined) {
      words = `${text.slice(0, note.index)}${text.slice(note.index + note[0].length)}`;
      context = note[0];
    }
  }
  const files = new Set<string>();
  const plain = words.replace(INLINE_RE, (_match, pasted: string | undefined, file: string | undefined) => {
    if (file !== undefined) {
      files.add(file);
      return "";
    }
    return pasted ?? "";
  });
  const note = context?.match(NOTE_RE);
  if (note) {
    for (const line of note[0].split("\n")) {
      const match = line.match(NOTE_LINE_RE);
      if (match?.[1]) files.add(match[1]);
    }
  }
  return { words: plain.trim(), files: [...files] };
}
