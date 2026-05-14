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

export function renderSubfolderGroupedList(
  container: HTMLElement,
  rootFiles: TFile[],
  groups: Map<string, TFile[]>,
  plugin: ReferencerPlugin
): void {
  container.empty();
  if (rootFiles.length === 0 && groups.size === 0) {
    container.createEl("p", { text: "No notes found.", cls: "referencer-empty" });
    return;
  }

  const s = plugin.settings;
  let needsSave = false;

  const orderedEntries = s.alphabeticOrder
    ? [...groups.entries()].sort(([a], [b]) =>
        stripLeadingEmoji(a).localeCompare(stripLeadingEmoji(b))
      )
    : applyOrder([...groups.entries()], s.manualFolderOrder, ([k]) => k);

  // Sync folder order: trim stale entries and add new ones
  if (!s.alphabeticOrder) {
    const currentKeys = orderedEntries.map(([k]) => k);
    const synced = [
      ...s.manualFolderOrder.filter((k) => currentKeys.includes(k)),
      ...currentKeys.filter((k) => !s.manualFolderOrder.includes(k)),
    ];
    if (synced.join() !== s.manualFolderOrder.join()) {
      s.manualFolderOrder = synced;
      needsSave = true;
    }
  }

  for (const [sub, files] of orderedEntries) {
    const orderedFiles = s.alphabeticOrder
      ? files
      : applyOrder(files, s.manualFileOrder[sub] ?? [], (f) => f.basename);

    // Trim stale file entries for this group
    if (!s.alphabeticOrder) {
      const trimmed = orderedFiles.map((f) => f.basename);
      const saved = s.manualFileOrder[sub] ?? [];
      if (trimmed.join() !== saved.join()) {
        s.manualFileOrder[sub] = trimmed;
        needsSave = true;
      }
    }

    const details = container.createEl("details", { cls: "referencer-group" });
    details.dataset.subfolder = sub;
    const isCollapsed = s.collapsedFolders.includes(sub);
    if (!isCollapsed) details.setAttribute("open", "");

    details.addEventListener("toggle", () => {
      const collapsed = s.collapsedFolders;
      if (details.open) {
        const idx = collapsed.indexOf(sub);
        if (idx !== -1) collapsed.splice(idx, 1);
      } else {
        if (!collapsed.includes(sub)) collapsed.push(sub);
      }
      plugin.saveSettings();
    });

    if (!s.alphabeticOrder) {
      details.addEventListener("dragover", (e) => {
        if (
          !dragState ||
          dragState.type !== "folder" ||
          dragState.sourceEl === details
        )
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
        if (
          !dragState ||
          dragState.type !== "folder" ||
          dragState.sourceEl === details
        )
          return;

        const order = s.manualFolderOrder;
        const fromKey = (dragState.sourceEl as HTMLElement).dataset.subfolder!;
        const toKey = sub;
        const fromIdx = order.indexOf(fromKey);
        const toIdx = order.indexOf(toKey);
        if (fromIdx === -1 || toIdx === -1) return;

        order.splice(fromIdx, 1);
        order.splice(toIdx, 0, fromKey);
        plugin.saveSettings().then(() => plugin.refreshFolderView());
      });
    }

    const summary = details.createEl("summary", { cls: "referencer-group-header" });

    if (!s.alphabeticOrder) {
      const handle = summary.createEl("span", { cls: "referencer-drag-handle" });
      handle.textContent = "⠿";

      handle.addEventListener("dragstart", (e) => {
        dragState = { type: "folder", groupKey: "", sourceEl: details };
        details.classList.add("referencer-dragging");
        e.dataTransfer!.effectAllowed = "move";
        e.dataTransfer!.setDragImage(details, 0, 0);
        e.stopPropagation();
      });

      handle.addEventListener("dragend", () => {
        details.classList.remove("referencer-dragging");
        container
          .querySelectorAll(".referencer-drag-over")
          .forEach((el) => el.classList.remove("referencer-drag-over"));
        dragState = null;
      });

      handle.draggable = true;
    }

    summary.createEl("span", { text: sub });

    const ul = details.createEl("ul", { cls: "referencer-list" });
    for (const file of orderedFiles) {
      ul.appendChild(createFileItem(file, sub, plugin));
    }
  }

  if (rootFiles.length > 0) {
    const orderedRoot = s.alphabeticOrder
      ? rootFiles
      : applyOrder(rootFiles, s.manualFileOrder[""] ?? [], (f) => f.basename);

    // Trim stale root file entries
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
