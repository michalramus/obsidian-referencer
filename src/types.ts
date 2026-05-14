import type { TFile } from "obsidian";

export interface BridgeInfo {
  path: string;
  basename: string;
  file: TFile | null;
}

export interface ReferencerSettings {
  folderPath: string;
  filterBacklinksByFolder: boolean;
  collapsedFolders: string[];
  collapsedGroups: string[];
  alphabeticOrder: boolean;
  manualFolderOrder: string[];
  manualFileOrder: Record<string, string[]>;
  manualSubfolderOrder: Record<string, string[]>;
}

export const DEFAULT_SETTINGS: ReferencerSettings = {
  folderPath: "",
  filterBacklinksByFolder: true,
  collapsedFolders: [],
  collapsedGroups: [],
  alphabeticOrder: true,
  manualFolderOrder: [],
  manualFileOrder: {},
  manualSubfolderOrder: {},
};
