import { MarkdownView, Menu, TFile } from "obsidian";
import type ReferencerPlugin from "./main";

export function stripLeadingEmoji(s: string): string {
  return s.replace(/^([\p{Emoji_Presentation}\p{Extended_Pictographic}]\s*)+/u, "");
}

export function insertWikilink(plugin: ReferencerPlugin, title: string): void {
  const view =
    plugin.lastMarkdownView ??
    plugin.app.workspace.getActiveViewOfType(MarkdownView);
  if (!view) return;
  view.editor.replaceSelection(`[[${title}]]\n`);
}

let dragState: {
  type: "folder" | "file";
  groupKey: string;
  sourceEl: HTMLElement;
} | null = null;

export interface FolderNode {
  files: TFile[];
  subfolders: Map<string, FolderNode>;
}

function applyOrder<T>(
  items: T[],
  savedOrder: string[],
  keyFn: (item: T) => string
): T[] {
  if (savedOrder.length === 0) {
    return [...items].sort((a, b) =>
      stripLeadingEmoji(keyFn(a)).localeCompare(stripLeadingEmoji(keyFn(b)))
    );
  }
  const indexMap = new Map(savedOrder.map((k, i) => [k, i]));
  const known: T[] = [];
  const unknown: T[] = [];
  for (const item of items) {
    (indexMap.has(keyFn(item)) ? known : unknown).push(item);
  }
  known.sort((a, b) => indexMap.get(keyFn(a))! - indexMap.get(keyFn(b))!);
  unknown.sort((a, b) =>
    stripLeadingEmoji(keyFn(a)).localeCompare(stripLeadingEmoji(keyFn(b)))
  );
  return [...known, ...unknown];
}

function createFileItem(
  file: TFile,
  groupKey: string,
  plugin: ReferencerPlugin
): HTMLLIElement {
  const li = document.createElement("li");
  li.classList.add("referencer-item");
  li.dataset.basename = file.basename;

  if (!plugin.settings.alphabeticOrder) {
    li.draggable = true;

    const handle = document.createElement("span");
    handle.classList.add("referencer-drag-handle");
    handle.textContent = "⠿";
    li.appendChild(handle);

    li.addEventListener("dragstart", (e) => {
      dragState = { type: "file", groupKey, sourceEl: li };
      li.classList.add("referencer-dragging");
      e.dataTransfer!.effectAllowed = "move";
      e.stopPropagation();
    });

    li.addEventListener("dragend", () => {
      li.classList.remove("referencer-dragging");
      li.parentElement
        ?.querySelectorAll(".referencer-drag-over")
        .forEach((el) => el.classList.remove("referencer-drag-over"));
      dragState = null;
    });

    li.addEventListener("dragover", (e) => {
      if (
        !dragState ||
        dragState.type !== "file" ||
        dragState.groupKey !== groupKey ||
        dragState.sourceEl === li
      )
        return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = "move";
      li.classList.add("referencer-drag-over");
    });

    li.addEventListener("dragleave", () => {
      li.classList.remove("referencer-drag-over");
    });

    li.addEventListener("drop", (e) => {
      e.preventDefault();
      li.classList.remove("referencer-drag-over");
      if (
        !dragState ||
        dragState.type !== "file" ||
        dragState.groupKey !== groupKey ||
        dragState.sourceEl === li
      )
        return;

      const order = plugin.settings.manualFileOrder[groupKey] ?? [];
      const fromBasename = (dragState.sourceEl as HTMLElement).dataset.basename!;
      const toBasename = file.basename;
      const fromIdx = order.indexOf(fromBasename);
      const toIdx = order.indexOf(toBasename);
      if (fromIdx === -1 || toIdx === -1) return;

      order.splice(fromIdx, 1);
      order.splice(toIdx, 0, fromBasename);
      plugin.settings.manualFileOrder[groupKey] = order;
      plugin.saveSettings().then(() => plugin.refreshFolderView());
    });
  }

  const label = document.createElement("span");
  label.textContent = file.basename;
  li.appendChild(label);

  li.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).classList.contains("referencer-drag-handle"))
      return;
    insertWikilink(plugin, file.basename);
  });

  li.addEventListener("mouseover", (e) => {
    plugin.app.workspace.trigger("hover-link", {
      event: e, source: "referencer",
      hoverParent: li, targetEl: li,
      linktext: file.basename, sourcePath: file.path,
    });
  });

  li.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const menu = new Menu();
    menu.addItem(item =>
      item.setTitle("Open in new tab").setIcon("lucide-external-link")
        .onClick(() => plugin.app.workspace.getLeaf("tab").openFile(file))
    );
    menu.showAtMouseEvent(e);
  });

  return li;
}

export function renderNoteList(
  container: HTMLElement,
  files: TFile[],
  plugin: ReferencerPlugin
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
    li.addEventListener("click", () => insertWikilink(plugin, file.basename));
    li.addEventListener("mouseover", (e) => {
      plugin.app.workspace.trigger("hover-link", {
        event: e, source: "referencer",
        hoverParent: li, targetEl: li,
        linktext: file.basename, sourcePath: file.path,
      });
    });
    li.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const menu = new Menu();
      menu.addItem(item =>
        item.setTitle("Open in new tab").setIcon("lucide-external-link")
          .onClick(() => plugin.app.workspace.getLeaf("tab").openFile(file))
      );
      menu.showAtMouseEvent(e);
    });
  }
}

function applySubfolderOrder(names: string[], savedOrder: string[]): string[] {
  if (savedOrder.length === 0) {
    return [...names].sort((a, b) => stripLeadingEmoji(a).localeCompare(stripLeadingEmoji(b)));
  }
  const indexMap = new Map(savedOrder.map((k, i) => [k, i]));
  const known = names.filter((n) => indexMap.has(n));
  const unknown = names.filter((n) => !indexMap.has(n));
  known.sort((a, b) => indexMap.get(a)! - indexMap.get(b)!);
  unknown.sort((a, b) => stripLeadingEmoji(a).localeCompare(stripLeadingEmoji(b)));
  return [...known, ...unknown];
}

export function renderFolderTree(
  container: HTMLElement,
  node: FolderNode,
  relPath: string,
  plugin: ReferencerPlugin,
  depth = 0
): void {
  const s = plugin.settings;
  let needsSave = false;

  // Order subfolders
  const subNames = [...node.subfolders.keys()];
  const orderedSubNames = s.alphabeticOrder
    ? [...subNames].sort((a, b) => stripLeadingEmoji(a).localeCompare(stripLeadingEmoji(b)))
    : applySubfolderOrder(subNames, s.manualSubfolderOrder[relPath] ?? []);

  // Sync manualSubfolderOrder for this level
  if (!s.alphabeticOrder) {
    const synced = [
      ...(s.manualSubfolderOrder[relPath] ?? []).filter((k) => subNames.includes(k)),
      ...subNames.filter((k) => !(s.manualSubfolderOrder[relPath] ?? []).includes(k)),
    ];
    if (synced.join() !== (s.manualSubfolderOrder[relPath] ?? []).join()) {
      s.manualSubfolderOrder[relPath] = synced;
      needsSave = true;
    }
  }

  // Render subfolders first
  for (const seg of orderedSubNames) {
    const childNode = node.subfolders.get(seg)!;
    const childRelPath = relPath ? `${relPath}/${seg}` : seg;

    const details = container.createEl("details", { cls: "referencer-group" });
    details.dataset.subfolder = childRelPath;
    const isCollapsed = s.collapsedFolders.includes(childRelPath);
    if (!isCollapsed) details.setAttribute("open", "");

    details.addEventListener("toggle", () => {
      const collapsed = s.collapsedFolders;
      if (details.open) {
        const idx = collapsed.indexOf(childRelPath);
        if (idx !== -1) collapsed.splice(idx, 1);
      } else {
        if (!collapsed.includes(childRelPath)) collapsed.push(childRelPath);
      }
      plugin.saveSettings();
    });

    if (!s.alphabeticOrder) {
      details.addEventListener("dragover", (e) => {
        if (!dragState || dragState.type !== "folder" || dragState.groupKey !== relPath || dragState.sourceEl === details)
          return;
        e.preventDefault();
        e.dataTransfer!.dropEffect = "move";
        details.classList.add("referencer-drag-over");
      });

      details.addEventListener("dragleave", (e) => {
        if (!details.contains(e.relatedTarget as Node)) {
          details.classList.remove("referencer-drag-over");
        }
      });

      details.addEventListener("drop", (e) => {
        e.preventDefault();
        details.classList.remove("referencer-drag-over");
        if (!dragState || dragState.type !== "folder" || dragState.groupKey !== relPath || dragState.sourceEl === details)
          return;
        const fromSeg = (dragState.sourceEl as HTMLElement).dataset.subfolder!.split("/").pop()!;
        const toSeg = seg;
        const order = s.manualSubfolderOrder[relPath] ?? [];
        const fromIdx = order.indexOf(fromSeg);
        const toIdx = order.indexOf(toSeg);
        if (fromIdx === -1 || toIdx === -1) return;
        order.splice(fromIdx, 1);
        order.splice(toIdx, 0, fromSeg);
        s.manualSubfolderOrder[relPath] = order;
        plugin.saveSettings().then(() => plugin.refreshFolderView());
      });
    }

    const summary = details.createEl("summary", { cls: "referencer-group-header" });

    if (!s.alphabeticOrder) {
      const handle = summary.createEl("span", { cls: "referencer-drag-handle" });
      handle.textContent = "⠿";

      handle.addEventListener("dragstart", (e) => {
        dragState = { type: "folder", groupKey: relPath, sourceEl: details };
        details.classList.add("referencer-dragging");
        e.dataTransfer!.effectAllowed = "move";
        e.dataTransfer!.setDragImage(details, 0, 0);
        e.stopPropagation();
      });

      handle.addEventListener("dragend", () => {
        details.classList.remove("referencer-dragging");
        container.querySelectorAll(".referencer-drag-over")
          .forEach((el) => el.classList.remove("referencer-drag-over"));
        dragState = null;
      });

      handle.draggable = true;
    }

    summary.createEl("span", { text: seg });

    const childContainer = details.createEl("div");

    // Order and render files for this subfolder node
    const orderedFiles = s.alphabeticOrder
      ? [...childNode.files].sort((a, b) => stripLeadingEmoji(a.basename).localeCompare(stripLeadingEmoji(b.basename)))
      : applyOrder(childNode.files, s.manualFileOrder[childRelPath] ?? [], (f) => f.basename);

    if (!s.alphabeticOrder) {
      const trimmed = orderedFiles.map((f) => f.basename);
      const saved = s.manualFileOrder[childRelPath] ?? [];
      if (trimmed.join() !== saved.join()) {
        s.manualFileOrder[childRelPath] = trimmed;
        needsSave = true;
      }
    }

    const ul = childContainer.createEl("ul", { cls: "referencer-list" });
    for (const file of orderedFiles) {
      ul.appendChild(createFileItem(file, childRelPath, plugin));
    }

    // Recurse for nested subfolders
    renderFolderTree(childContainer, childNode, childRelPath, plugin, depth + 1);
  }

  // Render files at current level (root files for relPath="", or files directly in this folder)
  if (depth === 0 && node.files.length > 0) {
    const orderedRoot = s.alphabeticOrder
      ? [...node.files].sort((a, b) => stripLeadingEmoji(a.basename).localeCompare(stripLeadingEmoji(b.basename)))
      : applyOrder(node.files, s.manualFileOrder[""] ?? [], (f) => f.basename);

    if (!s.alphabeticOrder) {
      const trimmed = orderedRoot.map((f) => f.basename);
      const saved = s.manualFileOrder[""] ?? [];
      if (trimmed.join() !== saved.join()) {
        s.manualFileOrder[""] = trimmed;
        needsSave = true;
      }
    }

    const ul = container.createEl("ul", { cls: "referencer-list" });
    for (const file of orderedRoot) {
      ul.appendChild(createFileItem(file, "", plugin));
    }
  }

  if (needsSave) plugin.saveSettings();
}

export function renderGroupedNoteList(
  container: HTMLElement,
  groups: Map<TFile, TFile[]>,
  plugin: ReferencerPlugin
): void {
  container.empty();
  if (groups.size === 0) {
    container.createEl("p", { text: "No notes found.", cls: "referencer-empty" });
    return;
  }
  for (const [bridge, notes] of groups) {
    const details = container.createEl("details", { cls: "referencer-group" });
    const key = bridge.path;
    const isCollapsed = plugin.settings.collapsedGroups.includes(key);
    if (!isCollapsed) details.setAttribute("open", "");
    details.addEventListener("toggle", () => {
      const collapsed = plugin.settings.collapsedGroups;
      if (details.open) {
        const idx = collapsed.indexOf(key);
        if (idx !== -1) collapsed.splice(idx, 1);
      } else {
        if (!collapsed.includes(key)) collapsed.push(key);
      }
      plugin.saveSettings();
    });
    const summary = details.createEl("summary", { cls: "referencer-group-header" });
    summary.setText(`${bridge.basename} (${notes.length})`);
    const ul = details.createEl("ul", { cls: "referencer-list" });
    for (const file of notes) {
      const li = ul.createEl("li", { cls: "referencer-item" });
      li.setText(file.basename);
      li.addEventListener("click", () => insertWikilink(plugin, file.basename));
      li.addEventListener("mouseover", (e) => {
        plugin.app.workspace.trigger("hover-link", {
          event: e, source: "referencer",
          hoverParent: li, targetEl: li,
          linktext: file.basename, sourcePath: file.path,
        });
      });
      li.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const menu = new Menu();
        menu.addItem(item =>
          item.setTitle("Open in new tab").setIcon("lucide-external-link")
            .onClick(() => plugin.app.workspace.getLeaf("tab").openFile(file))
        );
        menu.showAtMouseEvent(e);
      });
    }
  }
}
