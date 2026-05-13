export interface ReferencerSettings {
  folderPath: string;
  filterBacklinksByFolder: boolean;
  collapsedFolders: string[];
  collapsedGroups: string[];
  alphabeticOrder: boolean;
  manualFolderOrder: string[];
  manualFileOrder: Record<string, string[]>;
}

export const DEFAULT_SETTINGS: ReferencerSettings = {
  folderPath: "",
  filterBacklinksByFolder: true,
  collapsedFolders: [],
  collapsedGroups: [],
  alphabeticOrder: true,
  manualFolderOrder: [],
  manualFileOrder: {},
};
