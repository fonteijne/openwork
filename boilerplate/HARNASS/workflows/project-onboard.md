# Project onboarding

## Purpose

Configure a copied brain-compiler starter for one real project without carrying boilerplate claims forward as if they were project knowledge. Onboarding changes shared project files; the project owner reviews the proposed scope and any consequential edits.

## 1. Inspect before editing

Read `README.md`, `CLAUDE.md`, `AGENTS.md`, `wiki/index.md`, `wiki/_review-queue.md`, and the README files under `raw/` and `output/`. Inventory files in `raw/`, `wiki/`, `output/`, and `templates/`. Identify which are generic scaffolding and which contain sample or project-specific material. Do not delete files based only on their names.

## 2. Interview for project context

Ask one focused question at a time. Establish:

1. Project name and concise purpose.
2. Scope: what belongs in this brain and what is explicitly out of scope.
3. Intended outcomes and who will use the compiled knowledge or outputs.
4. What counts as a reliable source, and any required evidence or review standards beyond the starter defaults.
5. Important terminology: domain jargon, acronyms, preferred names, synonyms, terms with project-specific meanings, and terms to avoid. Ask whether definitions come from authoritative sources or are conventions agreed by the project team.
6. Who should review consequential synthesis or resolve conflicts, by role or named person if supplied.

The user may skip questions. Do not invent answers or write their individual contributor profile here; use `/setup-project-profile` for that. If the project already has written context, summarize it for confirmation rather than asking the person to repeat it.

## 3. Propose the project charter

Draft a compact `CLAUDE.md` update from confirmed answers. Include purpose, scope/in-scope and out-of-scope boundaries, intended audience/outcomes, and any project-specific evidence/review rules. Retain the compiler's source-handling, provenance, uncertainty, human-review, and private-profile safeguards. Keep detailed task procedures in HARNASS workflows, not duplicated in the root guide.

Before applying changes, show the proposed charter and ask for confirmation when it materially changes the starter's operating rules or states consequential project boundaries. Do not present an inference as a confirmed fact.

## 4. Classify starter material

For every existing `raw/`, `wiki/`, or `output/` content item, classify it as:

- **Keep** — generic structure or genuinely relevant confirmed project content.
- **Adapt** — a scaffold that should be rewritten for the target project.
- **Archive/remove** — sample content unrelated to the target project.

Present the proposed adapt/archive/remove list. Never silently delete or overwrite source material, or erase unreviewed notes. For unrelated sample content, prefer an explicit archive/move plan or request the user's approval before removal. If the user does not approve cleanup, clearly mark the items as starter examples to avoid treating them as knowledge.

Initialize `wiki/glossary.md` with only terminology the project owner confirms or sources support. Leave the glossary empty except for its instructions when no terms are established; do not invent plausible-sounding definitions. Capture uncertain or conflicting usage as a review item. Update index entries when pages are added, renamed, or reorganized. Keep an honest empty review queue rather than importing sample queue state.

## 5. Apply and verify

After required confirmation, make the smallest useful changes. Check that README onboarding instructions, `CLAUDE.md`, glossary, index, review queue, and folder guides agree with the actual project. Verify links and inspect changes. Confirm `.local/profile.md` remains ignored and is not included in shared content. Report remaining starter examples, assumptions requiring validation, and the suggested next steps: set up a local profile, add selected sources, and compile the first source.
