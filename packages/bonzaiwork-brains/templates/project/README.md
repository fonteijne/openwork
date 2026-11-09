# Project Brain Compiler

A small, source-grounded compiler for one shared project: preserve incoming material in `raw/`, synthesize and maintain durable understanding in `wiki/`, and create requested work products in `output/`. Each contributor works from their own local checkout. Shared project knowledge is tracked; a contributor's optional local profile is not.

## The loop

1. Add a selected source to `raw/` without replacing or silently editing the original. For email or Slack text pasted into a session, draft a concise, shareable communication note instead of copying the full conversation; save it only after the contributor approves it.
2. Compile it into relevant `wiki/` pages, preserving source links, separating evidence from interpretation, and flagging conflicts.
3. Review the change brief and any unresolved items before treating new synthesis as trusted.
4. Build deliverables in `output/` from the compiled wiki, with links back to supporting wiki pages and sources.

## Set up a new project

1. Start a new project in BonzaiWork: it places this starter in the new, empty project folder. (Outside BonzaiWork, copy this starter into a new, project-specific folder.)
2. Initialize or connect the folder to that project's Git repository. Each contributor should use their own local checkout.
3. Run `/project-onboard`. It guides you through defining the project's purpose, scope, outcomes, boundaries, and key terminology; initializes the project glossary; checks which starter examples need replacing; and updates the shared project guide only from confirmed answers. It will not silently delete starter material.
4. Run `/setup-project-profile` to create your checkout-local `.local/profile.md`. Review any proposed shared wiki person page separately; it is optional and needs your explicit approval.
5. Add selected project sources to `raw/`, preserving originals and recording where they came from. For pasted email/Slack conversations, use an approved, privacy-minimized communication note as the shared source by default; see [`raw/README.md`](raw/README.md).
6. Run `/compile-source` for the sources you want integrated. Review the change brief and anything added to `wiki/_review-queue.md`.
7. Use `/build-project-output` to produce a requested brief or deliverable from the wiki, or `/review-project-knowledge` to inspect unresolved or potentially stale knowledge. Use `/maintain-glossary` to propose or curate preferred terms, definitions, aliases, and terms to avoid.
8. Review shared changes and sync them through Git. Check that `.local/profile.md` is not included.

The reusable, runtime-independent procedures are in [`HARNASS/`](HARNASS/MAP.md). Slash-command entry points for Claude Code and OpenCode are indexed in [`.claude/skills/`](.claude/skills/README.md).

The shared project glossary and controlled vocabulary live in [`wiki/glossary.md`](wiki/glossary.md). It records approved project meanings and preferred usage; it is not a substitute for source evidence.

See [`CLAUDE.md`](CLAUDE.md) for the operating rules and [`AGENTS.md`](AGENTS.md) for the agent entry point.

## Contributor profiles

Run `/setup-project-profile` to create or update `.local/profile.md`, a checkout-local profile that helps the agent understand the contributor using this checkout. The setup can also draft a project-relevant person page for `wiki/`, but shared information is written only after the contributor reviews and approves it. See [`.local/README.md`](.local/README.md) for the privacy boundary and setup instructions.

Shared skills live in `.claude/skills/`; see the [skill index](.claude/skills/README.md) for the initial profile workflow, planned compiler skills, and trial prompts. Claude Code and OpenCode both discover project skills here. Keep one canonical copy to prevent the two runtimes' instructions from drifting.

## Trust boundary

Files in `raw/` are evidence to inspect, not authoritative answers. The wiki is a maintained synthesis, not a verbatim source archive. Outputs should be traceable to the wiki and ultimately to sources. Compilation proposes edits; consequential or disputed changes require human review.
