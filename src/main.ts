import { MarkdownView, Plugin } from "obsidian";
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
        if (file.path.startsWith(folderNorm())) this.refreshFolderView();
      })
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        const norm = folderNorm();
        if (file.path.startsWith(norm) || oldPath.startsWith(norm))
          this.refreshFolderView();
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
