# Native Codex ACP Adaptation

This note records what Vaultseer should borrow from the Agent Client ACP runtime research, and what it must deliberately leave behind for the native Studio v1.

## Sources Inspected

All planned research files existed under `F:\Dev\scripts\Mimir\obsidian-vaultseer\research\obsidian-agent-client` and were inspected:

- `src/acp/acp-client.ts`
- `src/acp/acp-handler.ts`
- `src/services/message-sender.ts`
- `src/services/message-state.ts`

## Borrowed Concepts

- ACP session lifecycle from Agent Client. `AcpClient.initialize`, `newSession`, `loadSession`, `resumeSession`, `forkSession`, `sendPrompt`, `cancel`, and `disconnect` show the useful runtime shape: one client owns connection state, one current session id, cancellation cleanup, and a unified session-update callback via `onSessionUpdate`.
- Message update normalization from Agent Client message state. `applySingleUpdate`, `applyUpdateLastMessage`, `applyUpdateUserMessage`, `applyUpsertToolCall`, `mergeToolCallContent`, and `rebuildToolCallIndex` are the strongest reusable pattern: convert protocol updates into small immutable message-array transformations instead of spreading streaming logic through the UI.
- Permission boundary concept from Agent Client permission handler. The inspected files expose the boundary through `AcpHandler.requestPermission`, `AcpClient.respondToPermission`, `findActivePermission`, and `selectOption`: permission requests become explicit UI state, and user choice is returned through the ACP client rather than executed implicitly.
- Error shaping around sends. `sendPreparedPrompt`, `handleSendError`, and `retryWithAuthentication` preserve the original display content, shape transport errors into `AcpError`, ignore known empty-response noise, and only retry authentication when the ACP error code indicates authentication is required.

## Session Start Patterns

Agent Client separates process/connection initialization from session creation. `AcpClient.initialize` establishes the ACP connection and protocol capabilities, while `newSession`, `loadSession`, and `resumeSession` each set or preserve `currentSessionId` and pass a working directory into the ACP session call.

Vaultseer should borrow that separation conceptually, but not the concrete process launcher. Native Studio should have a small session controller that can initialize a future ACP adapter, start an ephemeral Studio chat session, and register one update listener. For v1, session start should also build Vaultseer's active-note context packet before the first user send rather than relying on Agent Client's `@[[note]]` mention system.

## Message Send Patterns

Agent Client's `preparePrompt` builds two outputs: `displayContent` for local UI history and `agentContent` for the agent. It can embed mentioned notes as ACP resource blocks in `preparePromptWithEmbeddedContext` or as XML text in `preparePromptWithTextContext`; `sendPreparedPrompt` then sends only the prepared agent content through `AcpClient.sendPrompt`.

Vaultseer should borrow the two-content idea. Studio can keep a user-visible message distinct from the enriched prompt packet, but Vaultseer owns enrichment. The context source should be active-note metadata, read-only search results, and proposed/staged operations, not Agent Client's full mention parser or persisted chat replay.

## Streaming And Tool Update Handling

`AcpHandler.sessionUpdate` normalizes ACP update variants into a smaller `SessionUpdate` union: text chunks, thought chunks, user replay chunks, tool calls, plans, slash-command updates, mode updates, session info, usage, and config updates. `message-state.ts` then applies only message-relevant updates and ignores session-level updates by returning the previous array reference.

Vaultseer should borrow the reducer-style normalization and tool-call upsert model. In Studio, tool updates should map only to Vaultseer-visible inspect/search/propose/stage operations. Tool output should be status-first and reviewable; any diff-like content should replace earlier diff content the way `mergeToolCallContent` replaces old diff entries when a new diff arrives.

## Permission Handling

Agent Client surfaces permission as active message state. `findActivePermission` scans tool-call content for an active request, and `selectOption` chooses from explicit options by preferred kind. The protocol response path remains separate through `AcpClient.respondToPermission`.

Vaultseer should keep that boundary, but the allowed decisions are narrower. ACP-originated permission prompts may approve only read/inspect/search/propose/stage actions exposed by Vaultseer. Vault writes are not ACP permissions and must remain guarded Vaultseer operations with the existing review/stage/apply flow.

## Error-Shaping Patterns

Agent Client shapes errors close to the send boundary. `AcpClient.sendPrompt` resets update counts, tracks recent stderr for silent failures, ignores known empty-response and user-abort cases, and throws other errors. `handleSendError` then converts failures to `AcpError`, preserves display/agent content for recovery, and marks authentication-required responses separately.

Vaultseer should borrow the user-facing error shape, not the stderr/process diagnostics. Native Studio should distinguish expected cancellation, empty/no-op responses, authentication/setup failures, and normal agent failures. Errors should remain chat-visible and recoverable without mutating vault files or losing the user's draft message.

## Vaultseer-Specific Changes

- Chat history remains ephemeral by default.
- Vaultseer owns active-note context packet creation.
- Vaultseer tool dispatcher exposes only inspect/search/propose/stage tools.
- Vault writes are not ACP tools; they remain guarded Vaultseer operations.
- Studio should treat the ACP adapter as a future transport boundary, not as permission to launch Codex or mutate the vault from terminal actions.

## Non-Copied Surfaces

- Do not copy Agent Client's full React UI.
- Do not copy persistent session history for v1.
- Do not let Codex terminal actions mutate vault files directly.
- Do not copy `AcpClient.initialize` process spawning, Windows WSL command preparation, terminal manager wiring, or process-tree cleanup into this task.
- Do not wire real ACP transport, add process launch behavior, change the chat adapter or Studio view, or add dependencies as part of Task 5.1.

## Practical Adaptation Checklist

When native ACP work begins, implement the adaptation in this order:

1. Define a Vaultseer session/update boundary modeled after `AcpClient.onSessionUpdate` and `AcpHandler.sessionUpdate`.
2. Add pure message reducers modeled after `message-state.ts`, scoped to Vaultseer chat content and tool statuses.
3. Keep prompt display content separate from enriched agent content, but build enrichment from Vaultseer-owned active-note/search/proposal context.
4. Route tool updates through the existing guarded dispatcher and reject any request outside inspect/search/propose/stage.
5. Shape errors at the send boundary so failed sends are visible, retryable, and unable to bypass vault-write review.
