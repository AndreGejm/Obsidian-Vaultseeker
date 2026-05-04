# Approved Script Container Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe Vaultseer approved-script surface where the Obsidian agent can list and request user-approved note-management scripts without ever receiving terminal, shell, executable, or host-path access.

**Architecture:** The first implementation adds an in-plugin approved-script registry and dispatcher contract. The agent sees only `list_approved_scripts` and `run_approved_script(scriptId, input)`; script definitions contain no executable paths, and execution is delegated to trusted plugin-provided handlers keyed by script id. Direct writes are not allowed; write-capable scripts must return staged proposals through existing guarded write surfaces.

**Tech Stack:** TypeScript, Vitest, Obsidian plugin APIs, existing Vaultseer agent tool registry and dispatcher.

---

### Task 1: Approved Script Registry Model

**Files:**
- Create: `apps/obsidian-plugin/src/approved-script-registry.ts`
- Test: `apps/obsidian-plugin/tests/approved-script-registry.test.ts`

- [x] **Step 1: Write failing tests**

Add tests proving:
- malformed ids are rejected
- manifest entries cannot include executable/path/command fields
- only enabled scripts are listed
- unknown `scriptId` cannot run
- trusted handlers are called by `scriptId`, not by command text

- [x] **Step 2: Verify RED**

Run: `corepack pnpm --filter @vaultseer/obsidian-plugin test -- approved-script-registry.test.ts`

Expected: fails because `approved-script-registry.ts` does not exist.

- [x] **Step 3: Implement minimal registry**

Implement:
- `ApprovedScriptDefinition`
- `ApprovedScriptPermission`
- `ApprovedScriptRegistry`
- `normalizeApprovedScriptDefinitions(raw)`
- `createApprovedScriptRegistry({ definitions, handlers })`

The registry must not accept command strings or executable paths.

- [x] **Step 4: Verify GREEN**

Run: `corepack pnpm --filter @vaultseer/obsidian-plugin test -- approved-script-registry.test.ts`

Expected: tests pass.

### Task 2: Agent Tool Surface

**Files:**
- Modify: `apps/obsidian-plugin/src/codex-tool-dispatcher.ts`
- Modify: `apps/obsidian-plugin/src/vaultseer-agent-tool-registry.ts`
- Test: `apps/obsidian-plugin/tests/codex-tool-dispatcher.test.ts`
- Test: `apps/obsidian-plugin/tests/vaultseer-agent-tool-registry.test.ts`

- [x] **Step 1: Write failing tests**

Add tests proving:
- provider-facing tools include `list_approved_scripts` and `run_approved_script`
- the tool list does not include shell, terminal, executable, or generic file-system tools
- `run_approved_script` calls the approved-script registry only
- unsupported scripts return a safe error

- [x] **Step 2: Verify RED**

Run: `corepack pnpm --filter @vaultseer/obsidian-plugin test -- vaultseer-agent-tool-registry.test.ts codex-tool-dispatcher.test.ts`

Expected: fails because the new tools are absent.

- [x] **Step 3: Implement dispatcher integration**

Add dispatcher tool types:
- `list_approved_scripts` as read-only
- `run_approved_script` as command/script request

Do not add any generic execution, shell, terminal, or file-system tool.

- [x] **Step 4: Verify GREEN**

Run the same test command and expect pass.

### Task 3: Settings and Default Safe State

**Files:**
- Modify: `apps/obsidian-plugin/src/settings-model.ts`
- Modify: `apps/obsidian-plugin/src/plugin-data-store.ts`
- Modify: `apps/obsidian-plugin/src/settings.ts`
- Test: `apps/obsidian-plugin/tests/plugin-data-store-settings.test.ts`

- [x] **Step 1: Write failing tests**

Add tests proving the approved-script manifest defaults to empty and persisted entries are normalized safely.

- [x] **Step 2: Verify RED**

Run: `corepack pnpm --filter @vaultseer/obsidian-plugin test -- plugin-data-store-settings.test.ts`

Expected: fails because the setting does not exist.

- [x] **Step 3: Implement settings**

Add a JSON settings text area for approved script definitions. Keep default empty.

- [x] **Step 4: Verify GREEN**

Run the plugin data-store settings tests.

### Task 4: Composition Wiring

**Files:**
- Modify: `apps/obsidian-plugin/src/main.ts`
- Test: `apps/obsidian-plugin/tests/vaultseer-agent-runtime.test.ts`

- [x] **Step 1: Write failing tests**

Add an integration-style test proving a provider tool call to `list_approved_scripts` can complete through the agent runtime without shell access.

- [x] **Step 2: Verify RED**

Run: `corepack pnpm --filter @vaultseer/obsidian-plugin test -- vaultseer-agent-runtime.test.ts`

Expected: fails because approved scripts are not wired into the runtime.

- [x] **Step 3: Wire default empty registry**

Create the approved-script registry from settings and pass it into existing Codex tool implementations.

- [x] **Step 4: Verify GREEN**

Run the runtime test.

### Task 5: Full Verification and Install

- [x] Run `corepack pnpm typecheck`
- [x] Run `corepack pnpm test`
- [x] Run `corepack pnpm --filter @vaultseer/obsidian-plugin build`
- [x] Run `semgrep scan --config p/security-audit --error`
- [x] Copy rebuilt `main.js`, `manifest.json`, and `styles.css` into `F:\Dev\Obsidian\.obsidian\plugins\vaultseer`
- [ ] Commit and push `feature/vaultseer-native-studio`
