import { terrainEdgeDeformations } from "../types.js";
import { BIT, BLOB_CUTOUT_FILL_ATLAS_COORDS, hasBit } from "./blob47.js";
import { DUAL_BIT } from "./dual16.js";
import { projectionFootprint, renderCutoutFillTilePixels, renderProjectedAuxiliaryTilePixels, renderProjectedMapPixels, renderProjectedTilePixels, } from "./render.js";
import { getTerrainMasks, terrainAtlasCoords, terrainAtlasLayout, terrainMaskLabel } from "./topology.js";
import { abortError, AtlasWorkerClient } from "./atlasWorkerClient.js";
import { buildGodotPatternScript } from "./patterns.js";
import { assessQuality, assertQuality } from "./quality.js";
export const ATLAS_COLUMNS = 12;
export const ATLAS_ROWS = 4;
export function usesBlobCutoutFillTile(recipe) {
    return recipe.topology === "blob47" && recipe.shape.outputMode === "cutout-outside";
}
export function exportedTileCount(recipe) {
    return getTerrainMasks(recipe).length + (usesBlobCutoutFillTile(recipe) ? 1 : 0);
}
export function atlasCellFootprint(recipe, logicalSize = recipe.shape.tileSize) {
    const content = projectionFootprint(recipe, logicalSize);
    const width = Math.ceil(content.width / logicalSize) * logicalSize;
    const height = Math.ceil(content.height / logicalSize) * logicalSize;
    return {
        ...content,
        width,
        height,
        margins: {
            ...content.margins,
            right: content.margins.right + width - content.width,
            bottom: content.margins.bottom + height - content.height,
        },
    };
}
export function buildAtlasCanvas(recipe, textures, variant = 0) {
    const size = recipe.shape.tileSize;
    const content = projectionFootprint(recipe, size);
    const region = atlasCellFootprint(recipe, size);
    const layout = terrainAtlasLayout(recipe);
    const canvas = document.createElement("canvas");
    canvas.width = region.width * layout.columns;
    canvas.height = region.height * layout.rows;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context)
        throw new Error("Canvas 2D indisponible");
    context.imageSmoothingEnabled = false;
    getTerrainMasks(recipe).forEach((mask, index) => {
        const pixels = renderProjectedTilePixels(recipe, mask, size, textures, variant).pixels;
        const image = new ImageData(new Uint8ClampedArray(pixels), content.width, content.height);
        const coords = terrainAtlasCoords(recipe, mask, index);
        const x = coords.x * region.width;
        const y = coords.y * region.height;
        context.putImageData(image, x, y);
    });
    if (usesBlobCutoutFillTile(recipe)) {
        const pixels = renderCutoutFillTilePixels(recipe, size, textures, variant);
        context.putImageData(new ImageData(new Uint8ClampedArray(pixels), size, size), BLOB_CUTOUT_FILL_ATLAS_COORDS.x * region.width, BLOB_CUTOUT_FILL_ATLAS_COORDS.y * region.height);
    }
    return canvas;
}
function nextPaint() {
    return new Promise((resolve) => {
        if (typeof requestAnimationFrame === "function")
            requestAnimationFrame(() => resolve());
        else
            setTimeout(resolve, 0);
    });
}
function throwIfAborted(signal) {
    if (signal?.aborted)
        throw abortError();
}
function canvasFromPixels(width, height, pixels) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context)
        throw new Error("Canvas 2D indisponible");
    context.imageSmoothingEnabled = false;
    context.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
    return canvas;
}
async function renderWithWorker(recipe, textures, variant, channel, options) {
    if (!AtlasWorkerClient.supported())
        return null;
    const ownsClient = !options.workerClient;
    const client = options.workerClient ?? new AtlasWorkerClient(recipe, textures);
    try {
        const result = await client.render(variant, channel, options.signal, ({ completed, total }) => options.onProgress?.(completed, total));
        throwIfAborted(options.signal);
        return canvasFromPixels(result.width, result.height, result.pixels);
    }
    finally {
        if (ownsClient)
            client.dispose();
    }
}
export async function buildAtlasCanvasAsync(recipe, textures, variant = 0, options = {}) {
    throwIfAborted(options.signal);
    const workerCanvas = await renderWithWorker(recipe, textures, variant, "albedo", options);
    if (workerCanvas)
        return workerCanvas;
    const size = recipe.shape.tileSize;
    const content = projectionFootprint(recipe, size);
    const region = atlasCellFootprint(recipe, size);
    const layout = terrainAtlasLayout(recipe);
    const canvas = document.createElement("canvas");
    canvas.width = region.width * layout.columns;
    canvas.height = region.height * layout.rows;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context)
        throw new Error("Canvas 2D indisponible");
    context.imageSmoothingEnabled = false;
    const masks = getTerrainMasks(recipe);
    const tileTotal = exportedTileCount(recipe);
    for (let index = 0; index < masks.length; index += 1) {
        throwIfAborted(options.signal);
        if (index > 0)
            await nextPaint();
        const mask = masks[index];
        const pixels = renderProjectedTilePixels(recipe, mask, size, textures, variant).pixels;
        const coords = terrainAtlasCoords(recipe, mask, index);
        context.putImageData(new ImageData(new Uint8ClampedArray(pixels), content.width, content.height), coords.x * region.width, coords.y * region.height);
        options.onProgress?.(index + 1, tileTotal);
    }
    if (usesBlobCutoutFillTile(recipe)) {
        throwIfAborted(options.signal);
        context.putImageData(new ImageData(new Uint8ClampedArray(renderCutoutFillTilePixels(recipe, size, textures, variant)), size, size), BLOB_CUTOUT_FILL_ATLAS_COORDS.x * region.width, BLOB_CUTOUT_FILL_ATLAS_COORDS.y * region.height);
        options.onProgress?.(tileTotal, tileTotal);
    }
    return canvas;
}
export async function buildInteriorAtlasCanvasAsync(recipe, textures, variant = 0, options = {}) {
    throwIfAborted(options.signal);
    const region = atlasCellFootprint(recipe);
    const layout = terrainAtlasLayout(recipe);
    const canvas = document.createElement("canvas");
    canvas.width = region.width * layout.columns;
    canvas.height = region.height * layout.rows;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context)
        throw new Error("Canvas 2D indisponible");
    context.imageSmoothingEnabled = false;
    const masks = getTerrainMasks(recipe);
    const tileTotal = exportedTileCount(recipe);
    for (let index = 0; index < masks.length; index += 1) {
        throwIfAborted(options.signal);
        if (index > 0)
            await nextPaint();
        const mask = masks[index];
        const rendered = renderInteriorAtlasTilePixels(recipe, mask, textures, variant);
        const coords = terrainAtlasCoords(recipe, mask, index);
        context.putImageData(new ImageData(new Uint8ClampedArray(rendered.pixels), rendered.width, rendered.height), coords.x * region.width, coords.y * region.height);
        options.onProgress?.(index + 1, tileTotal);
    }
    if (usesBlobCutoutFillTile(recipe)) {
        throwIfAborted(options.signal);
        context.putImageData(new ImageData(new Uint8ClampedArray(renderCutoutFillTilePixels(recipe, recipe.shape.tileSize, textures, variant)), recipe.shape.tileSize, recipe.shape.tileSize), BLOB_CUTOUT_FILL_ATLAS_COORDS.x * region.width, BLOB_CUTOUT_FILL_ATLAS_COORDS.y * region.height);
        options.onProgress?.(tileTotal, tileTotal);
    }
    return canvas;
}
export function renderInteriorAtlasTilePixels(recipe, mask, textures, variant = 0) {
    const size = recipe.shape.tileSize;
    const region = atlasCellFootprint(recipe, size);
    const cliff = recipe.layers.find((layer) => layer.enabled && layer.cliffEnabled && layer.cliffInteriorEnabled);
    if (!cliff) {
        const rendered = renderProjectedTilePixels(recipe, mask, size, textures, variant);
        const pixels = new Uint8ClampedArray(region.width * region.height * 4);
        for (let y = 0; y < rendered.footprint.height; y += 1) {
            pixels.set(rendered.pixels.subarray(y * rendered.footprint.width * 4, (y + 1) * rendered.footprint.width * 4), y * region.width * 4);
        }
        return { pixels, width: region.width, height: region.height };
    }
    const direction = cliff.cliffDirection;
    const vector = direction === "N" ? { x: 0, y: -1 } : direction === "E" ? { x: 1, y: 0 } : direction === "W" ? { x: -1, y: 0 } : { x: 0, y: 1 };
    const neighbourBit = direction === "N" ? BIT.N : direction === "E" ? BIT.E : direction === "W" ? BIT.W : BIT.S;
    const reciprocalMask = direction === "N" ? BIT.S : direction === "E" ? BIT.W : direction === "W" ? BIT.E : BIT.N;
    const target = { x: 1, y: 1, mask };
    const occluders = recipe.topology === "blob47" && hasBit(mask, neighbourBit) && textures.has(`override:${reciprocalMask}`)
        ? [{ x: target.x + vector.x, y: target.y + vector.y, mask: reciprocalMask }]
        : [];
    const rendered = renderProjectedMapPixels(recipe, [target], 4, 4, size, textures, variant, false, {
        wallMaterials: new Map([[`${target.x},${target.y}`, "inner"]]),
        wallSurfaceOccluders: occluders,
        textureOriginCell: { x: target.x, y: target.y },
    });
    const pixels = new Uint8ClampedArray(region.width * region.height * 4);
    const cropX = target.x * size;
    const cropY = target.y * size;
    for (let y = 0; y < region.height; y += 1) {
        const sourceY = cropY + y;
        if (sourceY < 0 || sourceY >= rendered.height)
            continue;
        const available = Math.max(0, Math.min(region.width, rendered.width - cropX));
        if (available <= 0)
            continue;
        pixels.set(rendered.pixels.subarray((sourceY * rendered.width + cropX) * 4, (sourceY * rendered.width + cropX + available) * 4), y * region.width * 4);
    }
    return { pixels, width: region.width, height: region.height };
}
export async function buildAuxiliaryAtlasCanvasAsync(recipe, channel, variant = 0, options = {}, textures = new Map()) {
    throwIfAborted(options.signal);
    const workerCanvas = await renderWithWorker(recipe, textures, variant, channel, options);
    if (workerCanvas)
        return workerCanvas;
    const size = recipe.shape.tileSize;
    const content = projectionFootprint(recipe, size);
    const region = atlasCellFootprint(recipe, size);
    const layout = terrainAtlasLayout(recipe);
    const canvas = document.createElement("canvas");
    canvas.width = region.width * layout.columns;
    canvas.height = region.height * layout.rows;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context)
        throw new Error("Canvas 2D indisponible");
    context.imageSmoothingEnabled = false;
    const masks = getTerrainMasks(recipe);
    const tileTotal = exportedTileCount(recipe);
    for (let index = 0; index < masks.length; index += 1) {
        throwIfAborted(options.signal);
        if (index > 0)
            await nextPaint();
        const pixels = renderProjectedAuxiliaryTilePixels(recipe, masks[index], size, channel, variant, textures).pixels;
        const mask = masks[index];
        const coords = terrainAtlasCoords(recipe, mask, index);
        context.putImageData(new ImageData(new Uint8ClampedArray(pixels), content.width, content.height), coords.x * region.width, coords.y * region.height);
        options.onProgress?.(index + 1, tileTotal);
    }
    if (usesBlobCutoutFillTile(recipe)) {
        throwIfAborted(options.signal);
        context.putImageData(new ImageData(new Uint8ClampedArray(renderCutoutFillTilePixels(recipe, size, textures, variant, channel)), size, size), BLOB_CUTOUT_FILL_ATLAS_COORDS.x * region.width, BLOB_CUTOUT_FILL_ATLAS_COORDS.y * region.height);
        options.onProgress?.(tileTotal, tileTotal);
    }
    return canvas;
}
export function canvasToPng(canvas) {
    return new Promise((resolve, reject) => {
        canvas.toBlob(async (blob) => {
            if (!blob) {
                reject(new Error("Impossible de produire le PNG"));
                return;
            }
            resolve(new Uint8Array(await blob.arrayBuffer()));
        }, "image/png");
    });
}
export function inspectPng(data) {
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (data.length < 24 || !signature.every((byte, index) => data[index] === byte))
        throw new Error("PNG invalide : signature absente");
    if (String.fromCharCode(...data.slice(12, 16)) !== "IHDR")
        throw new Error("PNG invalide : bloc IHDR absent");
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const width = view.getUint32(16, false);
    const height = view.getUint32(20, false);
    if (width < 1 || height < 1)
        throw new Error("PNG invalide : dimensions nulles");
    return { width, height };
}
export function buildManifest(recipe) {
    const layout = terrainAtlasLayout(recipe);
    const masks = getTerrainMasks(recipe);
    const content = projectionFootprint(recipe);
    const region = atlasCellFootprint(recipe);
    return {
        generator: "Tesserae",
        schemaVersion: 3,
        recipe: recipe.name,
        topology: recipe.topology,
        dualDiagonal: recipe.dualDiagonal,
        productionProfile: recipe.productionProfile ?? "free",
        outputMode: recipe.shape.outputMode,
        cutoutExtrusion: recipe.shape.cutoutExtrusion,
        cutoutExtrusionPx: recipe.shape.cutoutExtrusion * recipe.shape.tileSize,
        transparentBackground: recipe.shape.outputMode === "composite" ? recipe.shape.transparentBackground : true,
        tileSize: recipe.shape.tileSize,
        logicalTileSize: recipe.shape.tileSize,
        edgeDeformation: {
            mode: recipe.shape.deformationMode,
            amount: recipe.shape.roughness,
            frequency: recipe.shape.frequency,
            phase: recipe.shape.deformationPhase,
            organicOffset: recipe.shape.organicOffset,
            organicOctaves: recipe.shape.organicOctaves,
            organicPersistence: recipe.shape.organicPersistence,
            seed: recipe.shape.seed,
            effects: terrainEdgeDeformations(recipe.shape),
        },
        renderRegion: {
            width: content.width,
            height: content.height,
            originX: content.originX,
            originY: content.originY,
            margins: content.margins,
        },
        semantics: recipe.semantics,
        patterns: recipe.patterns.map((pattern) => ({ id: pattern.id, name: pattern.name, width: pattern.width, height: pattern.height, cells: pattern.cells.length })),
        atlas: {
            columns: layout.columns,
            rows: layout.rows,
            tileCount: exportedTileCount(recipe),
            terrainStateCount: masks.length,
            regionWidth: region.width,
            regionHeight: region.height,
            contentWidth: content.width,
            contentHeight: content.height,
            padding: { right: region.width - content.width, bottom: region.height - content.height },
        },
        variants: { count: recipe.variants.count, weights: recipe.variants.weights },
        channels: {
            albedo: "tesserae-atlas-v{n}.png",
            interiorAlbedo: recipe.layers.some((layer) => layer.cliffEnabled && layer.cliffInteriorEnabled) ? "tesserae-atlas-inner-v{n}.png" : null,
            normal: "tesserae-normal-v{n}.png",
            height: "tesserae-height-v{n}.png",
            ao: "tesserae-ao-v{n}.png",
        },
        utilityTiles: usesBlobCutoutFillTile(recipe) ? [{
                role: "cutout-fill",
                atlas: BLOB_CUTOUT_FILL_ATLAS_COORDS,
                terrain: false,
                usage: "Prefill a bounded TileMapLayer, then overwrite carved cells with terrain-connect states.",
            }] : [],
        artDirection: recipe.artDirection,
        materialBrightness: recipe.layers.map((layer) => ({ id: layer.id, brightness: layer.brightness })),
        materialShadows: recipe.layers.filter((layer) => layer.shadowEnabled).map((layer) => ({
            type: "external",
            id: layer.id,
            color: layer.shadowColor,
            opacity: layer.shadowOpacity,
            distance: layer.shadowDistance,
            angle: layer.shadowAngle,
            blur: layer.shadowBlur,
            affectsAo: layer.shadowAffectsAo,
        })),
        edgeProfiles: recipe.layers.filter((layer) => layer.kind === "band").map((layer) => ({
            id: layer.id,
            name: layer.name,
            placement: layer.placement,
            distanceOffset: layer.distanceOffset,
            width: layer.width,
            widthPercentOfTile: Math.round(layer.width * 10000) / 100,
            textureScale: layer.scale,
            fades: { inner: layer.innerFade, outer: layer.outerFade, curve: layer.fadeCurve },
            inwardTransparency: layer.fadeInward,
            contours: { inner: layer.innerContour, outer: layer.outerContour },
            relief: {
                height: layer.relief,
                strength: layer.reliefStrength,
                angle: layer.reliefAngle,
                softness: layer.reliefSoftness,
            },
            projectedCliff: {
                enabled: layer.cliffEnabled,
                direction: layer.cliffDirection,
                heightSteps: layer.cliffHeightSteps,
                directional: layer.cliffDirectional,
                sideDepth: layer.cliffSideDepth,
                rearDepth: layer.cliffRearDepth,
                patternSizePx: layer.cliffPatternSizePx,
                horizontalTextureOffsetPx: layer.cliffTextureOffsetXPx,
                verticalSampling: layer.cliffVerticalSampling,
                crown: {
                    enabled: layer.cliffCrownEnabled,
                    widthPx: layer.cliffCrownWidthPx,
                    patternSizePx: layer.cliffCrownPatternSizePx,
                    texture: layer.cliffCrownTextureName ?? "derived from front",
                    mapping: "contour ribbon",
                },
                textureMapping: "output-pixel faithful",
                detailDensity: layer.cliffDetailDensity,
                detailStrength: layer.cliffDetailStrength,
                directionalTextures: {
                    front: layer.textureName ?? "procedural",
                    interior: layer.cliffInteriorEnabled ? layer.cliffInteriorTextureName ?? layer.cliffInteriorColor : null,
                    crown: layer.cliffCrownTextureName ?? "derived from front",
                    side: layer.cliffSideTextureName ?? "derived from front",
                    rear: layer.cliffRearTextureName ?? "derived from front",
                    detail: layer.cliffDetailTextureName ?? null,
                },
                directionField: "projected normal RG",
                fineOffset: { x: layer.cliffOffsetX, y: layer.cliffOffsetY },
                shear: layer.cliffShear,
                shadow: layer.cliffShadow,
                hiddenOverlap: layer.cliffOverlap,
                faceOnly: layer.cliffFaceOnly,
            },
        })),
        bitOrder: recipe.topology === "dual16"
            ? ["NW", "NE", "SE", "SW"]
            : ["N", "NE", "E", "SE", "S", "SW", "W", "NW"],
        tiles: masks.map((mask, index) => ({
            stableId: `${recipe.topology}:mask:${mask}`,
            index,
            mask,
            binary: mask.toString(2).padStart(8, "0"),
            label: terrainMaskLabel(recipe, mask),
            atlas: terrainAtlasCoords(recipe, mask, index),
            corners: {
                NW: Boolean(mask & DUAL_BIT.NW),
                NE: Boolean(mask & DUAL_BIT.NE),
                SE: Boolean(mask & DUAL_BIT.SE),
                SW: Boolean(mask & DUAL_BIT.SW),
            },
            peering: {
                N: hasBit(mask, BIT.N),
                NE: hasBit(mask, BIT.NE),
                E: hasBit(mask, BIT.E),
                SE: hasBit(mask, BIT.SE),
                S: hasBit(mask, BIT.S),
                SW: hasBit(mask, BIT.SW),
                W: hasBit(mask, BIT.W),
                NW: hasBit(mask, BIT.NW),
            },
            overridden: Boolean(recipe.overrides[String(mask)]),
        })),
    };
}
function gdBool(value) {
    return value ? "0" : "-1";
}
function buildGodotDualImporter(recipe) {
    const region = atlasCellFootprint(recipe);
    const textureOriginX = Math.round(region.width / 2 - region.originX - recipe.shape.tileSize / 2);
    const textureOriginY = Math.round(region.height / 2 - region.originY - recipe.shape.tileSize / 2);
    const entries = buildManifest(recipe).tiles.map((tile) => `\t{ "coords": Vector2i(${tile.atlas.x}, ${tile.atlas.y}), "mask": ${tile.mask} }`).join(",\n");
    return `@tool
extends EditorScript

# Generated by Tesserae — Dual Grid 16.
const TILE_SIZE := ${recipe.shape.tileSize}
const REGION_SIZE := Vector2i(${region.width}, ${region.height})
const TEXTURE_ORIGIN := Vector2i(${textureOriginX}, ${textureOriginY})
const ATLAS_FILE := "tesserae-atlas-v1.png"
const NORMAL_FILE := "tesserae-normal-v1.png"
const OUTPUT_FILE := "tesserae-dual16-tileset.tres"
const PHYSICS_ENABLED := ${recipe.semantics.physicsEnabled}
const NAVIGATION_ENABLED := ${recipe.semantics.navigationEnabled}
const OCCLUSION_ENABLED := ${recipe.semantics.occlusionEnabled}
const WALKABLE := ${recipe.semantics.walkable}
const SURFACE_TYPE := ${JSON.stringify(recipe.semantics.surfaceType)}
const FOOTSTEP := ${JSON.stringify(recipe.semantics.footstep)}
const MOVEMENT_COST := ${recipe.semantics.movementCost}
const TERRAIN_ID := ${JSON.stringify(recipe.semantics.terrainId)}
const TRANSITION_GROUP := ${JSON.stringify(recipe.semantics.transitionGroup)}
const TRANSITION_PRIORITY := ${recipe.semantics.transitionPriority}
const TILES := [
${entries}
]

func _logical_polygon() -> PackedVector2Array:
\tvar half := TILE_SIZE * 0.5
\treturn PackedVector2Array([Vector2(-half, -half), Vector2(half, -half), Vector2(half, half), Vector2(-half, half)])

func _apply_semantics(tile_data: TileData) -> void:
\ttile_data.set_custom_data("walkable", WALKABLE)
\ttile_data.set_custom_data("surface_type", SURFACE_TYPE)
\ttile_data.set_custom_data("footstep", FOOTSTEP)
\ttile_data.set_custom_data("movement_cost", MOVEMENT_COST)
\ttile_data.set_custom_data("terrain_id", TERRAIN_ID)
\ttile_data.set_custom_data("transition_group", TRANSITION_GROUP)
\ttile_data.set_custom_data("transition_priority", TRANSITION_PRIORITY)
\tif PHYSICS_ENABLED:
\t\ttile_data.set_collision_polygons_count(0, 1)
\t\ttile_data.set_collision_polygon_points(0, 0, _logical_polygon())
\tif NAVIGATION_ENABLED and WALKABLE:
\t\tvar navigation := NavigationPolygon.new()
\t\tnavigation.vertices = _logical_polygon()
\t\tnavigation.add_polygon(PackedInt32Array([0, 1, 2, 3]))
\t\ttile_data.set_navigation_polygon(0, navigation)
\tif OCCLUSION_ENABLED:
\t\tvar occluder := OccluderPolygon2D.new()
\t\toccluder.polygon = _logical_polygon()
\t\ttile_data.set_occluder(0, occluder)

func _run() -> void:
\tvar base_dir := get_script().resource_path.get_base_dir()
\tvar atlas_path := base_dir.path_join(ATLAS_FILE)
\tvar normal_path := base_dir.path_join(NORMAL_FILE)
\tvar output_path := base_dir.path_join(OUTPUT_FILE)
\tvar albedo := load(atlas_path) as Texture2D
\tif albedo == null:
\t\tpush_error("Tesserae Dual 16: atlas not found")
\t\treturn
\tvar canvas_texture := CanvasTexture.new()
\tcanvas_texture.diffuse_texture = albedo
\tcanvas_texture.normal_texture = load(normal_path) as Texture2D
\tvar tile_set := TileSet.new()
\ttile_set.tile_size = Vector2i(TILE_SIZE, TILE_SIZE)
\ttile_set.add_custom_data_layer(0)
\ttile_set.set_custom_data_layer_name(0, "dual_mask")
\ttile_set.set_custom_data_layer_type(0, TYPE_INT)
\tif PHYSICS_ENABLED:
\t\ttile_set.add_physics_layer(0)
\tif NAVIGATION_ENABLED:
\t\ttile_set.add_navigation_layer(0)
\tif OCCLUSION_ENABLED:
\t\ttile_set.add_occlusion_layer(0)
\tfor semantic in [["walkable", TYPE_BOOL], ["surface_type", TYPE_STRING], ["footstep", TYPE_STRING], ["movement_cost", TYPE_FLOAT], ["terrain_id", TYPE_STRING], ["transition_group", TYPE_STRING], ["transition_priority", TYPE_INT]]:
\t\tvar layer_index := tile_set.get_custom_data_layers_count()
\t\ttile_set.add_custom_data_layer(layer_index)
\t\ttile_set.set_custom_data_layer_name(layer_index, semantic[0])
\t\ttile_set.set_custom_data_layer_type(layer_index, semantic[1])
\tvar source := TileSetAtlasSource.new()
\tsource.texture = canvas_texture
\tsource.texture_region_size = REGION_SIZE
\tfor entry in TILES:
\t\tvar coords: Vector2i = entry["coords"]
\t\tsource.create_tile(coords)
\t\tvar tile_data := source.get_tile_data(coords, 0)
\t\ttile_data.texture_origin = TEXTURE_ORIGIN
\t\ttile_data.set_custom_data("dual_mask", entry["mask"])
\t\t_apply_semantics(tile_data)
\ttile_set.add_source(source)
\tvar result := ResourceSaver.save(tile_set, output_path)
\tif result == OK:
\t\tprint("Tesserae Dual 16: TileSet created: ", output_path)
\telse:
\t\tpush_error("Tesserae Dual 16: ResourceSaver failed: " + str(result))
`;
}
export function buildGodotImporter(recipe) {
    if (recipe.topology === "dual16")
        return buildGodotDualImporter(recipe);
    const manifest = buildManifest(recipe);
    const importerVariantCount = terrainEdgeDeformations(recipe.shape).some((effect) => effect.mode === "artistic") ? recipe.variants.count : 1;
    const atlasPaths = Array.from({ length: importerVariantCount }, (_, index) => `"tesserae-atlas-v${index + 1}.png"`).join(", ");
    const exportsInterior = recipe.layers.some((layer) => layer.cliffEnabled && layer.cliffInteriorEnabled);
    const innerAtlasPaths = exportsInterior
        ? Array.from({ length: importerVariantCount }, (_, index) => `"tesserae-atlas-inner-v${index + 1}.png"`).join(", ")
        : "";
    const normalPaths = Array.from({ length: importerVariantCount }, (_, index) => `"tesserae-normal-v${index + 1}.png"`).join(", ");
    const variantWeights = Array.from({ length: importerVariantCount }, (_, index) => Math.max(0, recipe.variants.weights[index] ?? 1)).join(", ");
    const region = atlasCellFootprint(recipe);
    const textureOriginX = Math.round(region.width / 2 - region.originX - recipe.shape.tileSize / 2);
    const textureOriginY = Math.round(region.height / 2 - region.originY - recipe.shape.tileSize / 2);
    const entries = manifest.tiles
        .map((tile) => `\t{\n\t\t"coords": Vector2i(${tile.atlas.x}, ${tile.atlas.y}),\n\t\t"bits": [${[
        tile.peering.N,
        tile.peering.NE,
        tile.peering.E,
        tile.peering.SE,
        tile.peering.S,
        tile.peering.SW,
        tile.peering.W,
        tile.peering.NW,
    ]
        .map(gdBool)
        .join(", ")}]\n\t}`)
        .join(",\n");
    return `@tool
extends EditorScript

# Generated by Tesserae.
# Place this script beside the exported tesserae-atlas and tesserae-normal PNGs,
# then run it from the Godot 4.x Script editor. It writes tesserae-tileset.tres.

const TILE_SIZE := ${recipe.shape.tileSize}
const REGION_SIZE := Vector2i(${region.width}, ${region.height})
const TEXTURE_ORIGIN := Vector2i(${textureOriginX}, ${textureOriginY})
const ATLAS_FILES := [${atlasPaths}]
const HAS_INTERIOR_ATLAS := ${exportsInterior}
const INNER_ATLAS_FILES := [${innerAtlasPaths}]
const NORMAL_FILES := [${normalPaths}]
const VARIANT_WEIGHTS := [${variantWeights}]
const OUTPUT_FILE := "tesserae-tileset.tres"
const PHYSICS_ENABLED := ${recipe.semantics.physicsEnabled}
const NAVIGATION_ENABLED := ${recipe.semantics.navigationEnabled}
const OCCLUSION_ENABLED := ${recipe.semantics.occlusionEnabled}
const WALKABLE := ${recipe.semantics.walkable}
const SURFACE_TYPE := ${JSON.stringify(recipe.semantics.surfaceType)}
const FOOTSTEP := ${JSON.stringify(recipe.semantics.footstep)}
const MOVEMENT_COST := ${recipe.semantics.movementCost}
const TERRAIN_ID := ${JSON.stringify(recipe.semantics.terrainId)}
const TRANSITION_GROUP := ${JSON.stringify(recipe.semantics.transitionGroup)}
const TRANSITION_PRIORITY := ${recipe.semantics.transitionPriority}
const HAS_CUTOUT_FILL := ${usesBlobCutoutFillTile(recipe)}
const CUTOUT_FILL_COORDS := Vector2i(${BLOB_CUTOUT_FILL_ATLAS_COORDS.x}, ${BLOB_CUTOUT_FILL_ATLAS_COORDS.y})
const PEERING_BITS := [
\tTileSet.CELL_NEIGHBOR_TOP_SIDE,
\tTileSet.CELL_NEIGHBOR_TOP_RIGHT_CORNER,
\tTileSet.CELL_NEIGHBOR_RIGHT_SIDE,
\tTileSet.CELL_NEIGHBOR_BOTTOM_RIGHT_CORNER,
\tTileSet.CELL_NEIGHBOR_BOTTOM_SIDE,
\tTileSet.CELL_NEIGHBOR_BOTTOM_LEFT_CORNER,
\tTileSet.CELL_NEIGHBOR_LEFT_SIDE,
\tTileSet.CELL_NEIGHBOR_TOP_LEFT_CORNER,
]
const TILES := [
${entries}
]

func _logical_polygon() -> PackedVector2Array:
\tvar half := TILE_SIZE * 0.5
\treturn PackedVector2Array([Vector2(-half, -half), Vector2(half, -half), Vector2(half, half), Vector2(-half, half)])

func _apply_semantics(tile_data: TileData, wall_material := "exterior") -> void:
\ttile_data.set_custom_data("walkable", WALKABLE)
\ttile_data.set_custom_data("surface_type", SURFACE_TYPE)
\ttile_data.set_custom_data("footstep", FOOTSTEP)
\ttile_data.set_custom_data("movement_cost", MOVEMENT_COST)
\ttile_data.set_custom_data("terrain_id", TERRAIN_ID)
\ttile_data.set_custom_data("transition_group", TRANSITION_GROUP)
\ttile_data.set_custom_data("transition_priority", TRANSITION_PRIORITY)
\ttile_data.set_custom_data("wall_material", wall_material)
\tif PHYSICS_ENABLED:
\t\ttile_data.set_collision_polygons_count(0, 1)
\t\ttile_data.set_collision_polygon_points(0, 0, _logical_polygon())
\tif NAVIGATION_ENABLED and WALKABLE:
\t\tvar navigation := NavigationPolygon.new()
\t\tnavigation.vertices = _logical_polygon()
\t\tnavigation.add_polygon(PackedInt32Array([0, 1, 2, 3]))
\t\ttile_data.set_navigation_polygon(0, navigation)
\tif OCCLUSION_ENABLED:
\t\tvar occluder := OccluderPolygon2D.new()
\t\toccluder.polygon = _logical_polygon()
\t\ttile_data.set_occluder(0, occluder)

func _run() -> void:
\tvar base_dir := get_script().resource_path.get_base_dir()
\tvar output_path := base_dir.path_join(OUTPUT_FILE)
\tvar tile_set := TileSet.new()
\ttile_set.tile_size = Vector2i(TILE_SIZE, TILE_SIZE)
\ttile_set.add_terrain_set(0)
\ttile_set.set_terrain_set_mode(0, TileSet.TERRAIN_MODE_MATCH_CORNERS_AND_SIDES)
\ttile_set.add_terrain(0, 0)
\ttile_set.set_terrain_name(0, 0, "${recipe.name.replaceAll('"', '\\"')}")
\tif PHYSICS_ENABLED:
\t\ttile_set.add_physics_layer(0)
\tif NAVIGATION_ENABLED:
\t\ttile_set.add_navigation_layer(0)
\tif OCCLUSION_ENABLED:
\t\ttile_set.add_occlusion_layer(0)
\tfor semantic in [["walkable", TYPE_BOOL], ["surface_type", TYPE_STRING], ["footstep", TYPE_STRING], ["movement_cost", TYPE_FLOAT], ["terrain_id", TYPE_STRING], ["transition_group", TYPE_STRING], ["transition_priority", TYPE_INT], ["wall_material", TYPE_STRING]]:
\t\tvar layer_index := tile_set.get_custom_data_layers_count()
\t\ttile_set.add_custom_data_layer(layer_index)
\t\ttile_set.set_custom_data_layer_name(layer_index, semantic[0])
\t\ttile_set.set_custom_data_layer_type(layer_index, semantic[1])

\tvar source_ids: Array[int] = []
\tfor variant_index in ATLAS_FILES.size():
\t\tvar atlas_path: String = base_dir.path_join(ATLAS_FILES[variant_index])
\t\tvar normal_path: String = base_dir.path_join(NORMAL_FILES[variant_index])
\t\tvar albedo := load(atlas_path) as Texture2D
\t\tif albedo == null:
\t\t\tpush_error("Tesserae: atlas not found: " + atlas_path)
\t\t\treturn
\t\tvar normal := load(normal_path) as Texture2D
\t\tif normal == null:
\t\t\tpush_warning("Tesserae: normal map not found; importing albedo only: " + normal_path)

\t\tvar canvas_texture := CanvasTexture.new()
\t\tcanvas_texture.diffuse_texture = albedo
\t\tcanvas_texture.normal_texture = normal

\t\tvar source := TileSetAtlasSource.new()
\t\tsource.texture = canvas_texture
\t\tsource.texture_region_size = REGION_SIZE
\t\tfor entry in TILES:
\t\t\tvar coords: Vector2i = entry["coords"]
\t\t\tsource.create_tile(coords)
\t\tif HAS_CUTOUT_FILL:
\t\t\tsource.create_tile(CUTOUT_FILL_COORDS)
\t\tvar source_id := tile_set.add_source(source)
\t\tsource_ids.append(source_id)

\t\tfor entry in TILES:
\t\t\tvar coords: Vector2i = entry["coords"]
\t\t\tvar tile_data := source.get_tile_data(coords, 0)
\t\t\ttile_data.texture_origin = TEXTURE_ORIGIN
\t\t\ttile_data.terrain_set = 0
\t\t\ttile_data.terrain = 0
\t\t\ttile_data.probability = max(0.0, VARIANT_WEIGHTS[variant_index])
\t\t\tvar bits: Array = entry["bits"]
\t\t\tfor bit_index in PEERING_BITS.size():
\t\t\t\ttile_data.set_terrain_peering_bit(PEERING_BITS[bit_index], bits[bit_index])
\t\t\t_apply_semantics(tile_data)
\t\tif HAS_CUTOUT_FILL:
\t\t\tvar fill_data := source.get_tile_data(CUTOUT_FILL_COORDS, 0)
\t\t\tfill_data.texture_origin = TEXTURE_ORIGIN
\t\t\tfill_data.set_custom_data("wall_material", "exterior")

\t\tif HAS_INTERIOR_ATLAS:
\t\t\tvar inner_path: String = base_dir.path_join(INNER_ATLAS_FILES[variant_index])
\t\t\tvar inner_albedo := load(inner_path) as Texture2D
\t\t\tif inner_albedo == null:
\t\t\t\tpush_error("Tesserae: interior atlas not found: " + inner_path)
\t\t\t\treturn
\t\t\tvar inner_canvas := CanvasTexture.new()
\t\t\tinner_canvas.diffuse_texture = inner_albedo
\t\t\tinner_canvas.normal_texture = normal
\t\t\tvar inner_source := TileSetAtlasSource.new()
\t\t\tinner_source.texture = inner_canvas
\t\t\tinner_source.texture_region_size = REGION_SIZE
\t\t\tfor entry in TILES:
\t\t\t\tinner_source.create_tile(entry["coords"])
\t\t\tif HAS_CUTOUT_FILL:
\t\t\t\tinner_source.create_tile(CUTOUT_FILL_COORDS)
\t\t\tvar inner_source_id := tile_set.add_source(inner_source)
\t\t\tsource_ids.append(inner_source_id)
\t\t\tfor entry in TILES:
\t\t\t\tvar inner_coords: Vector2i = entry["coords"]
\t\t\t\tvar inner_data := inner_source.get_tile_data(inner_coords, 0)
\t\t\t\tinner_data.texture_origin = TEXTURE_ORIGIN
\t\t\t\t_apply_semantics(inner_data, "interior")
\t\t\tif HAS_CUTOUT_FILL:
\t\t\t\tvar inner_fill := inner_source.get_tile_data(CUTOUT_FILL_COORDS, 0)
\t\t\t\tinner_fill.texture_origin = TEXTURE_ORIGIN
\t\t\t\tinner_fill.set_custom_data("wall_material", "interior")

\tvar result := ResourceSaver.save(tile_set, output_path)
\tif result == OK:
\t\tprint("Tesserae: TileSet created: ", output_path, " (sources ", source_ids, ")")
\telse:
\t\tpush_error("Tesserae: ResourceSaver failed: " + str(result))
`;
}
export function buildGodotShader() {
    return `shader_type canvas_item;

// Tesserae — 2D relief ready for PointLight2D / DirectionalLight2D.
uniform sampler2D tessera_normal : hint_normal;
uniform sampler2D tessera_height : hint_default_black;
uniform sampler2D tessera_ao : hint_default_white;
uniform float normal_depth : hint_range(0.0, 4.0) = 1.0;
uniform float ao_strength : hint_range(0.0, 1.0) = 1.0;
uniform float height_contrast : hint_range(0.0, 2.0) = 0.0;

void fragment() {
  vec4 albedo = texture(TEXTURE, UV);
  float ao = texture(tessera_ao, UV).r;
  float height = texture(tessera_height, UV).r;
  float height_light = mix(1.0, smoothstep(0.15, 0.85, height), height_contrast);
  COLOR = vec4(albedo.rgb * mix(1.0, ao, ao_strength) * height_light, albedo.a);
  NORMAL_MAP = texture(tessera_normal, UV).rgb;
  NORMAL_MAP_DEPTH = normal_depth;
}
`;
}
export function buildGodotProbe(recipe) {
    const output = recipe.topology === "dual16" ? "tesserae-dual16-tileset.tres" : "tesserae-tileset.tres";
    const exteriorSources = recipe.topology === "dual16" ? 1 : terrainEdgeDeformations(recipe.shape).some((effect) => effect.mode === "artistic") ? recipe.variants.count : 1;
    const expectedSources = exteriorSources * (recipe.topology === "blob47" && recipe.layers.some((layer) => layer.cliffEnabled && layer.cliffInteriorEnabled) ? 2 : 1);
    const expectedTiles = exportedTileCount(recipe);
    return `@tool
extends EditorScript

# Run after tesserae-import.gd. This checks the generated TileSet contract.
const OUTPUT_FILE := "${output}"
const EXPECTED_SOURCES := ${expectedSources}
const EXPECTED_TILES_PER_SOURCE := ${expectedTiles}

func _run() -> void:
\tvar path := get_script().resource_path.get_base_dir().path_join(OUTPUT_FILE)
\tvar tile_set := load(path) as TileSet
\tif tile_set == null:
\t\tpush_error("Tesserae Probe: run tesserae-import.gd first; missing " + path)
\t\treturn
\tvar source_ids := tile_set.get_source_ids()
\tif source_ids.size() != EXPECTED_SOURCES:
\t\tpush_error("Tesserae Probe: expected %d sources, found %d" % [EXPECTED_SOURCES, source_ids.size()])
\t\treturn
\tfor source_id in source_ids:
\t\tvar source := tile_set.get_source(source_id) as TileSetAtlasSource
\t\tif source == null or source.get_tiles_count() != EXPECTED_TILES_PER_SOURCE:
\t\t\tpush_error("Tesserae Probe: source %s has an invalid tile count" % source_id)
\t\t\treturn
\tprint("Tesserae Probe: PASS — %d sources × %d tiles, logical grid %s" % [EXPECTED_SOURCES, EXPECTED_TILES_PER_SOURCE, tile_set.tile_size])
`;
}
export function buildGodotDualRuntime(recipe) {
    return `class_name TesseraeDualGrid16
extends RefCounted

# Logical TileMapLayer: any occupied cell is considered solid.
# Visual TileMapLayer: receives the 16-state atlas on the dual, half-tile-shifted grid.
const TILE_SIZE := ${recipe.shape.tileSize}

static func mask_from_corners(nw: bool, ne: bool, se: bool, sw: bool) -> int:
\treturn (1 if nw else 0) | (2 if ne else 0) | (4 if se else 0) | (8 if sw else 0)

static func atlas_coords(mask: int) -> Vector2i:
\treturn Vector2i(mask % 4, mask / 4)

static func is_filled(layer: TileMapLayer, cell: Vector2i) -> bool:
\treturn layer.get_cell_source_id(cell) != -1

static func rebuild(logical: TileMapLayer, visual: TileMapLayer, source_id: int) -> void:
\tvisual.clear()
\tvisual.position = Vector2(-TILE_SIZE * 0.5, -TILE_SIZE * 0.5)
\tvar used := logical.get_used_rect().grow(1)
\tfor y in range(used.position.y, used.end.y + 1):
\t\tfor x in range(used.position.x, used.end.x + 1):
\t\t\tvar vertex := Vector2i(x, y)
\t\t\tvar mask := mask_from_corners(
\t\t\t\tis_filled(logical, vertex + Vector2i(-1, -1)),
\t\t\t\tis_filled(logical, vertex + Vector2i(0, -1)),
\t\t\t\tis_filled(logical, vertex),
\t\t\t\tis_filled(logical, vertex + Vector2i(-1, 0))
\t\t\t)
\t\t\tvisual.set_cell(vertex, source_id, atlas_coords(mask), 0)
`;
}
export function buildGodotCutoutRuntime() {
    return `class_name TesseraeCutoutOverlay
extends RefCounted

# A cut-out overlay is a bounded material canvas with a transparent path carved
# through it. The utility fill tile is not a terrain state; terrain-connect
# cells replace it with the 47 transition tiles.
const FILL_ATLAS_COORDS := Vector2i(${BLOB_CUTOUT_FILL_ATLAS_COORDS.x}, ${BLOB_CUTOUT_FILL_ATLAS_COORDS.y})

static func fill_bounds(layer: TileMapLayer, bounds: Rect2i, source_id: int) -> void:
\tfor y in range(bounds.position.y, bounds.end.y):
\t\tfor x in range(bounds.position.x, bounds.end.x):
\t\t\tlayer.set_cell(Vector2i(x, y), source_id, FILL_ATLAS_COORDS, 0)

static func carve(layer: TileMapLayer, cells: Array[Vector2i], terrain_set: int = 0, terrain: int = 0) -> void:
\tlayer.set_cells_terrain_connect(cells, terrain_set, terrain, true)

static func rebuild(layer: TileMapLayer, bounds: Rect2i, source_id: int, carved_cells: Array[Vector2i], terrain_set: int = 0, terrain: int = 0) -> void:
\tlayer.clear()
\tfill_bounds(layer, bounds, source_id)
\tcarve(layer, carved_cells, terrain_set, terrain)
`;
}
function crc32(data) {
    let crc = 0xffffffff;
    for (const byte of data) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}
function concat(parts) {
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    const output = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
        output.set(part, offset);
        offset += part.length;
    }
    return output;
}
function dosDateTime(date = new Date()) {
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const packedDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { date: packedDate, time };
}
export function createStoreZip(files) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    const timestamp = dosDateTime();
    let localOffset = 0;
    for (const file of files) {
        const name = encoder.encode(file.name);
        const checksum = crc32(file.data);
        const localHeader = new Uint8Array(30 + name.length);
        const localView = new DataView(localHeader.buffer);
        localView.setUint32(0, 0x04034b50, true);
        localView.setUint16(4, 20, true);
        localView.setUint16(6, 0x0800, true);
        localView.setUint16(8, 0, true);
        localView.setUint16(10, timestamp.time, true);
        localView.setUint16(12, timestamp.date, true);
        localView.setUint32(14, checksum, true);
        localView.setUint32(18, file.data.length, true);
        localView.setUint32(22, file.data.length, true);
        localView.setUint16(26, name.length, true);
        localHeader.set(name, 30);
        localParts.push(localHeader, file.data);
        const centralHeader = new Uint8Array(46 + name.length);
        const centralView = new DataView(centralHeader.buffer);
        centralView.setUint32(0, 0x02014b50, true);
        centralView.setUint16(4, 20, true);
        centralView.setUint16(6, 20, true);
        centralView.setUint16(8, 0x0800, true);
        centralView.setUint16(10, 0, true);
        centralView.setUint16(12, timestamp.time, true);
        centralView.setUint16(14, timestamp.date, true);
        centralView.setUint32(16, checksum, true);
        centralView.setUint32(20, file.data.length, true);
        centralView.setUint32(24, file.data.length, true);
        centralView.setUint16(28, name.length, true);
        centralView.setUint32(42, localOffset, true);
        centralHeader.set(name, 46);
        centralParts.push(centralHeader);
        localOffset += localHeader.length + file.data.length;
    }
    const centralDirectory = concat(centralParts);
    const end = new Uint8Array(22);
    const endView = new DataView(end.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(8, files.length, true);
    endView.setUint16(10, files.length, true);
    endView.setUint32(12, centralDirectory.length, true);
    endView.setUint32(16, localOffset, true);
    const bytes = concat([...localParts, centralDirectory, end]);
    return new Blob([new Uint8Array(bytes)], { type: "application/zip" });
}
export function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function slugify(value) {
    return value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "terrain";
}
export async function exportAtlasPng(recipe, textures, variant = 0, options = {}) {
    const atlas = await buildAtlasCanvasAsync(recipe, textures, variant, { signal: options.signal });
    throwIfAborted(options.signal);
    const png = await canvasToPng(atlas);
    const dimensions = inspectPng(png);
    if (dimensions.width !== atlas.width || dimensions.height !== atlas.height)
        throw new Error("PNG invalide : dimensions exportées incohérentes");
    const filename = `${slugify(recipe.name)}-${recipe.topology}-v${variant + 1}-${recipe.shape.tileSize}px.png`;
    downloadBlob(new Blob([new Uint8Array(png)], { type: "image/png" }), filename);
    if (recipe.layers.some((layer) => layer.cliffEnabled && layer.cliffInteriorEnabled)) {
        const innerAtlas = await buildInteriorAtlasCanvasAsync(recipe, textures, variant, { signal: options.signal });
        const innerPng = await canvasToPng(innerAtlas);
        const innerDimensions = inspectPng(innerPng);
        if (innerDimensions.width !== atlas.width || innerDimensions.height !== atlas.height)
            throw new Error("PNG intérieur invalide : dimensions différentes de l’atlas extérieur");
        const innerFilename = `${slugify(recipe.name)}-${recipe.topology}-inner-v${variant + 1}-${recipe.shape.tileSize}px.png`;
        downloadBlob(new Blob([new Uint8Array(innerPng)], { type: "image/png" }), innerFilename);
        return `${filename} + ${innerFilename}`;
    }
    return filename;
}
export async function exportAuxiliaryAtlasPng(recipe, channel, variant = 0, options = {}, textures = new Map()) {
    const atlas = await buildAuxiliaryAtlasCanvasAsync(recipe, channel, variant, { signal: options.signal }, textures);
    throwIfAborted(options.signal);
    const png = await canvasToPng(atlas);
    inspectPng(png);
    const filename = `${slugify(recipe.name)}-${recipe.topology}-${channel}-v${variant + 1}-${recipe.shape.tileSize}px.png`;
    downloadBlob(new Blob([new Uint8Array(png)], { type: "image/png" }), filename);
    return filename;
}
export async function createGodotFiles(recipe, textures, options = {}) {
    throwIfAborted(options.signal);
    const encoder = new TextEncoder();
    const layout = terrainAtlasLayout(recipe);
    const region = atlasCellFootprint(recipe);
    const files = [];
    const quality = options.qualityGate === "off" ? null : assessQuality(recipe, textures);
    if (quality) {
        options.onQualityReport?.(quality);
        if (options.qualityGate === "strict")
            assertQuality(quality);
        files.push({ name: "tesserae-quality-report.json", data: encoder.encode(JSON.stringify(quality, null, 2)) });
    }
    const masksPerAtlas = getTerrainMasks(recipe).length;
    const exportedTilesPerAtlas = exportedTileCount(recipe);
    const exportsInterior = recipe.layers.some((layer) => layer.cliffEnabled && layer.cliffInteriorEnabled);
    const interiorArtDirectionNote = exportsInterior
        ? "\n- A matching `tesserae-atlas-inner-vN.png` is included for every variant. Its cell layout and texture origin are identical to the exterior atlas, so a map tool can switch material without moving the cliff geometry."
        : "";
    const interiorReadmeNote = exportsInterior
        ? "\n\n## Interior walls\n\nEach `tesserae-atlas-inner-vN.png` is the paintable interior-wall companion to `tesserae-atlas-vN.png`. Both atlases use exactly the same tile coordinates, footprint and anchor. The Godot importer creates one exterior terrain source and one matching interior source per variant. Interior sources keep the same atlas coordinates but are not registered as terrain candidates, so terrain-connect cannot select them randomly: replace only the cells you explicitly classify or paint as interior. The `wall_material` custom data field identifies each source."
        : "";
    const totalTiles = recipe.variants.count * (exportsInterior ? 5 : 4) * exportedTilesPerAtlas;
    let completedTiles = 0;
    const workerClient = AtlasWorkerClient.supported() ? new AtlasWorkerClient(recipe, textures) : null;
    options.onProgress?.({ phase: "preparing", variantCount: recipe.variants.count, completed: 0, total: totalTiles });
    try {
        for (let variant = 0; variant < recipe.variants.count; variant += 1) {
            throwIfAborted(options.signal);
            const report = (channel) => (tileCompleted, tileTotal) => {
                options.onProgress?.({
                    phase: "rendering",
                    channel,
                    variant,
                    variantCount: recipe.variants.count,
                    completed: completedTiles + tileCompleted,
                    total: totalTiles,
                    tileCompleted,
                    tileTotal,
                });
            };
            const atlas = await buildAtlasCanvasAsync(recipe, textures, variant, { signal: options.signal, onProgress: report("albedo"), workerClient });
            options.onProgress?.({ phase: "encoding", channel: "albedo", variant, variantCount: recipe.variants.count, completed: completedTiles + masksPerAtlas, total: totalTiles });
            const albedo = await canvasToPng(atlas);
            throwIfAborted(options.signal);
            inspectPng(albedo);
            files.push({ name: `tesserae-atlas-v${variant + 1}.png`, data: albedo });
            completedTiles += exportedTilesPerAtlas;
            if (exportsInterior) {
                const innerAtlas = await buildInteriorAtlasCanvasAsync(recipe, textures, variant, { signal: options.signal, onProgress: report("albedo") });
                const innerAlbedo = await canvasToPng(innerAtlas);
                throwIfAborted(options.signal);
                inspectPng(innerAlbedo);
                files.push({ name: `tesserae-atlas-inner-v${variant + 1}.png`, data: innerAlbedo });
                completedTiles += exportedTilesPerAtlas;
            }
            for (const channel of ["normal", "height", "ao"]) {
                const auxiliary = await buildAuxiliaryAtlasCanvasAsync(recipe, channel, variant, { signal: options.signal, onProgress: report(channel), workerClient }, textures);
                options.onProgress?.({ phase: "encoding", channel, variant, variantCount: recipe.variants.count, completed: completedTiles + masksPerAtlas, total: totalTiles });
                const png = await canvasToPng(auxiliary);
                throwIfAborted(options.signal);
                inspectPng(png);
                files.push({ name: `tesserae-${channel}-v${variant + 1}.png`, data: png });
                completedTiles += exportedTilesPerAtlas;
            }
        }
    }
    finally {
        workerClient?.dispose();
    }
    throwIfAborted(options.signal);
    options.onProgress?.({ phase: "packaging", variantCount: recipe.variants.count, completed: totalTiles, total: totalTiles });
    files.push({
        name: "tesserae-manifest.json",
        data: encoder.encode(JSON.stringify(buildManifest(recipe), null, 2)),
    });
    files.push({
        name: "tesserae-recipe.json",
        data: encoder.encode(JSON.stringify(recipe, null, 2)),
    });
    files.push({ name: "tesserae-import.gd", data: encoder.encode(buildGodotImporter(recipe)) });
    files.push({ name: "tesserae-probe.gd", data: encoder.encode(buildGodotProbe(recipe)) });
    for (const pattern of recipe.patterns)
        files.push({ name: `pattern-${slugify(pattern.name)}.gd`, data: encoder.encode(buildGodotPatternScript(recipe, pattern)) });
    if (recipe.topology === "dual16") {
        files.push({ name: "tesserae-dual-grid-16.gd", data: encoder.encode(buildGodotDualRuntime(recipe)) });
    }
    if (usesBlobCutoutFillTile(recipe)) {
        files.push({ name: "tesserae-cutout-overlay.gd", data: encoder.encode(buildGodotCutoutRuntime()) });
    }
    files.push({ name: "tesserae-terrain.gdshader", data: encoder.encode(buildGodotShader()) });
    files.push({
        name: "ART-DIRECTION-GUIDE.md",
        data: encoder.encode(`# Tesserae — Terrain art direction\n\nThe pack contains four pixel-aligned atlases for every variant: albedo, normal, height and AO.\n\n- The importer creates a CanvasTexture using variant 1 albedo and normal maps.\n- The height map can drive masks, particles and relief shaders.\n- AO reinforces crevices without altering the source paint.\n- Projected cliffs extend outside the logical tile on synchronized albedo, normal, height and AO regions.\n- The included shader combines all auxiliary maps and supports PointLight2D / DirectionalLight2D.\n- Auxiliary map borders are stabilized to prevent lighting seams.${interiorArtDirectionNote}\n\nLogical tile: ${recipe.shape.tileSize}px. Render region: ${region.width}×${region.height}px. Logical anchor inside the region: (${region.originX}, ${region.originY}).\n\nAssign the normal, height and AO textures to the ShaderMaterial uniforms when using the advanced shader.\n`),
    });
    files.push({
        name: "README-GODOT.md",
        data: encoder.encode(`# Tesserae — ${recipe.name}\n\n1. Copy the atlases and \`tesserae-import.gd\` into your Godot 4.x project.\n2. Open \`tesserae-import.gd\` in the Godot editor and run it.\n3. ${recipe.topology === "dual16" ? "Add two TileMapLayer nodes (logical and visual), then call tesserae-dual-grid-16.gd to rebuild the offset visual grid." : `The script creates tesserae-tileset.tres with all 47 peering-bit terrain states${usesBlobCutoutFillTile(recipe) ? " plus one declared non-terrain fill tile" : ""}.`}${usesBlobCutoutFillTile(recipe) ? "\n4. Call TesseraeCutoutOverlay.rebuild(layer, bounds, source_id, carved_cells) from tesserae-cutout-overlay.gd. It prefills the bounded overlay, then terrain-connect replaces cells with the 47 carving states." : ""}\n${usesBlobCutoutFillTile(recipe) ? "5" : "4"}. Run \`tesserae-probe.gd\`; it verifies source and tile counts against this recipe.\n${usesBlobCutoutFillTile(recipe) ? "6" : "5"}. Keep the TileMapLayer grid at ${recipe.shape.tileSize}px; the importer applies \`texture_origin\` to align the larger projected-relief region automatically.\n\nTopology: ${recipe.topology}. Logical tile: ${recipe.shape.tileSize}px. Render region: ${region.width}×${region.height}px. Anchor: (${region.originX}, ${region.originY}). Atlas: ${layout.columns}×${layout.rows}.${interiorReadmeNote}\n`),
    });
    return files;
}
export async function createGodotBundle(recipe, textures, options = {}) {
    const files = await createGodotFiles(recipe, textures, options);
    throwIfAborted(options.signal);
    const bundle = createStoreZip(files);
    const bytes = new Uint8Array(await bundle.arrayBuffer());
    if (bytes.length < 22 || new DataView(bytes.buffer).getUint32(bytes.length - 22, true) !== 0x06054b50)
        throw new Error("ZIP invalide : catalogue final absent");
    return bundle;
}
export async function exportGodotBundle(recipe, textures, options = {}) {
    const bundle = await createGodotBundle(recipe, textures, options);
    throwIfAborted(options.signal);
    downloadBlob(bundle, `${slugify(recipe.name)}-tesserae-godot.zip`);
}
export function exportRecipe(recipe) {
    downloadBlob(new Blob([JSON.stringify(recipe, null, 2)], { type: "application/json" }), `${slugify(recipe.name)}.tesserae.json`);
}
