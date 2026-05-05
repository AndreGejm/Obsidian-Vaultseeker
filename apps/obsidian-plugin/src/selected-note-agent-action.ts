export const SELECTED_NOTE_AGENT_ACTIONS = [
  { id: "suggest_rewrite", menuTitle: "Vaultseer: Suggest rewrite", icon: "pencil" },
  { id: "fact_check", menuTitle: "Vaultseer: Fact check", icon: "search-check" },
  { id: "ask_about_selection", menuTitle: "Vaultseer: Ask about selection", icon: "message-circle" },
  { id: "find_related_notes", menuTitle: "Vaultseer: Find related notes", icon: "network" },
  { id: "find_supporting_sources", menuTitle: "Vaultseer: Find supporting sources", icon: "book-open-check" },
  { id: "suggest_links", menuTitle: "Vaultseer: Suggest links", icon: "link" },
  { id: "suggest_tags", menuTitle: "Vaultseer: Suggest tags", icon: "tags" },
  { id: "create_note_from_selection", menuTitle: "Vaultseer: Create note from selection", icon: "file-plus" },
  { id: "extract_claims", menuTitle: "Vaultseer: Extract claims", icon: "list-checks" },
  { id: "explain_selection", menuTitle: "Vaultseer: Explain selection", icon: "lightbulb" },
  { id: "turn_into_checklist", menuTitle: "Vaultseer: Turn into checklist", icon: "list-todo" }
] as const;

export type SelectedNoteAgentAction = (typeof SELECTED_NOTE_AGENT_ACTIONS)[number]["id"];

export type SelectedNoteAgentActionRequest = {
  action: SelectedNoteAgentAction;
  activePath: string;
  selectedText: string;
};

export type SelectedNoteActionMenu = {
  addItem(callback: (item: SelectedNoteActionMenuItem) => void): void;
};

export type SelectedNoteActionMenuItem = {
  setTitle(title: string): SelectedNoteActionMenuItem;
  setIcon?(icon: string): SelectedNoteActionMenuItem;
  onClick(callback: () => Promise<void> | void): SelectedNoteActionMenuItem;
};

export const MAX_SELECTED_NOTE_AGENT_ACTION_CHARS = 6_000;

export function addSelectedNoteActionMenuItems(input: {
  menu: SelectedNoteActionMenu;
  activePath: string | null;
  selectedText: string;
  onAction: (request: SelectedNoteAgentActionRequest) => Promise<void> | void;
}): boolean {
  const requestBase = normalizeSelectedNoteActionRequest(input.activePath, input.selectedText);
  if (requestBase === null) {
    return false;
  }

  for (const action of SELECTED_NOTE_AGENT_ACTIONS) {
    addMenuItem(input.menu, action.menuTitle, action.icon, () => input.onAction({ ...requestBase, action: action.id }));
  }
  return true;
}

export function buildSelectedNoteAgentActionPrompt(input: SelectedNoteAgentActionRequest): string {
  const selectedText = truncateSelectedText(input.selectedText.trim());
  const fencedSelection = createMarkdownFence(selectedText.text);
  const header = [
    selectedText.truncated
      ? `Selection was truncated to ${MAX_SELECTED_NOTE_AGENT_ACTION_CHARS} characters before sending.`
      : null,
    "",
    "Selected passage:",
    fencedSelection,
    ""
  ];

  switch (input.action) {
    case "suggest_rewrite":
      return joinPromptLines([
        "Vaultseer selected-section rewrite task",
        `Active note: ${input.activePath}`,
        ...header,
        "Suggest a clearer rewrite for this selected passage while preserving technical meaning, caveats, links, tags, and source claims.",
        "Use the active note context and Vaultseer tools when needed.",
        "If you can safely produce the full-note replacement Markdown, request stage_suggestion with kind=rewrite so Vaultseer can show a diff for review.",
        "If a full-note proposal is not safe, return only the replacement passage and explain what should be reviewed.",
        "Do not apply the edit directly."
      ]);
    case "fact_check":
      return joinPromptLines([
      "Vaultseer selected-section fact-check task",
      `Active note: ${input.activePath}`,
      ...header,
      "Use web research as the primary verification source for factual claims in this selected passage.",
      "Use the selected passage and active note only as context for what the user wants checked, not as proof that the claims are true.",
      "Search Vaultseer notes, indexed chunks, and extracted source workspaces as supporting evidence and to understand the user's local terminology.",
      "Classify important claims as supported, contradicted, unsupported, or unclear.",
      "If web research is unavailable in this agent session, say so clearly and then fall back to Vaultseer local notes and sources.",
      "Do not apply edits directly. If a correction is useful, propose it clearly and request stage_suggestion only after the correction is grounded in local evidence.",
      "Keep the answer concise and include the evidence source for each important claim."
      ]);
    case "ask_about_selection":
      return joinPromptLines([
        "Vaultseer selected-section question task",
        `Active note: ${input.activePath}`,
        ...header,
        "Answer the user's likely question about this selected passage using the active note as context.",
        "Use Vaultseer searches only if they would materially improve the answer.",
        "Do not stage edits unless the user explicitly asks for a change."
      ]);
    case "find_related_notes":
      return joinPromptLines([
        "Vaultseer selected-section related-notes task",
        `Active note: ${input.activePath}`,
        ...header,
        "Find notes and chunks related to this selected passage using Vaultseer note search and semantic search when available.",
        "Return only strong candidates with a short reason for each relation.",
        "Prefer useful Obsidian links over noisy vocabulary matches.",
        "Do not modify the note."
      ]);
    case "find_supporting_sources":
      return joinPromptLines([
        "Vaultseer selected-section supporting-sources task",
        `Active note: ${input.activePath}`,
        ...header,
        "Search extracted source workspaces, PDFs, imported literature, and indexed source chunks for material that supports or clarifies this selection.",
        "Return source titles or paths, relevant excerpts, and whether each source supports, contradicts, or only contextualizes the selected passage.",
        "Do not use web research for this action unless the user asks afterward."
      ]);
    case "suggest_links":
      return joinPromptLines([
        "Vaultseer selected-section link-suggestion task",
        `Active note: ${input.activePath}`,
        ...header,
        "Suggest meaningful Obsidian wikilinks for concepts in this selected passage.",
        "Search related notes first and avoid weak links that only repeat common words.",
        "If link changes are ready and safe, request stage_suggestion with kind=link for the active note.",
        "Do not apply edits directly."
      ]);
    case "suggest_tags":
      return joinPromptLines([
        "Vaultseer selected-section tag-suggestion task",
        `Active note: ${input.activePath}`,
        ...header,
        "Suggest sparse frontmatter tags for the active note based on this selected passage and the existing vault taxonomy.",
        "Prefer stable topic/type/status tags over one-off labels.",
        "If tag changes are ready and safe, request stage_suggestion with kind=tag for the active note.",
        "Do not apply edits directly."
      ]);
    case "create_note_from_selection":
      return joinPromptLines([
        "Vaultseer selected-section note-creation task",
        `Active note: ${input.activePath}`,
        ...header,
        "Draft a new note from this selected passage with a clear title, suggested vault-relative path, frontmatter tags, summary, body, and backlink to the active note.",
        "Preserve uncertainty and do not invent facts beyond the selected passage and available evidence.",
        "If a guarded create-note tool is not available, return the exact proposed Markdown and ask for approval before any write."
      ]);
    case "extract_claims":
      return joinPromptLines([
        "Vaultseer selected-section claim-extraction task",
        `Active note: ${input.activePath}`,
        ...header,
        "Extract factual claims from this selected passage.",
        "Separate direct claims, implied claims, definitions, assumptions, and open questions.",
        "Do not fact-check unless the user asks or the claim is obviously risky; this action is for preparing claims to review."
      ]);
    case "explain_selection":
      return joinPromptLines([
        "Vaultseer selected-section explanation task",
        `Active note: ${input.activePath}`,
        ...header,
        "Explain this selected passage in clear plain language, then add a short technical explanation if useful.",
        "Preserve caveats and uncertainty.",
        "Do not modify the note."
      ]);
    case "turn_into_checklist":
      return joinPromptLines([
        "Vaultseer selected-section checklist task",
        `Active note: ${input.activePath}`,
        ...header,
        "Turn this selected passage into a checklist while preserving technical meaning.",
        "Use clear action-oriented checklist items and keep non-action facts as short notes.",
        "If a note edit is useful and safe, request stage_suggestion with kind=rewrite so Vaultseer can show a diff for review.",
        "Do not apply the edit directly."
      ]);
  }
}

export function buildSelectedNoteAgentActionDisplayMessage(input: SelectedNoteAgentActionRequest): string {
  const title = selectedNoteActionDisplayTitle(input.action);
  const preview = input.selectedText.trim().replace(/\s+/g, " ");
  const clippedPreview = preview.length > 140 ? `${preview.slice(0, 137)}...` : preview;
  return [`${title} in ${input.activePath}`, "", `> ${clippedPreview}`].join("\n");
}

function normalizeSelectedNoteActionRequest(
  activePath: string | null,
  selectedText: string
): Omit<SelectedNoteAgentActionRequest, "action"> | null {
  const normalizedPath = activePath?.trim() ?? "";
  const normalizedSelection = selectedText.trim();
  if (normalizedPath.length === 0 || normalizedSelection.length === 0) {
    return null;
  }

  return {
    activePath: normalizedPath,
    selectedText: normalizedSelection
  };
}

function addMenuItem(
  menu: SelectedNoteActionMenu,
  title: string,
  icon: string,
  onClick: () => Promise<void> | void
): void {
  menu.addItem((item) => {
    item.setTitle(title);
    item.setIcon?.(icon);
    item.onClick(onClick);
  });
}

function truncateSelectedText(value: string): { text: string; truncated: boolean } {
  if (value.length <= MAX_SELECTED_NOTE_AGENT_ACTION_CHARS) {
    return { text: value, truncated: false };
  }

  return {
    text: value.slice(0, MAX_SELECTED_NOTE_AGENT_ACTION_CHARS),
    truncated: true
  };
}

function createMarkdownFence(value: string): string {
  const longestBacktickRun = Math.max(2, ...[...value.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = "`".repeat(longestBacktickRun + 1);
  return `${fence}markdown\n${value}\n${fence}`;
}

function joinPromptLines(lines: Array<string | null>): string {
  return lines.filter((line): line is string => line !== null).join("\n");
}

function selectedNoteActionDisplayTitle(action: SelectedNoteAgentAction): string {
  switch (action) {
    case "suggest_rewrite":
      return "Suggest rewrite for selected text";
    case "fact_check":
      return "Fact check selected text";
    case "ask_about_selection":
      return "Ask about selected text";
    case "find_related_notes":
      return "Find related notes for selected text";
    case "find_supporting_sources":
      return "Find supporting sources for selected text";
    case "suggest_links":
      return "Suggest links for selected text";
    case "suggest_tags":
      return "Suggest tags from selected text";
    case "create_note_from_selection":
      return "Create note from selected text";
    case "extract_claims":
      return "Extract claims from selected text";
    case "explain_selection":
      return "Explain selected text";
    case "turn_into_checklist":
      return "Turn selected text into checklist";
  }
}
