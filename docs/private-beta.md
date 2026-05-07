# Vaultseer Private Beta

## What This Beta Is

Vaultseer is an Obsidian helper for active-note drafting, note search, source intake, tags, links, chunk inspection, and reviewable note changes.

This beta is for a small personal vault, preferably one already tracked in git. It is not a public Obsidian community release.

## What Works

- current-note-first Studio chat
- read-only index rebuild and keyword search
- chunk inspection for the active note
- selected-text actions from the right-click menu
- selected-text rewrite and web-first fact-check prompts
- active-note rewrite proposals with redline preview
- editing a proposed draft before writing
- writing an approved active-note proposal to the current Markdown note
- guarded source-note creation
- tag and link proposal staging
- PDF source extraction when Marker is installed
- source workspace search
- optional semantic search and semantic indexing when an embedding endpoint is configured

## What Is Limited

- OpenAI direct mode needs API billing and may send selected note context to OpenAI.
- Native bridge mode depends on a local Codex ACP process that can time out if the local install is unhealthy.
- Semantic search is optional; lexical search remains the fallback when embeddings are unavailable.
- Marker is the serious PDF extraction path, but image/table rendering in previews is still basic.
- Office, EPUB, and broad document intake are not yet beta-ready.
- Multi-note automatic edits and background cleanup are out of scope.

## Safe Use Guidance

Use this beta on a git-backed vault. Review the redline before writing. Active-note changes are meant to be easy, but they still go through an explicit proposed operation so you can see what will change.

Use Marker only for documents you trust. Marker runs locally as an external tool and stores extracted source workspaces locally before any note is written.

Do not put API keys or private credentials in notes you ask Vaultseer to inspect. Vaultseer should not intentionally send settings or secrets into chat context.

## First Run

1. Copy the plugin build into `.obsidian/plugins/vaultseer`.
2. Reload Obsidian.
3. Enable Vaultseer.
4. Open `Vaultseer: Open native Studio`.
5. Run `Rebuild read-only vault index`.
6. Open a note and ask Vaultseer to review it.
7. Inspect the redline proposal.
8. Optionally use `Edit draft`.
9. Press `Write to note` when the proposal looks right.

## Provider Modes

OpenAI mode uses the OpenAI API. It may transmit the active note excerpt, selected text, image attachments, tool results, and relevant Vaultseer search excerpts when those are part of the request. It should not send the whole vault, plugin settings, API keys, or arbitrary files by default.

Native bridge mode uses a local Codex ACP process. It is useful when local Codex works well on the machine, but it can fail or time out independently of Vaultseer.

## PDF Extraction

Marker is used for high-fidelity PDF extraction. It runs locally as `marker_single`. If Marker is missing, Vaultseer should show a setup diagnostic instead of a raw process error.

Extracted source workspaces are evidence. They become Obsidian notes only after a proposal is reviewed and written.
