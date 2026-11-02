/// <reference types="vite/client" />

/** The app version from package.json, set by vite.config.ts. */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** owner/repo that feedback issues go to (docs/bonzaiwork/feedback.md). */
  readonly VITE_BONZAIWORK_FEEDBACK_REPO?: string;
}
