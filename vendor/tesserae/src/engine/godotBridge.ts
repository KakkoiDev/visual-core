import type { TerrainRecipe, TextureRegistry } from "../types";
import { buildManifest, createGodotFiles } from "./export";
import type { ExportOptions, GodotExportFile } from "./export";
import { loadGodotProjectHandle, saveGodotProjectHandle } from "./projectStore";

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: (options?: { id?: string; mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
}

interface PermissionDirectoryHandle extends FileSystemDirectoryHandle {
  queryPermission?: (options: { mode: "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (options: { mode: "readwrite" }) => Promise<PermissionState>;
}

export interface GodotPublishResult {
  projectName: string;
  destination: string;
  fileCount: number;
  manifestHash: string;
}

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "terrain";
}

async function getDirectory(root: FileSystemDirectoryHandle, segments: string[]): Promise<FileSystemDirectoryHandle> {
  let current = root;
  for (const segment of segments) current = await current.getDirectoryHandle(segment, { create: true });
  return current;
}

async function writeFile(directory: FileSystemDirectoryHandle, name: string, data: Uint8Array | string): Promise<void> {
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(typeof data === "string" ? data : new Blob([new Uint8Array(data)]));
  await writable.close();
}

async function sha256(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(data));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function buildAddonBootstrapFiles(): GodotExportFile[] {
  const encoder = new TextEncoder();
  return [
    {
      name: "plugin.cfg",
      data: encoder.encode(`[plugin]\n\nname="Tesserae Bridge"\ndescription="Imports versioned Tesserae terrain recipes."\nauthor="Tesserae"\nversion="0.1.0"\nscript="plugin.gd"\n`),
    },
    {
      name: "plugin.gd",
      data: encoder.encode(`@tool\nextends EditorPlugin\n\nvar importer: EditorImportPlugin\n\nfunc _enter_tree() -> void:\n\timporter = preload("tesserae_import_plugin.gd").new()\n\tadd_import_plugin(importer)\n\nfunc _exit_tree() -> void:\n\tif importer != null:\n\t\tremove_import_plugin(importer)\n\timporter = null\n`),
    },
  ];
}

export function buildTileSetImportAddonFile(): GodotExportFile {
  const encoder = new TextEncoder();
  return {
    name: "tesserae_import_plugin.gd",
    data: encoder.encode(`@tool
extends EditorImportPlugin

func _get_importer_name() -> String:
\treturn "tesserae.tileset"

func _get_visible_name() -> String:
\treturn "Tesserae Terrain"

func _get_recognized_extensions() -> PackedStringArray:
\treturn PackedStringArray(["tesserae"])

func _get_save_extension() -> String:
\treturn "tres"

func _get_resource_type() -> String:
\treturn "TileSet"

func _get_preset_count() -> int:
\treturn 1

func _get_preset_name(_preset_index: int) -> String:
\treturn "Terrain ready to paint"

func _get_import_options(_path: String, _preset_index: int) -> Array[Dictionary]:
\treturn []

func _get_option_visibility(_path: String, _option_name: StringName, _options: Dictionary) -> bool:
\treturn true

func _get_import_order() -> int:
\treturn 100

func _get_priority() -> float:
\treturn 2.0

func _logical_polygon(tile_size: int) -> PackedVector2Array:
\tvar half := tile_size * 0.5
\treturn PackedVector2Array([Vector2(-half, -half), Vector2(half, -half), Vector2(half, half), Vector2(-half, half)])

func _add_custom_layer(tile_set: TileSet, name: String, type: int) -> void:
\tvar index := tile_set.get_custom_data_layers_count()
\ttile_set.add_custom_data_layer(index)
\ttile_set.set_custom_data_layer_name(index, name)
\ttile_set.set_custom_data_layer_type(index, type)

func _apply_semantics(tile_data: TileData, semantics: Dictionary, tile_size: int) -> void:
\ttile_data.set_custom_data("walkable", semantics.get("walkable", true))
\ttile_data.set_custom_data("surface_type", semantics.get("surfaceType", "terrain"))
\ttile_data.set_custom_data("footstep", semantics.get("footstep", "default"))
\ttile_data.set_custom_data("movement_cost", semantics.get("movementCost", 1.0))
\ttile_data.set_custom_data("terrain_id", semantics.get("terrainId", "terrain"))
\ttile_data.set_custom_data("transition_group", semantics.get("transitionGroup", "default"))
\ttile_data.set_custom_data("transition_priority", semantics.get("transitionPriority", 0))
\tif semantics.get("physicsEnabled", false):
\t\ttile_data.set_collision_polygons_count(0, 1)
\t\ttile_data.set_collision_polygon_points(0, 0, _logical_polygon(tile_size))
\tif semantics.get("navigationEnabled", false) and semantics.get("walkable", true):
\t\tvar navigation := NavigationPolygon.new()
\t\tnavigation.vertices = _logical_polygon(tile_size)
\t\tnavigation.add_polygon(PackedInt32Array([0, 1, 2, 3]))
\t\ttile_data.set_navigation_polygon(0, navigation)
\tif semantics.get("occlusionEnabled", false):
\t\tvar occluder := OccluderPolygon2D.new()
\t\toccluder.polygon = _logical_polygon(tile_size)
\t\ttile_data.set_occluder(0, occluder)

func _import(source_file: String, save_path: String, _options: Dictionary, _platform_variants: Array[String], _gen_files: Array[String]) -> Error:
\tvar parsed = JSON.parse_string(FileAccess.get_file_as_string(source_file))
\tif not parsed is Dictionary or not parsed.get("recipe") is Dictionary or not parsed.get("manifest") is Dictionary:
\t\tpush_error("Tesserae: invalid terrain package: " + source_file)
\t\treturn ERR_PARSE_ERROR
\tvar recipe: Dictionary = parsed["recipe"]
\tvar manifest: Dictionary = parsed["manifest"]
\tvar semantics: Dictionary = recipe.get("semantics", {})
\tvar tile_size := int(manifest.get("logicalTileSize", 64))
\tvar atlas_info: Dictionary = manifest.get("atlas", {})
\tvar region_size := Vector2i(int(atlas_info.get("regionWidth", tile_size)), int(atlas_info.get("regionHeight", tile_size)))
\tvar render_region: Dictionary = manifest.get("renderRegion", {})
\tvar texture_origin := Vector2i(
\t\tint(region_size.x * 0.5 - float(render_region.get("originX", 0)) - tile_size * 0.5),
\t\tint(region_size.y * 0.5 - float(render_region.get("originY", 0)) - tile_size * 0.5)
\t)
\tvar topology: String = str(manifest.get("topology", "blob47"))
\tvar tile_set := TileSet.new()
\ttile_set.tile_size = Vector2i(tile_size, tile_size)
\tif topology == "blob47":
\t\ttile_set.add_terrain_set(0)
\t\ttile_set.set_terrain_set_mode(0, TileSet.TERRAIN_MODE_MATCH_CORNERS_AND_SIDES)
\t\ttile_set.add_terrain(0, 0)
\t\ttile_set.set_terrain_name(0, 0, str(recipe.get("name", "Tesserae Terrain")))
\telse:
\t\t_add_custom_layer(tile_set, "dual_mask", TYPE_INT)
\tif semantics.get("physicsEnabled", false): tile_set.add_physics_layer(0)
\tif semantics.get("navigationEnabled", false): tile_set.add_navigation_layer(0)
\tif semantics.get("occlusionEnabled", false): tile_set.add_occlusion_layer(0)
\tfor semantic in [["walkable", TYPE_BOOL], ["surface_type", TYPE_STRING], ["footstep", TYPE_STRING], ["movement_cost", TYPE_FLOAT], ["terrain_id", TYPE_STRING], ["transition_group", TYPE_STRING], ["transition_priority", TYPE_INT]]:
\t\t_add_custom_layer(tile_set, semantic[0], semantic[1])
\tvar base_dir := source_file.get_base_dir()
\tvar variants: Dictionary = recipe.get("variants", {})
\tvar variant_count := 1 if topology == "dual16" else int(variants.get("count", 1))
\tvar weights: Array = variants.get("weights", [100])
\tvar peer_names := ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
\tvar peer_bits := [TileSet.CELL_NEIGHBOR_TOP_SIDE, TileSet.CELL_NEIGHBOR_TOP_RIGHT_CORNER, TileSet.CELL_NEIGHBOR_RIGHT_SIDE, TileSet.CELL_NEIGHBOR_BOTTOM_RIGHT_CORNER, TileSet.CELL_NEIGHBOR_BOTTOM_SIDE, TileSet.CELL_NEIGHBOR_BOTTOM_LEFT_CORNER, TileSet.CELL_NEIGHBOR_LEFT_SIDE, TileSet.CELL_NEIGHBOR_TOP_LEFT_CORNER]
\tfor variant_index in range(variant_count):
\t\tvar albedo := load(base_dir.path_join("tesserae-atlas-v%d.png" % [variant_index + 1])) as Texture2D
\t\tif albedo == null:
\t\t\tpush_error("Tesserae: atlas is not imported yet; reimport " + source_file)
\t\t\treturn ERR_FILE_NOT_FOUND
\t\tvar canvas_texture := CanvasTexture.new()
\t\tcanvas_texture.diffuse_texture = albedo
\t\tcanvas_texture.normal_texture = load(base_dir.path_join("tesserae-normal-v%d.png" % [variant_index + 1])) as Texture2D
\t\tvar source := TileSetAtlasSource.new()
\t\tsource.texture = canvas_texture
\t\tsource.texture_region_size = region_size
\t\tfor entry in manifest.get("tiles", []):
\t\t\tvar atlas: Dictionary = entry["atlas"]
\t\t\tvar coords := Vector2i(int(atlas["x"]), int(atlas["y"]))
\t\t\tsource.create_tile(coords)
\t\tfor utility in manifest.get("utilityTiles", []):
\t\t\tvar utility_atlas: Dictionary = utility["atlas"]
\t\t\tvar utility_coords := Vector2i(int(utility_atlas["x"]), int(utility_atlas["y"]))
\t\t\tsource.create_tile(utility_coords)
\t\tvar source_id := tile_set.add_source(source)
\t\tfor entry in manifest.get("tiles", []):
\t\t\tvar atlas: Dictionary = entry["atlas"]
\t\t\tvar coords := Vector2i(int(atlas["x"]), int(atlas["y"]))
\t\t\tvar tile_data := source.get_tile_data(coords, 0)
\t\t\ttile_data.texture_origin = texture_origin
\t\t\tif topology == "blob47":
\t\t\t\ttile_data.terrain_set = 0
\t\t\t\ttile_data.terrain = 0
\t\t\t\ttile_data.probability = max(0.0, float(weights[variant_index] if variant_index < weights.size() else 100))
\t\t\t\tvar peers: Dictionary = entry["peering"]
\t\t\t\tfor peer_index in range(peer_bits.size()):
\t\t\t\t\ttile_data.set_terrain_peering_bit(peer_bits[peer_index], 0 if peers.get(peer_names[peer_index], false) else -1)
\t\t\telse:
\t\t\t\ttile_data.set_custom_data("dual_mask", int(entry["mask"]))
\t\t\t_apply_semantics(tile_data, semantics, tile_size)
\t\tfor utility in manifest.get("utilityTiles", []):
\t\t\tvar utility_atlas: Dictionary = utility["atlas"]
\t\t\tvar utility_coords := Vector2i(int(utility_atlas["x"]), int(utility_atlas["y"]))
\t\t\tvar utility_data := source.get_tile_data(utility_coords, 0)
\t\t\tutility_data.texture_origin = texture_origin
\t\tif source_id < 0: return ERR_CANT_CREATE
\ttile_set.set_meta("tesserae_recipe", recipe)
\ttile_set.set_meta("tesserae_manifest", manifest)
\treturn ResourceSaver.save(tile_set, "%s.%s" % [save_path, _get_save_extension()])
`),
  };
}

export function buildGodotAddonFiles(): GodotExportFile[] {
  return [...buildAddonBootstrapFiles(), buildTileSetImportAddonFile()];
}

export function buildGodotPlaygroundFiles(resourceDirectory: string): GodotExportFile[] {
  const encoder = new TextEncoder();
  const directory = resourceDirectory.replace(/\/$/, "");
  const script = `extends Node2D

@onready var terrain: TileMapLayer = $Terrain
@onready var camera: Camera2D = $Camera2D

func _ready() -> void:
\tvar imported := load("${directory}/source.tesserae") as TileSet
\tif imported == null:
\t\tpush_error("Tesserae playground could not load its terrain")
\t\treturn
\tterrain.tile_set = imported
\tvar tile_size := imported.tile_size.x
\tcamera.position = Vector2(tile_size * 4.5, tile_size * 4.5)
\tvar cells: Array[Vector2i] = []
\tif imported.get_terrain_sets_count() > 0:
\t\tfor y in range(9):
\t\t\tfor x in range(9):
\t\t\t\tif x == 0 or y == 0 or x == 8 or y == 8 or (x >= 3 and x <= 5 and y >= 3 and y <= 5):
\t\t\t\t\tcells.append(Vector2i(x, y))
\t\tvar manifest: Dictionary = imported.get_meta("tesserae_manifest", {})
\t\tif str(manifest.get("outputMode", "composite")) == "cutout-outside":
\t\t\tvar cutout_source_id := imported.get_source_id(0)
\t\t\tvar utilities: Array = manifest.get("utilityTiles", [])
\t\t\tif utilities.size() > 0:
\t\t\t\tvar atlas: Dictionary = utilities[0].get("atlas", {})
\t\t\t\tvar fill_coords := Vector2i(int(atlas.get("x", 10)), int(atlas.get("y", 1)))
\t\t\t\tfor y in range(9):
\t\t\t\t\tfor x in range(9):
\t\t\t\t\t\tterrain.set_cell(Vector2i(x, y), cutout_source_id, fill_coords, 0)
\t\tterrain.set_cells_terrain_connect(cells, 0, 0, true)
\telse:
\t\tvar source_id := imported.get_source_id(0)
\t\tfor y in range(4):
\t\t\tfor x in range(4):
\t\t\t\tterrain.set_cell(Vector2i(x + 2, y + 2), source_id, Vector2i(x, y), 0)
\tprint("TESSERAE_PLAYGROUND_READY cells=", terrain.get_used_cells().size())
`;
  const scene = `[gd_scene load_steps=2 format=3]\n\n[ext_resource type="Script" path="${directory}/tesserae-playground.gd" id="1_script"]\n\n[node name="TesseraePlayground" type="Node2D"]\nscript = ExtResource("1_script")\n\n[node name="Terrain" type="TileMapLayer" parent="."]\n\n[node name="Camera2D" type="Camera2D" parent="."]\nposition = Vector2(288, 288)\n`;
  return [
    { name: "tesserae-playground.gd", data: encoder.encode(script) },
    { name: "tesserae-playground.tscn", data: encoder.encode(scene) },
  ];
}

export function enableGodotPlugin(projectText: string): string {
  const pluginPath = "res://addons/tesserae/plugin.cfg";
  if (projectText.includes(pluginPath)) return projectText;
  if (/^\[editor_plugins\]$/m.test(projectText)) {
    if (/^enabled=PackedStringArray\((.*)\)$/m.test(projectText)) {
      return projectText.replace(/^enabled=PackedStringArray\((.*)\)$/m, (_line, entries: string) => `enabled=PackedStringArray(${entries.trim() ? `${entries}, ` : ""}"${pluginPath}")`);
    }
    return projectText.replace(/^\[editor_plugins\]$/m, `[editor_plugins]\n\nenabled=PackedStringArray("${pluginPath}")`);
  }
  return `${projectText.trimEnd()}\n\n[editor_plugins]\n\nenabled=PackedStringArray("${pluginPath}")\n`;
}

export function canPublishToGodotProject(): boolean {
  return typeof (globalThis as unknown as DirectoryPickerWindow).showDirectoryPicker === "function";
}

export async function publishToGodotProject(
  recipe: TerrainRecipe,
  textures: TextureRegistry,
  options: ExportOptions = {},
): Promise<GodotPublishResult> {
  const picker = (globalThis as unknown as DirectoryPickerWindow).showDirectoryPicker;
  if (!picker) throw new Error("Direct folder publishing is not supported by this browser");
  let root = await loadGodotProjectHandle().catch(() => null) as PermissionDirectoryHandle | null;
  if (root) {
    let permission = await root.queryPermission?.({ mode: "readwrite" }) ?? "prompt";
    if (permission === "prompt") permission = await root.requestPermission?.({ mode: "readwrite" }) ?? "prompt";
    if (permission !== "granted") root = null;
  }
  if (!root) {
    root = await picker({ id: "tesserae-godot-project", mode: "readwrite" });
    await saveGodotProjectHandle(root).catch(() => undefined);
  }
  const projectFile = await root.getFileHandle("project.godot").catch(() => null);
  if (!projectFile) throw new Error("The selected folder is not a Godot project (project.godot is missing)");

  const projectText = await (await projectFile.getFile()).text();
  const projectName = projectText.match(/^config\/name="([^"]+)"/m)?.[1] ?? root.name;
  const destinationName = slugify(recipe.name);
  const destination = await getDirectory(root, ["assets", "tesserae", destinationName]);
  const addon = await getDirectory(root, ["addons", "tesserae"]);
  const files = await createGodotFiles(recipe, textures, options);
  const encoder = new TextEncoder();
  const sourceRecipe = encoder.encode(JSON.stringify({
    format: "tesserae.recipe",
    schemaVersion: 3,
    stableNamespace: `${recipe.topology}:${destinationName}`,
    recipe,
    manifest: buildManifest(recipe),
  }, null, 2));
  const playgroundFiles = buildGodotPlaygroundFiles(`res://assets/tesserae/${destinationName}`);
  const publishedFiles = [...files, { name: "source.tesserae", data: sourceRecipe }, ...playgroundFiles];
  const hashes: Record<string, string> = {};

  const addonFiles = buildGodotAddonFiles();
  for (const file of addonFiles) await writeFile(addon, file.name, file.data);
  await writeFile(root, "project.godot", enableGodotPlugin(projectText));
  await destination.removeEntry(`${destinationName}.tesserae`).catch(() => undefined);

  for (const file of publishedFiles) {
    if (options.signal?.aborted) throw new DOMException("Publish cancelled", "AbortError");
    await writeFile(destination, file.name, file.data);
    hashes[file.name] = await sha256(file.data);
  }
  const publication = encoder.encode(JSON.stringify({
    generator: "Tesserae",
    schemaVersion: 3,
    recipe: recipe.name,
    topology: recipe.topology,
    publishedAt: new Date().toISOString(),
    files: hashes,
  }, null, 2));
  await writeFile(destination, "tesserae-publication.json", publication);
  const manifestHash = await sha256(publication);
  return {
    projectName,
    destination: `res://assets/tesserae/${destinationName}`,
    fileCount: publishedFiles.length + addonFiles.length + 2,
    manifestHash,
  };
}
