import { ItemView, setIcon, TFile, WorkspaceLeaf } from "obsidian";
import type ReferencerPlugin from "./main";
import { FolderNode, renderFolderTree, stripLeadingEmoji } from "./ViewUtils";

export const FOLDER_VIEW_TYPE = "referencer-folder-view";

function buildFolderTree(files: TFile[], folderNorm: string): FolderNode {
  const root: FolderNode = { files: [], subfolders: new Map() };
  for (const file of files) {
    const rel = file.path.slice(folderNorm.length);
    const parts = rel.split("/");
    if (parts.length === 1) {
      root.files.push(file);
    } else {
      let node = root;
      for (let i = 0; i < parts.length - 1; i++) {
        const seg = parts[i];
        if (!node.subfolders.has(seg)) node.subfolders.set(seg, { files: [], subfolders: new Map() });
        node = node.subfolders.get(seg)!;
      }
      node.files.push(file);
    }
  }
  return root;
}

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
      .sort((a, b) => stripLeadingEmoji(a.basename).localeCompare(stripLeadingEmoji(b.basename)));

    const tree = buildFolderTree(files, folderNorm);

    if (!this.plugin.settings.alphabeticOrder) {
      const dirty = { v: false };
      this.captureOrderForNode(tree, "", dirty);
      if (dirty.v) this.plugin.saveSettings();
    }

    container.empty();

    if (tree.subfolders.size > 0) {
      const toolbar = container.createEl("div", { cls: "referencer-toolbar" });
      const btn = toolbar.createEl("button", {
        cls: "referencer-toolbar-btn",
        attr: { "aria-label": "Collapse / expand all groups" },
      });
      setIcon(btn, "chevrons-down-up");
      btn.addEventListener("click", () => {
        const groups = listEl.querySelectorAll<HTMLDetailsElement>("details.referencer-group");
        const anyOpen = [...groups].some((d) => d.open);
        const collapsed = this.plugin.settings.collapsedFolders;
        if (anyOpen) {
          groups.forEach((d) => {
            d.removeAttribute("open");
            const sub = d.dataset.subfolder!;
            if (!collapsed.includes(sub)) collapsed.push(sub);
          });
        } else {
          groups.forEach((d) => {
            d.setAttribute("open", "");
            const sub = d.dataset.subfolder!;
            const idx = collapsed.indexOf(sub);
            if (idx !== -1) collapsed.splice(idx, 1);
          });
        }
        this.plugin.saveSettings();
      });
    }

    const listEl = container.createEl("div");
    renderFolderTree(listEl, tree, "", this.plugin);
  }

  private captureOrderForNode(node: FolderNode, relPath: string, dirty: { v: boolean }): void {
    const s = this.plugin.settings;

    if (!s.manualFileOrder[relPath] && node.files.length > 0) {
      s.manualFileOrder[relPath] = [...node.files]
        .sort((a, b) => stripLeadingEmoji(a.basename).localeCompare(stripLeadingEmoji(b.basename)))
        .map((f) => f.basename);
      dirty.v = true;
    }

    const subNames = [...node.subfolders.keys()].sort((a, b) =>
      stripLeadingEmoji(a).localeCompare(stripLeadingEmoji(b))
    );

    if (!s.manualSubfolderOrder[relPath] && subNames.length > 0) {
      s.manualSubfolderOrder[relPath] = subNames;
      dirty.v = true;
    }

    // Also capture top-level folder order in manualFolderOrder for backward compat
    if (relPath === "" && !s.manualFolderOrder.length && subNames.length > 0) {
      s.manualFolderOrder = subNames;
      dirty.v = true;
    }

    for (const [seg, child] of node.subfolders) {
      const childPath = relPath ? `${relPath}/${seg}` : seg;
      this.captureOrderForNode(child, childPath, dirty);
    }
  }
}
