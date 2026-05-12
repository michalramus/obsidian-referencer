import { ItemView, WorkspaceLeaf } from "obsidian";
import type ReferencerPlugin from "./main";
import { renderNoteList } from "./ViewUtils";

export const FOLDER_VIEW_TYPE = "referencer-folder-view";

export class FolderView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private plugin: ReferencerPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return FOLDER_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "References";
  }

  getIcon(): string {
    return "folder";
  }

  async onOpen(): Promise<void> {
    this.refresh();
  }

  async onClose(): Promise<void> {}

  refresh(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    const folderPath = this.plugin.settings.folderPath.trim();

    if (!folderPath) {
      container.empty();
      container.createEl("p", {
        text: "Configure a folder in settings.",
        cls: "referencer-empty",
      });
      return;
    }

    const folderNorm = folderPath.endsWith("/") ? folderPath : folderPath + "/";
    const files = this.app.vault
      .getMarkdownFiles()
      .filter((f) => f.path.startsWith(folderNorm))
      .sort((a, b) => a.basename.localeCompare(b.basename));

    renderNoteList(container, files, this.app);
  }
}
