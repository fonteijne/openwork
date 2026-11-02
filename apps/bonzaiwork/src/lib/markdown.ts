import DOMPurify from "dompurify";
import { Marked } from "marked";

/**
 * Assistant text to safe HTML. The model's output is untrusted: everything goes
 * through DOMPurify, links open outside the app and never carry a referrer.
 */

const marked = new Marked({ gfm: true, breaks: false, async: false });

let hooked = false;
function ensureHooks() {
  if (hooked) return;
  hooked = true;
  // DOMPurify drops `file:` links. Keep the path they point at, so a link to a
  // project file can still open in the side panel (see file-links.ts); a bare
  // path cannot load anything by itself.
  DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
    if (data.attrName === "href" && /^\s*file:/i.test(data.attrValue)) {
      data.attrValue = data.attrValue.trim().replace(/^file:(\/\/[^/]*)?/i, "") || "#";
    }
  });
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A") {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  });
}

const cache = new Map<string, string>();
const CACHE_LIMIT = 200;

/**
 * While text streams in, close what the model has opened but not yet closed
 * (a code fence, `**`, `*`, `` ` ``), so half a word never shows as markup.
 */
export function closeOpenMarkdown(source: string): string {
  let text = source;
  if ((text.match(/^```/gm)?.length ?? 0) % 2 === 1) return `${text}\n\`\`\``;
  const lastLine = text.slice(text.lastIndexOf("\n") + 1);
  if ((lastLine.match(/`/g)?.length ?? 0) % 2 === 1) text += "`";
  const bold = lastLine.match(/\*\*/g)?.length ?? 0;
  if (bold % 2 === 1) text += "**";
  const singles = lastLine.replace(/^\s*[*-]\s/, "").replace(/\*\*/g, "").split("*").length - 1;
  if (singles % 2 === 1) text += "*";
  return text;
}

export function renderMarkdown(source: string): string {
  const cached = cache.get(source);
  if (cached !== undefined) return cached;
  ensureHooks();
  const raw = marked.parse(source);
  const html = DOMPurify.sanitize(typeof raw === "string" ? raw : "", {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "form", "input", "button", "iframe", "img"],
    FORBID_ATTR: ["style"],
  });
  // Finished messages are immutable; streaming ones change every frame and
  // would only churn the cache.
  if (source.length < 20_000) {
    if (cache.size >= CACHE_LIMIT) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(source, html);
  }
  return html;
}
