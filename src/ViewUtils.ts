import { App, MarkdownView, TFile } from "obsidian";

export function insertWikilink(app: App, title: string): void {
  const view = app.workspace.getActiveViewOfType(MarkdownView);
  if (!view) return;
  view.editor.replaceSelection(`[[${title}]]`);
}

export function renderNoteList(
  container: HTMLElement,
  files: TFile[],
  app: App
): void {
  container.empty();
  if (files.length === 0) {
    container.createEl("p", { text: "No notes found.", cls: "referencer-empty" });
    return;
  }
  const ul = container.createEl("ul", { cls: "referencer-list" });
  for (const file of files) {
    const li = ul.createEl("li", { cls: "referencer-item" });
    li.setText(file.basename);
    li.addEventListener("click", () => insertWikilink(app, file.basename));
  }
}

export function renderGroupedNoteList(
  container: HTMLElement,
  groups: Map<TFile, TFile[]>,
  app: App
): void {
  container.empty();
  if (groups.size === 0) {
    container.createEl("p", { text: "No notes found.", cls: "referencer-empty" });
    return;
  }
  const sorted = [...groups.entries()].sort(([a], [b]) =>
    a.basename.localeCompare(b.basename)
  );
  for (const [bridge, notes] of sorted) {
    const details = container.createEl("details", { cls: "referencer-group" });
    details.setAttribute("open", "");
    const summary = details.createEl("summary", { cls: "referencer-group-header" });
    summary.setText(`${bridge.basename} (${notes.length})`);
    const ul = details.createEl("ul", { cls: "referencer-list" });
    for (const file of notes) {
      const li = ul.createEl("li", { cls: "referencer-item" });
      li.setText(file.basename);
      li.addEventListener("click", () => insertWikilink(app, file.basename));
    }
  }
}
