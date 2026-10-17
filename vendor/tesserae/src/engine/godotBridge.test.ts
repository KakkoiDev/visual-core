import { describe, expect, it } from "vitest";
import { buildGodotAddonFiles, buildGodotPlaygroundFiles, buildTileSetImportAddonFile, enableGodotPlugin } from "./godotBridge";

describe("Godot Bridge", () => {
  it("installs the plugin without erasing existing project settings", () => {
    const project = `[application]\nconfig/name="QA"\n\n[editor_plugins]\n\nenabled=PackedStringArray("res://addons/other/plugin.cfg")\n`;
    const enabled = enableGodotPlugin(project);
    expect(enabled).toContain("res://addons/other/plugin.cfg");
    expect(enabled).toContain("res://addons/tesserae/plugin.cfg");
    expect(enableGodotPlugin(enabled)).toBe(enabled);
  });

  it("imports a .tesserae package as a native TileSet", () => {
    const script = new TextDecoder().decode(buildTileSetImportAddonFile().data);
    expect(script).toContain('return "TileSet"');
    expect(script).toContain("TileSetAtlasSource.new()");
    expect(script).toContain("set_terrain_peering_bit");
    expect(script).toContain('set_custom_data("terrain_id"');
  });

  it("ships one complete addon without duplicate importer files", () => {
    const files = buildGodotAddonFiles();
    expect(files.map((file) => file.name)).toEqual(["plugin.cfg", "plugin.gd", "tesserae_import_plugin.gd"]);
    expect(new Set(files.map((file) => file.name)).size).toBe(files.length);
  });

  it("adds the plugin section when a project does not have one yet", () => {
    const enabled = enableGodotPlugin('[application]\nconfig/name="Fresh"\n');
    expect(enabled).toContain("[editor_plugins]");
    expect(enabled).toContain('PackedStringArray("res://addons/tesserae/plugin.cfg")');
  });

  it("creates a ready-painted playground beside the imported terrain", () => {
    const files = buildGodotPlaygroundFiles("res://assets/tesserae/sand");
    const script = new TextDecoder().decode(files.find((file) => file.name.endsWith(".gd"))!.data);
    const scene = new TextDecoder().decode(files.find((file) => file.name.endsWith(".tscn"))!.data);
    expect(script).toContain('load("res://assets/tesserae/sand/source.tesserae")');
    expect(script).toContain("set_cells_terrain_connect");
    expect(script).toContain("terrain.set_cell");
    expect(scene).toContain("TileMapLayer");
  });
});
