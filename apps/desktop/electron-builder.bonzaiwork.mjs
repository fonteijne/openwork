// BonzaiWork packaging config. Not YAML on purpose: electron-builder's
// `extends` unions arrays, so a YAML overlay could not replace upstream's UI
// in app-dist or drop its GitHub publish target. This file reads upstream's
// config as-is (later upstream changes still apply) and swaps only what is
// BonzaiWork's: the UI, the Electron entry, identity, and update feed.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
const load = (name) => YAML.parse(readFileSync(join(here, name), "utf8"));

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** electron-builder's own merge: objects deep, arrays as a union, later wins for scalars. */
function merge(target, source) {
  const result = { ...target };
  for (const [key, value] of Object.entries(source)) {
    const previous = result[key];
    if (isObject(previous) && isObject(value)) result[key] = merge(previous, value);
    else if (Array.isArray(previous) && Array.isArray(value)) result[key] = [...previous, ...value];
    else result[key] = value;
  }
  return result;
}

function resolveExtends(name) {
  const config = load(name);
  const { extends: parent, ...rest } = config;
  return parent ? merge(resolveExtends(parent.replace(/^\.\//, "")), rest) : rest;
}

const upstream = resolveExtends("electron-builder.yml");
const productName = "BonzaiWork";
const publishUrl = process.env.BONZAIWORK_PUBLISH_URL?.trim();

const withOurUi = (resources) => (resources ?? []).map((entry) =>
  isObject(entry) && entry.from === "../app/dist" ? { ...entry, from: "../bonzaiwork/dist" } : entry);

const config = {
  ...upstream,
  // O4: final appId and signing identity are still open.
  appId: "nl.bonzaiwork.desktop",
  productName,
  protocols: [],
  directories: { ...upstream.directories, output: "dist-electron/bonzaiwork" },
  extraMetadata: { main: "bonzaiwork/main.mjs", name: "bonzaiwork", productName, desktopName: "nl.bonzaiwork.desktop" },
  files: [...upstream.files, { from: "../bonzaiwork/dist-electron", to: "bonzaiwork" }],
  extraResources: withOurUi(upstream.extraResources),
  // No update feed until O4 names one; never OpenWork's GitHub releases.
  publish: publishUrl ? [{ provider: "generic", url: publishUrl }] : null,
  artifactName: "bonzaiwork-${os}-${arch}-${version}.${ext}",
  linux: { ...upstream.linux, executableName: "bonzaiwork" },
  mac: {
    ...upstream.mac,
    extendInfo: Object.fromEntries(Object.entries(upstream.mac?.extendInfo ?? {})
      .map(([key, value]) => [key, typeof value === "string" ? value.replaceAll("OpenWork", productName) : value])),
  },
};

export default config;
