import { MarkdownView, type App } from "obsidian";

export function readOpenMarkdownViewContent(app: App, path: string): string | null {
  const view = findOpenMarkdownViewForPath(app, path);
  return view?.getViewData() ?? null;
}

export function writeOpenMarkdownViewContent(app: App, path: string, content: string): boolean {
  const view = findOpenMarkdownViewForPath(app, path);
  if (!view) return false;
  view.setViewData(content, false);
  return true;
}

function findOpenMarkdownViewForPath(app: App, path: string): MarkdownView | null {
  const activeView = app.workspace.getActiveViewOfType(MarkdownView);
  if (activeView?.file?.path === path) return activeView;

  for (const leaf of app.workspace.getLeavesOfType("markdown")) {
    if (leaf.view instanceof MarkdownView && leaf.view.file?.path === path) {
      return leaf.view;
    }
  }

  return null;
}
