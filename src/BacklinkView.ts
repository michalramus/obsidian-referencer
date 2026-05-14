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

    const filterByFolder = this.plugin.settings.filterBacklinksByFolder;
    const bridgeFiles: TFile[] = [];
    const seenBridges = new Set<string>();
    for (const linkCache of outLinks) {
      const resolved = this.app.metadataCache.getFirstLinkpathDest(
        linkCache.link,
        activeFile.path
      );
      if (resolved && !seenBridges.has(resolved.path) && (!filterByFolder || resolved.path.startsWith(folderNorm))) {
        seenBridges.add(resolved.path);
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

    // Pass 1: assign each sourcePath to best bridge (prefer outside-folder notes)
    const assignment = new Map<string, { file: TFile; bridge: TFile; inFolder: boolean }>();
    for (const bridge of bridgeFiles) {
      const backlinks = this.app.metadataCache.getBacklinksForFile(
        bridge
      ) as unknown as CustomArrayDict;
      for (const sourcePath of backlinks.keys()) {
        if (sourcePath === activeFile.path) continue;
        const sourceFile = this.app.vault.getFileByPath(sourcePath);
        if (!sourceFile) continue;
        const inFolder = sourceFile.path.startsWith(folderNorm);
        const existing = assignment.get(sourcePath);
        if (!existing || (existing.inFolder && !inFolder)) {
          assignment.set(sourcePath, { file: sourceFile, bridge, inFolder });
        }
      }
    }

    // Pass 2: rebuild groups from assignments, preserve bridge order
    const groups = new Map<TFile, TFile[]>();
    for (const bridge of bridgeFiles) {
      groups.set(bridge, []);
    }
    for (const { file, bridge } of assignment.values()) {
      groups.get(bridge)!.push(file);
    }
    // Drop empty bridges
    for (const [bridge, notes] of groups) {
      if (notes.length === 0) groups.delete(bridge);
    }

    // Build noteToBridges for topical sort
    const allPanelNotes = [...new Set([...assignment.values()].map(a => a.file))];
    const noteToBridges = new Map<string, Set<string>>();
    for (const note of allPanelNotes) {
      const noteCache = this.app.metadataCache.getFileCache(note);
      const bridges = new Set<string>();
      for (const lc of noteCache?.links ?? []) {
        const resolved = this.app.metadataCache.getFirstLinkpathDest(lc.link, note.path);
        if (resolved && bridgeFiles.some(b => b.path === resolved.path)) bridges.add(resolved.path);
      }
      noteToBridges.set(note.path, bridges);
    }

    renderGroupedNoteList(container, groups, this.plugin, noteToBridges, bridgeFiles);
  }
}
