# Project compiler skills

These are thin runtime entry points. The complete, portable procedures live in `HARNASS/workflows/`; read the referenced workflow before carrying out the task. Claude Code loads these as project skills. OpenCode also discovers project skills in the Claude-compatible `.claude/skills/` location.

## Available skills

- [`project-onboard`](project-onboard/SKILL.md) — define the project context and turn a copied starter into a clean project-specific compiler.
- [`setup-project-profile`](setup-project-profile/SKILL.md) — create the ignored local contributor profile and optionally an explicitly approved shared person page.
- [`compile-source`](compile-source/SKILL.md) — integrate selected raw sources into linked, evidence-grounded wiki knowledge.
- [`build-project-output`](build-project-output/SKILL.md) — answer or create a deliverable from the wiki with traceable support.
- [`maintain-glossary`](maintain-glossary/SKILL.md) — curate jargon, definitions, preferred terms, aliases, and terms to avoid.
- [`review-project-knowledge`](review-project-knowledge/SKILL.md) — inspect review items, contradictions, evidence quality, and possible staleness.
- [`record-project-decision`](record-project-decision/SKILL.md) — capture a confirmed project decision with rationale, authority, and affected knowledge.

## Trial prompts

Use these when testing the boilerplate in a real project:

1. `/project-onboard`: “This is a copied compiler starter for our fleet electrification project. Interview me about the project, then show the CLAUDE.md changes and identify which sample files are unrelated before changing them.”
2. `/setup-project-profile`: “Set up my profile. I lead research and own evidence standards. Keep collaboration preferences local; show me a proposed shared wiki profile with only my role and decision scope.”
3. `/compile-source`: “Compile the newly added supplier specification in raw/. Compare it with the existing charging requirements page and flag any conflicts; don't overwrite the source.”
4. `/build-project-output`: “Create a two-page decision brief for the steering group from the wiki on charging-site options. Separate sourced findings from recommendations and flag gaps.”
5. `/review-project-knowledge`: “Review the open queue and check the relevant pages for conflicts or claims that may be stale. Suggest resolutions, but don't decide for us.”
6. `/record-project-decision`: “We decided to pilot depot charging at two sites. Draft a decision record with rationale and owner, and show it to me before adding it to the wiki.”
7. `/maintain-glossary`: “Our supplier calls it a ‘charging hub’, but the operations team says ‘depot charging site’. Check existing usage and sources, then propose a glossary entry. Don't mark one term preferred until I confirm.”

Review whether the workflows preserve source material, ask rather than guess, respect local/shared boundaries, and wait for approval on consequential shared decisions.
