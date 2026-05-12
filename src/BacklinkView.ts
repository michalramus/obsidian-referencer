import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import type ReferencerPlugin from "./main";
import { renderGroupedNoteList } from "./ViewUtils";

export const BACKLINK_VIEW_TYPE = "referencer-backlink-view";

interface CustomArrayDict {
  keys(): string[];
}

export class BacklinkView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private plugin: ReferencerPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return BACKLINK_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Backlinks via References";
  }

  getIcon(): string {
    return "links-coming-in";
  }

  async onOpen(): Promise<void> {
    this.refresh();
  }

  async onClose(): Promise<void> {}

  refresh(): void {
    const container = this.containerEl.children[1] as HTMLElement;
    container.empty();

    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      container.createEl("p", { text: "No file open.", cls: "referencer-empty" });
      return;
    }

    const folderPath = this.plugin.settings.folderPath.trim();
    if (!folderPath) {
      container.createEl("p", {
        text: "Configure a folder in settings.",
        cls: "referencer-empty",
      });
      return;
    }

    const folderNorm = folderPath.endsWith("/") ? folderPath : folderPath + "/";

    const cache = this.app.metadataCache.getFileCache(activeFile);
    const outLinks = cache?.links ?? [];

    const bridgeFiles: TFile[] = [];
    for (const linkCache of outLinks) {
      const resolved = this.app.metadataCache.getFirstLinkpathDest(
        linkCache.link,
        activeFile.path
      );
      if (resolved && resolved.path.startsWith(folderNorm)) {
        bridgeFiles.push(resolved);
      }
    }

    if (bridgeFiles.length === 0) {
      container.createEl("p", {
        text: "No reference links in this note.",
        cls: "referencer-empty",
      });
      return;
    }

    const groups = new Map<TFile, TFile[]>();

    for (const bridge of bridgeFiles) {
      const backlinks = this.app.metadataCache.getBacklinksForFile(
        bridge
      ) as unknown as CustomArrayDict;

      const notes: TFile[] = [];
      for (const sourcePath of backlinks.keys()) {
        if (sourcePath === activeFile.path) continue;
        const sourceFile = this.app.vault.getFileByPath(sourcePath);
        if (sourceFile) {
          notes.push(sourceFile);
        }
      }

      notes.sort((a, b) => a.basename.localeCompare(b.basename));
      if (notes.length > 0) {
        groups.set(bridge, notes);
      }
    }

    renderGroupedNoteList(container, groups, this.app);
  }
}
