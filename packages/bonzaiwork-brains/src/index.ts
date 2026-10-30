export { createGit, GitError, safetyConfig, type Git, type GitOptions, type GitResult, type GitRunOptions } from "./git.ts";
export { parseRemote, knownHostsName, type RemoteLink, type RemoteParse } from "./remote.ts";
export {
  BUNDLED_KNOWN_HOSTS, checkConnection, classifyGitError, ensureKnownHosts, scanHostKeys, sshArguments, sshCommand,
  systemSshPath, trustHostKeys, type ConnectionCheck, type RemoteProblem, type ScannedHost, type SshOptions,
} from "./ssh.ts";
export { remoteProblemMessage, SYNC_MESSAGES } from "./messages.ts";
export { scanForSecrets, secretInContent, secretInName, type SecretHit } from "./secrets.ts";
export { commandRunsShell, findTrustItems, mcpServerNames, riskKind, type TrustItem, type TrustKind } from "./trust.ts";
export {
  BrainCloneError, BrainSync, type Author, type BrainKind, type BrainMode, type BrainRecord, type BrainState,
  type BrainStatus, type BrainSyncOptions, type TurnResult, type Unshared,
} from "./sync.ts";
