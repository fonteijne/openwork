---
title: Knowledge compilation
status: provisional
updated: 2026-11-09
---

# Knowledge compilation

Knowledge compilation turns selected source material into a maintained synthesis that can support later work. Unlike a storage-and-retrieval workflow, it updates durable knowledge during ingestion, so subsequent outputs can build on prior synthesis rather than repeatedly starting from unprocessed inputs.

## Working model

1. Preserve and identify the source in `raw/`.
2. Extract claims with evidence, context, and uncertainty.
3. Search and update relevant existing pages in `wiki/`; create pages only for durable concepts not already represented.
4. Link claims to their evidence, retain disagreements, and route unresolved questions for human review.
5. Build requested deliverables in `output/` from the wiki, checking raw evidence when needed.

This is an operating model, not a claim that synthesis is automatically correct. Source selection and quality matter, and compilation can amplify mistakes. Keep provenance visible, make small edits, and require human judgment for consequential or disputed changes.

### Communication pasted into a session

For email, Slack, and chat conversations pasted into a session, the default shared source is a contributor-approved, privacy-minimized communication note rather than a verbatim transcript. The note is a selective, derived account: preserve provenance and disclose partial input or verification limits, and do not imply colleagues can verify it against an inaccessible original thread. The original conversation is not retained in shared files unless separately and explicitly requested and appropriate to share. See [`raw/README.md`](../raw/README.md) and the [source compilation workflow](../HARNASS/workflows/compile-source.md).

## Provenance

The distinction between retrieval and compilation, the raw/wiki/output structure, and the risk that weak sources propagate are described in [the captured X article](../raw/2026-08-20-rvaniaaa-second-brain-compiler.md). The review queue and verification safeguards in this project's guide are implementation choices added to make that idea auditable; they are not presented as quotations from the article.
