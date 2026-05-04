import type { StudioModeId } from "@vaultseer/core";

export type StudioModeDashboardActionTone = "primary" | "normal" | "muted";

export type StudioModeDashboardActionCard = {
  id: string;
  title: string;
  description: string;
  buttonLabel: string;
  commandId?: string;
  modeId?: StudioModeId;
  tone: StudioModeDashboardActionTone;
};

export type StudioModeDashboard = {
  summary: string;
  cards: StudioModeDashboardActionCard[];
};

export type BuildStudioModeDashboardInput = {
  mode: StudioModeId;
  activeNotePath: string | null;
  pendingWriteCount: number;
};

export function buildStudioModeDashboard(input: BuildStudioModeDashboardInput): StudioModeDashboard {
  switch (input.mode) {
    case "note":
      return {
        summary: "Work from the active note first, then branch into search, review, and guarded changes.",
        cards: [
          commandCard(
            "open-workbench",
            "Open workbench",
            "See tags, links, related notes, and sanity checks for the active note.",
            "Open"
          ),
          commandCard(
            "open-write-review-queue",
            input.pendingWriteCount > 0 ? "Review pending changes" : "Open review queue",
            "Approve, defer, or reject staged note changes before anything is written.",
            input.pendingWriteCount > 0 ? "Review" : "Open",
            "primary"
          ),
          commandCard("search-index", "Search related notes", "Search the indexed vault for nearby ideas.", "Search")
        ]
      };
    case "search":
      return {
        summary: "Find notes and source workspaces without leaving Studio.",
        cards: [
          commandCard("search-index", "Search notes", "Search note titles, tags, headings, and chunks.", "Search"),
          commandCard(
            "search-source-workspaces",
            "Search sources",
            "Search extracted PDFs, documents, code, and literature workspaces.",
            "Search"
          ),
          commandCard("rebuild-index", "Refresh index", "Rebuild the read-only note index when results look stale.", "Rebuild")
        ]
      };
    case "sources":
      return {
        summary: "Bring literature, datasheets, PDFs, and code into searchable source workspaces.",
        cards: [
          commandCard(
            "choose-text-source-file",
            "Import text or code",
            "Choose a supported text/code file and store it as a source workspace.",
            "Choose"
          ),
          commandCard(
            "plan-source-extraction-queue",
            "Plan PDF extraction",
            "Queue Marker extraction for PDFs and rich documents before running a batch.",
            "Plan",
            "primary"
          ),
          commandCard(
            "search-source-workspaces",
            "Search sources",
            "Search source chunks before turning evidence into vault notes.",
            "Search"
          ),
          commandCard(
            "plan-source-semantic-index",
            "Plan source vectors",
            "Prepare semantic search for extracted source chunks.",
            "Plan"
          )
        ]
      };
    case "review":
      return {
        summary: "Keep writes explicit. Review staged note, tag, and source-note changes before applying them.",
        cards: [
          commandCard(
            "open-write-review-queue",
            input.pendingWriteCount > 0 ? "Review pending changes" : "Open review queue",
            pendingReviewDescription(input.pendingWriteCount),
            input.pendingWriteCount > 0 ? "Review" : "Open",
            "primary"
          ),
          commandCard("open-workbench", "Open workbench", "Return to the active-note evidence surface.", "Open")
        ]
      };
    case "plans":
      return {
        summary: "Use chat to shape plans from the active note and Vaultseer context, then save only when approved.",
        cards: [
          modeCard(
            "chat-plan",
            "Plan with Vaultseer chat",
            "Use the active note and Vaultseer search context to draft a plan before saving anything.",
            "Open Chat",
            "chat",
            "primary"
          )
        ]
      };
    case "releases":
      return {
        summary: "Use chat to gather changes and draft release notes from reviewed evidence.",
        cards: [
          modeCard(
            "chat-release",
            "Draft release notes in chat",
            "Ask Vaultseer to summarize implemented changes, tests, and remaining risks.",
            "Open Chat",
            "chat",
            "primary"
          )
        ]
      };
    case "chat":
      return {
        summary: "Chat mode is the command surface for Vaultseer.",
        cards: []
      };
  }
}

function commandCard(
  commandId: string,
  title: string,
  description: string,
  buttonLabel: string,
  tone: StudioModeDashboardActionTone = "normal"
): StudioModeDashboardActionCard {
  return {
    id: commandId,
    title,
    description,
    buttonLabel,
    commandId,
    tone
  };
}

function modeCard(
  id: string,
  title: string,
  description: string,
  buttonLabel: string,
  modeId: StudioModeId,
  tone: StudioModeDashboardActionTone
): StudioModeDashboardActionCard {
  return {
    id,
    title,
    description,
    buttonLabel,
    modeId,
    tone
  };
}

function pendingReviewDescription(count: number): string {
  if (count === 0) {
    return "No write is applied automatically; this queue is where staged changes wait.";
  }

  return `${count} staged change${count === 1 ? "" : "s"} waiting for approval.`;
}
