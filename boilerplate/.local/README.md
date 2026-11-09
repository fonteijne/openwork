# Local contributor profile

This folder contains checkout-local context for the person using this working copy. It is intentionally not shared through Git.

## Create or update your profile

Use `/setup-project-profile` to answer a short interview and create `.local/profile.md`. The profile is for this contributor in this project—not a general biography. Include only details that help the agent collaborate with you, such as your project role, responsibilities, decision scope, preferred collaboration style, and attribution preferences.

At the beginning of a session, the project guide asks the agent to read `.local/profile.md` if it exists. Each person should use their own local checkout. Do not use a shared/synchronized checkout for multiple contributors.

## Privacy and sharing

- `.local/profile.md` is ignored by Git. Do not force-add it or copy it into a commit.
- The local profile is self-reported context, not evidence for project claims.
- The setup skill may offer to create a separate, project-relevant person page in `wiki/people/` (named `first-last.md`). Review the proposed content and approve it explicitly before it is written.
- Share only information appropriate for everyone with access to this project repository. Leave personal preferences or sensitive details local.
- A missing profile is fine; the agent should continue using shared project context and ask only when contributor-specific context matters.

## Suggested profile contents

The setup skill uses a guided interview and may include:

- name or preferred attribution
- project role and areas of responsibility
- decisions the contributor owns, contributes to, or cannot make alone
- expertise or context relevant to this project
- collaboration preferences and task types they prefer
- what should remain private and not be written to the shared wiki

Do not fill this template by guessing. Create the profile through the setup skill or from information the contributor explicitly provides.

## Suggested first-run checks

When trying this boilerplate in a project, check that the setup skill:

1. Creates a useful `.local/profile.md` from the contributor's answers without adding it to shared project content.
2. Shows an exact shared person-page draft and waits for approval before writing it.
3. Keeps unapproved/private details out of the wiki when the contributor declines sharing or approves only selected details.
4. Finds and updates an existing person page rather than creating a duplicate, where one exists.
5. Frames delegation fit as a reasoned suggestion for human confirmation, not an assignment or an unsupported claim about capacity.
