import { MarkdownView, Plugin, TFolder } from "obsidian";
import { DEFAULT_SETTINGS, ReferencerSettings } from "./types";
import { ReferencerSettingTab } from "./settings";
import { FolderView, FOLDER_VIEW_TYPE } from "./FolderView";
import { BacklinkView, BACKLINK_VIEW_TYPE } from "./BacklinkView";

export default class ReferencerPlugin extends Plugin {
  settings: ReferencerSettings;
  lastMarkdownView: MarkdownView | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(FOLDER_VIEW_TYPE, (leaf) => new FolderView(leaf, this));
    this.registerView(
      BACKLINK_VIEW_TYPE,
      (leaf) => new BacklinkView(leaf, this)
    );

    this.addSettingTab(new ReferencerSettingTab(this.app, this));

    this.registerHoverLinkSource("referencer", { display: "Referencer", defaultMod: false });

    this.addRibbonIcon("folder", "Open References panel", () =>
      this.activateFolderView()
    );
    this.addRibbonIcon("links-coming-in", "Open Backlinks panel", () =>
      this.activateBacklinkView()
    );

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        const view = leaf?.view;
        if (view instanceof MarkdownView) {
          this.lastMarkdownView = view;
        }
      })
    );

    this.registerEvent(
      this.app.workspace.on("file-open", () => this.refreshBacklinkView())
    );

    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        if (file === this.app.workspace.getActiveFile()) {
          this.refreshBacklinkView();
        }
      })
    );

    const folderNorm = () => {
      const p = this.settings.folderPath.trim();
      return p.endsWith("/") ? p : p + "/";
    };

    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (file.path.startsWith(folderNorm())) this.refreshFolderView();
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        const norm = folderNorm();
        if (!file.path.startsWith(norm)) return;
        const rel = file.path.slice(norm.length);
        const parts = rel.split("/");
        const basename = parts[parts.length - 1].replace(/\.md$/, "");
        const subKey = parts.slice(0, parts.length - 1).join("/");
        const order = this.settings.manualFileOrder[subKey];
        if (order) {
          const idx = order.indexOf(basename);
          if (idx !== -1) {
            order.splice(idx, 1);
            this.settings.manualFileOrder[subKey] = order;
          }
        }
        this.saveSettings().then(() => this.refreshFolderView());
      })
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        const norm = folderNorm();
        const wasInFolder = oldPath.startsWith(norm);
        const isInFolder = file.path.startsWith(norm);
        if (!wasInFolder && !isInFolder) return;

        if (file instanceof TFolder) {
          // Folder rename/move
          const oldSegKey = oldPath.slice(norm.length);
          const newSegKey = file.path.slice(norm.length);

          // Update manualFileOrder keys
          for (const key of Object.keys(this.settings.manualFileOrder)) {
            if (key === oldSegKey || key.startsWith(oldSegKey + "/")) {
              const newKey = newSegKey + key.slice(oldSegKey.length);
              this.settings.manualFileOrder[newKey] = this.settings.manualFileOrder[key];
              delete this.settings.manualFileOrder[key];
            }
          }

          // Update collapsedFolders entries
          const collapsed = this.settings.collapsedFolders;
          for (let i = 0; i < collapsed.length; i++) {
            if (collapsed[i] === oldSegKey || collapsed[i].startsWith(oldSegKey + "/")) {
              collapsed[i] = newSegKey + collapsed[i].slice(oldSegKey.length);
            }
          }

          // Update manualFolderOrder top-level entry
          const oldTop = oldSegKey.split("/")[0];
          const newTop = newSegKey.split("/")[0];
          const folderOrderIdx = this.settings.manualFolderOrder.indexOf(oldTop);
          if (folderOrderIdx !== -1) {
            this.settings.manualFolderOrder[folderOrderIdx] = newTop;
          }

          // Update manualSubfolderOrder keys
          const subfolderOrder = this.settings.manualSubfolderOrder ?? {};
          for (const key of Object.keys(subfolderOrder)) {
            if (key === oldSegKey || key.startsWith(oldSegKey + "/")) {
              const newKey = newSegKey + key.slice(oldSegKey.length);
              subfolderOrder[newKey] = subfolderOrder[key];
              delete subfolderOrder[key];
            }
          }
          // Also update values that contain the old segment key
          for (const key of Object.keys(subfolderOrder)) {
            subfolderOrder[key] = subfolderOrder[key].map((seg: string) =>
              seg === oldSegKey ? newSegKey : seg
            );
          }
          this.settings.manualSubfolderOrder = subfolderOrder;
        } else {
          // File rename/move
          if (wasInFolder) {
            const oldRel = oldPath.slice(norm.length);
            const oldParts = oldRel.split("/");
            const oldBasename = oldParts[oldParts.length - 1].replace(/\.md$/, "");
            const oldSubKey = oldParts.slice(0, oldParts.length - 1).join("/");
            const oldOrder = this.settings.manualFileOrder[oldSubKey];
            if (oldOrder) {
              const idx = oldOrder.indexOf(oldBasename);
              if (idx !== -1) oldOrder.splice(idx, 1);
              this.settings.manualFileOrder[oldSubKey] = oldOrder;
            }
          }
          if (isInFolder) {
            const newRel = file.path.slice(norm.length);
            const newParts = newRel.split("/");
            const newBasename = newParts[newParts.length - 1].replace(/\.md$/, "");
            const newSubKey = newParts.slice(0, newParts.length - 1).join("/");
            const newOrder = this.settings.manualFileOrder[newSubKey] ?? [];
            if (!newOrder.includes(newBasename)) newOrder.push(newBasename);
            this.settings.manualFileOrder[newSubKey] = newOrder;
          }
        }

        this.saveSettings().then(() => this.refreshFolderView());
      })
    );

    this.app.workspace.onLayoutReady(() => {
      this.activateFolderView();
      this.activateBacklinkView();
    });
  }

  async onunload(): Promise<void> {
    this.app.workspace.detachLeavesOfType(FOLDER_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(BACKLINK_VIEW_TYPE);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async activateFolderView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(FOLDER_VIEW_TYPE);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: FOLDER_VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  async activateBacklinkView(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(BACKLINK_VIEW_TYPE);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: BACKLINK_VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  refreshFolderView(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(FOLDER_VIEW_TYPE)) {
      if (leaf.view instanceof FolderView) leaf.view.refresh();
    }
  }

  refreshBacklinkView(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(BACKLINK_VIEW_TYPE)) {
      if (leaf.view instanceof BacklinkView) leaf.view.refresh();
    }
  }

  refreshAllViews(): void {
    this.refreshFolderView();
    this.refreshBacklinkView();
  }
}
