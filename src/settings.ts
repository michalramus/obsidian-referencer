import { App, PluginSettingTab, Setting } from "obsidian";
import type ReferencerPlugin from "./main";

export class ReferencerSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: ReferencerPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Reference folder")
      .setDesc("Path relative to vault root (e.g. References)")
      .addText((text) =>
        text
          .setPlaceholder("References")
          .setValue(this.plugin.settings.folderPath)
          .onChange(async (value) => {
            this.plugin.settings.folderPath = value.trim();
            await this.plugin.saveSettings();
            this.plugin.refreshAllViews();
          })
      );

    new Setting(containerEl)
      .setName("Filter backlinks panel by folder")
      .setDesc("When enabled, the backlinks panel only shows links through notes in the reference folder.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.filterBacklinksByFolder)
          .onChange(async (value) => {
            this.plugin.settings.filterBacklinksByFolder = value;
            await this.plugin.saveSettings();
            this.plugin.refreshAllViews();
          })
      );

    new Setting(containerEl)
      .setName("Alphabetic order in References panel")
      .setDesc("When off, you can drag to reorder folders and files in the References panel.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.alphabeticOrder)
          .onChange(async (value) => {
            this.plugin.settings.alphabeticOrder = value;
            await this.plugin.saveSettings();
            this.plugin.refreshFolderView();
            this.display();
          })
      );

    if (!this.plugin.settings.alphabeticOrder) {
      new Setting(containerEl)
        .setName("Reset manual order")
        .setDesc("Clears saved order. The next render will re-capture alphabetic order as the baseline.")
        .addButton((btn) =>
          btn
            .setButtonText("Reset")
            .setWarning()
            .onClick(async () => {
              this.plugin.settings.manualFolderOrder = [];
              this.plugin.settings.manualFileOrder = {};
              await this.plugin.saveSettings();
              this.plugin.refreshFolderView();
            })
        );
    }
  }
}
