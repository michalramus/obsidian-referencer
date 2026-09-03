import { ItemView, TFile, WorkspaceLeaf } from "obsidian";
import type ReferencerPlugin from "./main";
import type { BridgeInfo } from "./types";
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
    const bridgeFiles: BridgeInfo[] = [];
    const seenBridges = new Set<string>();
    
    for (const linkCache of outLinks) {
      const resolved = this.app.metadataCache.getFirstLinkpathDest(
        linkCache.link,
        activeFile.path
      );
      if (resolved) {
        if (!seenBridges.has(resolved.path) && (!filterByFolder || resolved.path.startsWith(folderNorm))) {
          seenBridges.add(resolved.path);
          bridgeFiles.push({ path: resolved.path, basename: resolved.basename, file: resolved });
        }
      } else if (!filterByFolder) {
        const synPath = `[[${linkCache.link}]]`;
        if (!seenBridges.has(synPath)) {
          seenBridges.add(synPath);
          bridgeFiles.push({ path: synPath, basename: linkCache.link, file: null });
        }
      }
    }

    if (bridgeFiles.length === 0) {
      container.createEl("p", {
        text: "No reference links in this note.",
        cls: "referencer-empty",
      });
      return;
    }

    // Pass 1a: collect all bridge memberships per source (order-independent)
    const sourceToBridges = new Map<string, { file: TFile; bridges: BridgeInfo[] }>();
    for (const bridge of bridgeFiles) {
      let sourcePaths: string[];
      if (bridge.file !== null) {
        const backlinks = (this.app.metadataCache as any).getBacklinksForFile(
          bridge.file
        ) as CustomArrayDict;
        sourcePaths = backlinks.keys();
      } else {
        sourcePaths = Object.entries(this.app.metadataCache.unresolvedLinks)
          .filter(([, links]) => links[bridge.basename])
          .map(([sp]) => sp);
      }
      for (const sourcePath of sourcePaths) {
        if (sourcePath === activeFile.path) continue;
        const sourceFile = this.app.vault.getFileByPath(sourcePath);
        if (!sourceFile) continue;
        if (!sourceToBridges.has(sourcePath)) {
          sourceToBridges.set(sourcePath, { file: sourceFile, bridges: [] });
        }
        sourceToBridges.get(sourcePath)!.bridges.push(bridge);
      }
    }

    // Pass 1b: assign each source to exactly one bridge, greedily filling the
    // smallest group first so that as many groups as possible stay non-empty.
    const assignment = new Map<string, { file: TFile; bridge: BridgeInfo }>();
    const pending = new Set(bridgeFiles);
    while (pending.size > 0) {
      let bestBridge: BridgeInfo | null = null;
      let bestCandidates: string[] = [];
      for (const bridge of bridgeFiles) {
        if (!pending.has(bridge)) continue;
        const candidates = [...sourceToBridges]
          .filter(([sp, { bridges }]) => !assignment.has(sp) && bridges.includes(bridge))
          .map(([sp]) => sp);
        // Tie-break on bridge order in the current note.
        if (candidates.length > 0 && (bestBridge === null || candidates.length < bestCandidates.length)) {
          bestBridge = bridge;
          bestCandidates = candidates;
        }
      }
      if (bestBridge === null) break;
      for (const sourcePath of bestCandidates) {
        assignment.set(sourcePath, {
          file: sourceToBridges.get(sourcePath)!.file,
          bridge: bestBridge,
        });
      }
      pending.delete(bestBridge);
    }

    // Pass 2: rebuild groups from assignments, preserve bridge order
    const groups = new Map<BridgeInfo, TFile[]>();
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

    // Build the outgoing-link set of every panel note, for the topical sort.
    const allPanelNotes = [...new Set([...assignment.values()].map(a => a.file))];
    const noteToLinks = new Map<string, Set<string>>();
    for (const note of allPanelNotes) {
      const links = new Set<string>();
      const noteCache = this.app.metadataCache.getFileCache(note);
      for (const lc of noteCache?.links ?? []) {
        const resolved = this.app.metadataCache.getFirstLinkpathDest(lc.link, note.path);
        links.add(resolved ? resolved.path : `[[${lc.link}]]`);
      }
      noteToLinks.set(note.path, links);
    }

    renderGroupedNoteList(container, groups, this.plugin, noteToLinks);
  }
}
