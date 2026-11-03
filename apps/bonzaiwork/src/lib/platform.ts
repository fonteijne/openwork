/**
 * Which keyboard the person has. `navigator.platform` is deprecated and wrong on an iPad with a
 * desktop user agent, so `userAgentData` comes first and the user agent string last.
 */
function detectMac(): boolean {
  if (typeof navigator === "undefined") return false;
  const data: unknown = Reflect.get(navigator, "userAgentData");
  const platform: unknown = typeof data === "object" && data !== null ? Reflect.get(data, "platform") : null;
  const name = typeof platform === "string" && platform ? platform : navigator.platform || navigator.userAgent;
  return /Mac|iPhone|iPad|iPod/i.test(name);
}

export const isMac: boolean = detectMac();

/** The modifier shown in chords: ⌘ on Apple keyboards, Ctrl elsewhere (brief §4). */
export const MOD: string = isMac ? "⌘" : "Ctrl";
export const SHIFT: string = isMac ? "⇧" : "Shift";

/** "⌘⇧N" on a Mac, "Ctrl+Shift+N" elsewhere. */
export function chordLabel(key: string, options: { shift?: boolean } = {}): string {
  const parts = [MOD, ...(options.shift ? [SHIFT] : []), key];
  return isMac ? parts.join("") : parts.join("+");
}
