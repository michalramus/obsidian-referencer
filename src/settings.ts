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
  }
}
