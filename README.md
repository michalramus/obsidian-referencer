# Obsidian Referencer

Two dockable sidebar panels for navigating note relationships via a reference folder, with one-click link insertion at cursor.

## What it does

**Panel 1 — References:** Lists all notes from a configured folder.

**Panel 2 — Backlinks via References:** Shows notes that are contextually related to your currently open note:
1. Finds all wikilinks in the active note
2. Filters those to notes that exist in your reference folder (bridge notes)
3. Finds all other notes that also link to those bridge notes
4. Groups results by bridge note, each group collapsible

**Clicking any note** in either panel inserts `[[NoteTitle]]` at the current cursor position in the active editor.

## Installation

### From source

Requirements: Node.js 18+

```bash
git clone https://github.com/your-username/obsidian-referencer
cd obsidian-referencer
npm install
npm run build
```

Copy the plugin folder into your vault:

```bash
cp -r obsidian-referencer <your-vault>/.obsidian/plugins/obsidian-referencer
```

Then in Obsidian: **Settings → Community plugins → turn off Safe mode → enable "Referencer"**.

### Manual (pre-built)

1. Download `main.js`, `manifest.json`, and `styles.css`
2. Create folder `<your-vault>/.obsidian/plugins/obsidian-referencer/`
3. Place the three files inside
4. In Obsidian: **Settings → Community plugins → enable "Referencer"**

## Configuration

Go to **Settings → Referencer** and set the **Reference folder** path relative to your vault root.

Example: if your reference notes live at `vault/References/`, enter `References`.

## Development

```bash
npm run dev   # rebuilds on every file save
```

For faster iteration, symlink the plugin folder into your vault:

```bash
ln -s /path/to/obsidian-referencer <your-vault>/.obsidian/plugins/obsidian-referencer
```

Then reload the plugin in Obsidian after each build (**Ctrl/Cmd+P → Reload app without saving**).
