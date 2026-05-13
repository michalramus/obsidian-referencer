import { ItemView, setIcon, TFile, WorkspaceLeaf } from "obsidian";
import type ReferencerPlugin from "./main";
import { renderSubfolderGroupedList, stripLeadingEmoji } from "./ViewUtils";

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
      .sort((a, b) => stripLeadingEmoji(a.basename).localeCompare(stripLeadingEmoji(b.basename)));

    const rootFiles: TFile[] = [];
    const subfolderMap = new Map<string, TFile[]>();
    for (const file of files) {
      const rel = file.path.slice(folderNorm.length);
      const slashIdx = rel.indexOf("/");
      if (slashIdx === -1) {
        rootFiles.push(file);
      } else {
        const sub = rel.slice(0, slashIdx);
        if (!subfolderMap.has(sub)) subfolderMap.set(sub, []);
        subfolderMap.get(sub)!.push(file);
      }
    }

    if (!this.plugin.settings.alphabeticOrder) {
      this.captureInitialOrderIfNeeded(rootFiles, subfolderMap);
    }

    container.empty();

    if (subfolderMap.size > 0) {
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
    renderSubfolderGroupedList(listEl, rootFiles, subfolderMap, this.plugin);
  }

  private captureInitialOrderIfNeeded(
    rootFiles: TFile[],
    subfolderMap: Map<string, TFile[]>
  ): void {
    const s = this.plugin.settings;
    let dirty = false;

    if (s.manualFolderOrder.length === 0 && subfolderMap.size > 0) {
      s.manualFolderOrder = [...subfolderMap.keys()].sort((a, b) =>
        stripLeadingEmoji(a).localeCompare(stripLeadingEmoji(b))
      );
      dirty = true;
    }

    for (const [sub, files] of subfolderMap) {
      if (!s.manualFileOrder[sub]) {
        s.manualFileOrder[sub] = files.map((f) => f.basename);
        dirty = true;
      }
    }

    if (!s.manualFileOrder[""] && rootFiles.length > 0) {
      s.manualFileOrder[""] = rootFiles.map((f) => f.basename);
      dirty = true;
    }

    if (dirty) this.plugin.saveSettings();
  }
}
