import { cliffTextureKey, DEFAULT_CLIFF_HEIGHT_STEPS, layerEdgeFrequencyLimit, LAYER_EDGE_DISPLACEMENT_RATIO, MAX_LAYER_EDGE_STACK_RATIO, MAX_TERRAIN_EDGE_STACK_RATIO, terrainEdgeDeformations, TERRAIN_EDGE_DISPLACEMENT_RATIO } from "../types.js";
import { BIT, hasBit, maskToNeighbors } from "./blob47.js";
import { DUAL_BIT } from "./dual16.js";
import { artisticVariantInteriorWeight, periodicCoastMotif, periodicNoise, seededJitter, smoothstep } from "./noise.js";
import { blendTileOverride, tileOverrideSettings } from "./tileDesign.js";
const fieldCache = new Map();
const layerPixelCache = new Map();
const heightFieldCache = new Map();
const alphaFieldCache = new Map();
const shadowFieldCache = new Map();
const dualProjectedContextCache = new WeakMap();
const projectedTileCache = new WeakMap();
export function createInteriorCliffVariant(recipe, textures) {
    const nextTextures = new Map(textures);
    const layers = recipe.layers.map((layer) => {
        if (!layer.cliffEnabled || !layer.cliffInteriorEnabled)
            return layer;
        const interior = textures.get(cliffTextureKey(layer.id, "interior"));
        for (const role of ["front", "side", "rear"]) {
            const key = cliffTextureKey(layer.id, role);
            if (interior)
                nextTextures.set(key, interior);
            else
                nextTextures.delete(key);
        }
        nextTextures.delete(cliffTextureKey(layer.id, "detail"));
        return { ...layer, color: layer.cliffInteriorColor, accent: layer.cliffInteriorColor, cliffAlphaEdgesOnly: true };
    });
    return { recipe: { ...recipe, layers }, textures: nextTextures };
}
function directionVector(direction) {
    if (direction === "N")
        return { x: 0, y: -1, px: -1, py: 0 };
    if (direction === "E")
        return { x: 1, y: 0, px: 0, py: -1 };
    if (direction === "W")
        return { x: -1, y: 0, px: 0, py: 1 };
    return { x: 0, y: 1, px: 1, py: 0 };
}
function cliffDepthPixels(heightInTiles, tileSize) {
    const finite = Number.isFinite(heightInTiles) ? heightInTiles : DEFAULT_CLIFF_HEIGHT_STEPS;
    const clamped = Math.max(1 / Math.max(1, tileSize), Math.min(4, finite));
    return Math.max(1, Math.round(clamped * tileSize));
}
const CARDINAL_DIRECTIONS = ["N", "E", "S", "W"];
export function cliffDepthForEdge(layer, edgeDirection, tileSize) {
    const edge = directionVector(edgeDirection);
    return cliffDepthForNormal(layer, edge.x, edge.y, tileSize);
}
function cliffDepthRatioForNormal(layer, normalX, normalY) {
    if (!layer.cliffDirectional) {
        const projection = directionVector(layer.cliffDirection);
        return projection.x * normalX + projection.y * normalY > 0.5 ? 1 : 0;
    }
    const projection = directionVector(layer.cliffDirection);
    const facing = Math.max(-1, Math.min(1, projection.x * normalX + projection.y * normalY));
    const blend = smoothstep(0, 1, Math.abs(facing));
    return facing >= 0
        ? layer.cliffSideDepth + (1 - layer.cliffSideDepth) * blend
        : layer.cliffSideDepth + (layer.cliffRearDepth - layer.cliffSideDepth) * blend;
}
export function cliffDepthForNormal(layer, normalX, normalY, tileSize) {
    const fullDepth = cliffDepthPixels(layer.cliffHeightSteps, tileSize);
    const ratio = cliffDepthRatioForNormal(layer, normalX, normalY);
    if (ratio <= 0)
        return 0;
    return Math.max(1, Math.round(fullDepth * ratio));
}
function cliffProjectedVisibility(layer, normalX, normalY, edgeDepth, tileSize) {
    if (edgeDepth <= 0)
        return 0;
    const projection = directionVector(layer.cliffDirection);
    const offsetPerStepX = layer.cliffOffsetX * tileSize / edgeDepth;
    const offsetPerStepY = layer.cliffOffsetY * tileSize / edgeDepth;
    const extrusionX = projection.x + projection.px * layer.cliffShear + offsetPerStepX;
    const extrusionY = projection.y + projection.py * layer.cliffShear + offsetPerStepY;
    const extrusionLength = Math.hypot(extrusionX, extrusionY);
    if (extrusionLength <= 1e-6)
        return 0;
    // A contour projects an area proportional to the component of the
    // extrusion along its normal. When the extrusion is parallel to the edge
    // tangent, the projected face has zero area and must not become a 1px line.
    return Math.max(0, Math.min(1, Math.abs((extrusionX * normalX + extrusionY * normalY) / extrusionLength)));
}
export function projectionFootprint(recipe, logicalSize = recipe.shape.tileSize) {
    if (recipe.shape.outputMode !== "composite") {
        return {
            logicalSize,
            width: logicalSize,
            height: logicalSize,
            originX: 0,
            originY: 0,
            margins: { left: 0, top: 0, right: 0, bottom: 0 },
        };
    }
    let minX = 0;
    let minY = 0;
    let maxX = 0;
    let maxY = 0;
    let wideProjectionMargin = 0;
    if (recipe.topology === "dual16") {
        const wideReach = recipe.layers.reduce((maximum, layer) => {
            if (!layer.enabled || layer.kind !== "band" || layer.cliffEnabled || layer.placement !== "inner")
                return maximum;
            return Math.max(maximum, Math.max(0, layer.width - 0.5) * logicalSize);
        }, 0);
        if (wideReach > 0) {
            const guard = Math.ceil(wideReach) + 1;
            wideProjectionMargin = guard;
            minX = -guard;
            minY = -guard;
            maxX = guard;
            maxY = guard;
        }
    }
    for (const layer of recipe.layers) {
        if (!layer.enabled)
            continue;
        const projectsCliff = layer.kind === "band" && layer.cliffEnabled;
        let endX = 0;
        let endY = 0;
        if (projectsCliff) {
            const vector = directionVector(layer.cliffDirection);
            const depth = cliffDepthPixels(layer.cliffHeightSteps, logicalSize);
            endX = vector.x * depth + layer.cliffOffsetX * logicalSize + vector.px * layer.cliffShear * depth;
            endY = vector.y * depth + layer.cliffOffsetY * logicalSize + vector.py * layer.cliffShear * depth;
            minX = Math.min(minX, endX);
            minY = Math.min(minY, endY);
            maxX = Math.max(maxX, endX);
            maxY = Math.max(maxY, endY);
        }
        if (layer.kind !== "outside" && layer.shadowEnabled && layer.shadowOpacity > 0) {
            const angle = layer.shadowAngle * Math.PI / 180;
            const shadowX = Math.cos(angle) * layer.shadowDistance * logicalSize;
            const shadowY = Math.sin(angle) * layer.shadowDistance * logicalSize;
            // A box blur still has a small non-zero sample exactly at its radius.
            // Keep one transparent guard pixel so exported regions never end on a
            // visible hard line.
            const blur = layer.shadowBlur * logicalSize + 1;
            const wideCaster = recipe.topology === "dual16"
                && layer.kind === "band"
                && !layer.cliffEnabled
                && layer.placement === "inner"
                && layer.width > 0.5
                ? wideProjectionMargin
                : 0;
            minX = Math.min(minX, shadowX - blur - wideCaster, endX + shadowX - blur - wideCaster);
            minY = Math.min(minY, shadowY - blur - wideCaster, endY + shadowY - blur - wideCaster);
            maxX = Math.max(maxX, shadowX + blur + wideCaster, endX + shadowX + blur + wideCaster);
            maxY = Math.max(maxY, shadowY + blur + wideCaster, endY + shadowY + blur + wideCaster);
        }
    }
    const left = Math.ceil(Math.max(0, -minX));
    const top = Math.ceil(Math.max(0, -minY));
    let right = Math.ceil(Math.max(0, maxX));
    let bottom = Math.ceil(Math.max(0, maxY));
    // Keep the render region center on an integer pixel relative to the logical tile.
    if ((left + right) % 2 !== 0)
        right += 1;
    if ((top + bottom) % 2 !== 0)
        bottom += 1;
    return {
        logicalSize,
        width: logicalSize + left + right,
        height: logicalSize + top + bottom,
        originX: left,
        originY: top,
        margins: { left, top, right, bottom },
    };
}
function fieldKey(mask, size, shape, variant) {
    return [
        mask,
        size,
        shape.thickness.toFixed(4),
        shape.outerRadius.toFixed(4),
        shape.innerRadius.toFixed(4),
        shape.roughness.toFixed(4),
        shape.frequency.toFixed(3),
        shape.deformationMode,
        shape.deformationPhase.toFixed(4),
        shape.organicOffset.toFixed(4),
        shape.organicOctaves,
        shape.organicPersistence.toFixed(4),
        JSON.stringify(shape.edgeDeformations),
        shape.seed,
        variant,
    ].join(":");
}
function globalEdgeDisplacement(shape, x, y, size, variant) {
    const effects = terrainEdgeDeformations(shape);
    if (effects.length === 0)
        return 0;
    const period = Math.max(1, size - 1);
    const authoredRatio = effects.reduce((total, deformation) => total + deformation.amount * TERRAIN_EDGE_DISPLACEMENT_RATIO, 0);
    const stackScale = authoredRatio > MAX_TERRAIN_EDGE_STACK_RATIO
        ? MAX_TERRAIN_EDGE_STACK_RATIO / authoredRatio
        : 1;
    const frequencyLimit = layerEdgeFrequencyLimit(size);
    return effects.reduce((total, deformation, index) => {
        if (deformation.amount <= 0)
            return total;
        const amplitude = deformation.amount * TERRAIN_EDGE_DISPLACEMENT_RATIO * stackScale * size;
        const frequency = Math.min(deformation.frequency, frequencyLimit);
        const phase = deformation.phase * Math.PI * 2;
        const seed = shape.seed + index * 409;
        if (deformation.mode === "wave") {
            const cycles = Math.max(1, Math.round(frequency));
            const px = (x / period) * Math.PI * 2 * cycles;
            const py = (y / period) * Math.PI * 2 * cycles;
            return total + (Math.sin(px + phase) * 0.58 + Math.sin(py + phase * 0.73 + 1.17) * 0.42) * amplitude;
        }
        const offsetX = deformation.phase * period;
        const offsetY = deformation.phase * period * 0.61803398875;
        if (deformation.mode === "artistic") {
            const shared = periodicCoastMotif(x + offsetX, y + offsetY, period, seed, frequency, shape.organicOctaves, shape.organicPersistence);
            if (variant <= 0)
                return total + shared * amplitude;
            const alternative = periodicCoastMotif(x + offsetX, y + offsetY, period, seed + variant * 541, frequency, shape.organicOctaves, shape.organicPersistence);
            const interiorMix = artisticVariantInteriorWeight(x, y, size) * 0.88;
            return total + (shared + (alternative - shared) * interiorMix) * amplitude;
        }
        if (deformation.mode === "organic") {
            return total + periodicNoise(x + offsetX, y + offsetY, period, seed + variant * 131, frequency, shape.organicOctaves, shape.organicPersistence) * amplitude;
        }
        return total + contourDisplacement({
            mode: deformation.mode,
            amplitude: deformation.amount * TERRAIN_EDGE_DISPLACEMENT_RATIO * stackScale,
            frequency,
            phase: deformation.phase,
        }, x, y, size, seed + variant * 131, index * 0.173);
    }, 0);
}
function contourLocalDisplacement(shape, x, y, size, variant, baseDistance) {
    // Deformation belongs to the contour, not to the saturated interior of a
    // fully surrounded auto-tile. Fade it out before the maximum seam-safe
    // border reach (half a tile), otherwise Width=100% can reveal false bands
    // in center tiles that contain no local boundary.
    const inwardDistance = Math.max(0, -baseDistance);
    const influence = 1 - smoothstep(size * 0.28, size * 0.48, inwardDistance);
    return globalEdgeDisplacement(shape, x, y, size, variant) * influence;
}
function buildCleanDistanceField(mask, size, shape) {
    const cells = maskToNeighbors(mask);
    const distance = new Float32Array(size * size);
    const bandDistance = new Float32Array(size * size);
    const normalX = new Float32Array(size * size);
    const normalY = new Float32Array(size * size);
    const radius = Math.max(0, Math.min(size * 0.5, shape.outerRadius * size));
    if (radius <= 0.001) {
        // A minimum of per-tile box SDFs is not the SDF of their union: every
        // shared tile edge remains a false zero contour. Inner borders then appear
        // as a grid of little squares at radius 0. Rasterize the complete 3x3 cell
        // union first and compute its distance once, exactly as for rounded masks.
        const padding = 2;
        const contextSize = size * 3 + padding * 2;
        const occupiedCells = new Set(cells.map((cell) => `${cell.x},${cell.y}`));
        const terrain = new Float32Array(contextSize * contextSize);
        for (let contextY = 0; contextY < contextSize; contextY += 1) {
            for (let contextX = 0; contextX < contextSize; contextX += 1) {
                const sampleX = contextX - size - padding + 0.5;
                const sampleY = contextY - size - padding + 0.5;
                terrain[contextY * contextSize + contextX] = occupiedCells.has(`${Math.floor(sampleX / size)},${Math.floor(sampleY / size)}`) ? 1 : 0;
            }
        }
        const insideDistance = interiorDistanceField(terrain, contextSize, contextSize);
        const outsideDistance = interiorDistanceField(Float32Array.from(terrain, (value) => 1 - value), contextSize, contextSize);
        const squareInsideDistance = chessboardInteriorDistanceField(terrain, contextSize, contextSize);
        const squareOutsideDistance = chessboardInteriorDistanceField(Float32Array.from(terrain, (value) => 1 - value), contextSize, contextSize);
        for (let y = 0; y < size; y += 1) {
            for (let x = 0; x < size; x += 1) {
                const index = y * size + x;
                const source = (y + size + padding) * contextSize + x + size + padding;
                distance[index] = terrain[source] >= 0.5 ? 0.5 - insideDistance[source] : outsideDistance[source] - 0.5;
                bandDistance[index] = terrain[source] >= 0.5 ? 0.5 - squareInsideDistance[source] : squareOutsideDistance[source] - 0.5;
            }
        }
    }
    else {
        const padding = Math.ceil(radius) + 2;
        const contextSize = size * 3 + padding * 2;
        const rawTerrain = new Float32Array(contextSize * contextSize);
        const occupiedCells = new Set(cells.map((cell) => `${cell.x},${cell.y}`));
        const isOccupied = (cellX, cellY) => occupiedCells.has(`${cellX},${cellY}`);
        for (let contextY = 0; contextY < contextSize; contextY += 1) {
            for (let contextX = 0; contextX < contextSize; contextX += 1) {
                const sampleX = contextX - size - padding + 0.5;
                const sampleY = contextY - size - padding + 0.5;
                rawTerrain[contextY * contextSize + contextX] = isOccupied(Math.floor(sampleX / size), Math.floor(sampleY / size)) ? 1 : 0;
            }
        }
        const terrain = rawTerrain.slice();
        for (let contextY = 0; contextY < contextSize; contextY += 1) {
            for (let contextX = 0; contextX < contextSize; contextX += 1) {
                const sampleX = contextX - size - padding + 0.5;
                const sampleY = contextY - size - padding + 0.5;
                const vertexX = Math.round(sampleX / size);
                const vertexY = Math.round(sampleY / size);
                if (vertexX < -1 || vertexX > 2 || vertexY < -1 || vertexY > 2)
                    continue;
                const dx = sampleX - vertexX * size;
                const dy = sampleY - vertexY * size;
                const northwest = isOccupied(vertexX - 1, vertexY - 1);
                const northeast = isOccupied(vertexX, vertexY - 1);
                const southwest = isOccupied(vertexX - 1, vertexY);
                const southeast = isOccupied(vertexX, vertexY);
                const filledCount = Number(northwest) + Number(northeast) + Number(southwest) + Number(southeast);
                if (filledCount === 1) {
                    // Only the radius-sized corner square belongs to the fillet. The
                    // nearest-vertex partition spans half a tile; rewriting that whole
                    // quadrant turns radii below 50% into detached discs.
                    if (Math.abs(dx) > radius || Math.abs(dy) > radius)
                        continue;
                    const quadrantFilled = dy < 0 ? (dx < 0 ? northwest : northeast) : (dx < 0 ? southwest : southeast);
                    if (!quadrantFilled)
                        continue;
                    const centerX = vertexX * size + (dx < 0 ? -radius : radius);
                    const centerY = vertexY * size + (dy < 0 ? -radius : radius);
                    terrain[contextY * contextSize + contextX] = Math.hypot(sampleX - centerX, sampleY - centerY) <= radius ? 1 : 0;
                }
            }
        }
        const insideDistance = interiorDistanceField(terrain, contextSize, contextSize);
        const outsideDistance = interiorDistanceField(Float32Array.from(terrain, (value) => 1 - value), contextSize, contextSize);
        const squareInsideDistance = chessboardInteriorDistanceField(terrain, contextSize, contextSize);
        const squareOutsideDistance = chessboardInteriorDistanceField(Float32Array.from(terrain, (value) => 1 - value), contextSize, contextSize);
        for (let y = 0; y < size; y += 1) {
            for (let x = 0; x < size; x += 1) {
                const index = y * size + x;
                const source = (y + size + padding) * contextSize + x + size + padding;
                const euclidean = terrain[source] >= 0.5 ? 0.5 - insideDistance[source] : outsideDistance[source] - 0.5;
                const chessboard = terrain[source] >= 0.5 ? 0.5 - squareInsideDistance[source] : squareOutsideDistance[source] - 0.5;
                distance[index] = euclidean;
                // A three-filled Blob vertex needs a square joining distance because
                // three independently exported tiles meet around one missing
                // diagonal. Everywhere else the Euclidean field keeps border layers
                // concentric with the rounded silhouette; using the square metric
                // globally creates detached corner discs.
                const sampleX = x + 0.5;
                const sampleY = y + 0.5;
                const vertexX = Math.round(sampleX / size);
                const vertexY = Math.round(sampleY / size);
                const filledCount = Number(isOccupied(vertexX - 1, vertexY - 1))
                    + Number(isOccupied(vertexX, vertexY - 1))
                    + Number(isOccupied(vertexX - 1, vertexY))
                    + Number(isOccupied(vertexX, vertexY));
                bandDistance[index] = filledCount === 3 ? chessboard : euclidean;
            }
        }
    }
    const sample = (x, y) => distance[Math.max(0, Math.min(size - 1, y)) * size + Math.max(0, Math.min(size - 1, x))];
    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            const dx = sample(x + 1, y) - sample(x - 1, y);
            const dy = sample(x, y + 1) - sample(x, y - 1);
            const length = Math.hypot(dx, dy) || 1;
            const index = y * size + x;
            normalX[index] = dx / length;
            normalY[index] = dy / length;
        }
    }
    return { distance, bandDistance, normalX, normalY };
}
export function buildDistanceField(mask, size, shape, variant = 0) {
    const key = fieldKey(mask, size, shape, variant);
    const cached = fieldCache.get(key);
    if (cached)
        return cached;
    // The fully surrounded Blob state has no contour inside the logical tile.
    // Keep its field saturated and invariant so global deformation cannot turn
    // the center tile into a repeated false border at maximum band width.
    const effects = terrainEdgeDeformations(shape);
    if (mask === 255 || !effects.some((effect) => effect.amount > 0)) {
        const clean = buildCleanDistanceField(mask, size, shape);
        fieldCache.set(key, clean);
        return clean;
    }
    // Deformation must be a continuous offset from the exact clean contour.
    // The former implementation rebuilt the base contour with rounded-box
    // primitives as soon as an effect existed. That made an Amount=0 effect
    // jump to a different silhouette before any displacement was applied.
    const clean = buildCleanDistanceField(mask, size, shape);
    const distance = clean.distance.slice();
    const bandDistance = clean.bandDistance.slice();
    const normalX = new Float32Array(size * size);
    const normalY = new Float32Array(size * size);
    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            const index = y * size + x;
            // Blob states with a real local boundary can use the full periodic
            // displacement. The saturated center state exits above, so this cannot
            // create a false contour in a tile that has no boundary of its own.
            const displacement = globalEdgeDisplacement(shape, x, y, size, variant);
            distance[index] += displacement;
            bandDistance[index] += displacement;
        }
    }
    const sample = (x, y) => {
        const clampedX = Math.max(0, Math.min(size - 1, x));
        const clampedY = Math.max(0, Math.min(size - 1, y));
        return distance[clampedY * size + clampedX];
    };
    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            const dx = sample(x + 1, y) - sample(x - 1, y);
            const dy = sample(x, y + 1) - sample(x, y - 1);
            const length = Math.hypot(dx, dy) || 1;
            const index = y * size + x;
            normalX[index] = dx / length;
            normalY[index] = dy / length;
        }
    }
    const result = { distance, bandDistance, normalX, normalY };
    fieldCache.set(key, result);
    if (fieldCache.size > 256) {
        const firstKey = fieldCache.keys().next().value;
        if (firstKey)
            fieldCache.delete(firstKey);
    }
    return result;
}
export function buildDualDistanceField(mask, size, shape, diagonalMode = "separate", variant = 0) {
    const key = `dual:${mask}:${size}:${diagonalMode}:${shape.outerRadius}:${shape.roughness}:${shape.frequency}:${shape.deformationMode}:${shape.deformationPhase}:${shape.organicOffset}:${shape.organicOctaves}:${shape.organicPersistence}:${JSON.stringify(shape.edgeDeformations)}:${shape.seed}:${variant}`;
    const cached = fieldCache.get(key);
    if (cached)
        return cached;
    const distance = new Float32Array(size * size);
    const normalX = new Float32Array(size * size);
    const normalY = new Float32Array(size * size);
    const nw = mask & DUAL_BIT.NW ? 1 : 0;
    const ne = mask & DUAL_BIT.NE ? 1 : 0;
    const se = mask & DUAL_BIT.SE ? 1 : 0;
    const sw = mask & DUAL_BIT.SW ? 1 : 0;
    const diagonal = mask === (DUAL_BIT.NW | DUAL_BIT.SE) || mask === (DUAL_BIT.NE | DUAL_BIT.SW);
    const raw = new Float32Array(size * size);
    const roundness = Math.max(0, Math.min(1, shape.outerRadius * 2));
    const roundedCoordinate = (value) => {
        const eased = value * value * (3 - 2 * value);
        return value + (eased - value) * roundness;
    };
    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            const u = roundedCoordinate(size <= 1 ? 0.5 : x / (size - 1));
            const v = roundedCoordinate(size <= 1 ? 0.5 : y / (size - 1));
            let density = nw * (1 - u) * (1 - v) + ne * u * (1 - v) + se * u * v + sw * (1 - u) * v;
            if (diagonal) {
                const centerWeight = (1 - Math.abs(u * 2 - 1)) * (1 - Math.abs(v * 2 - 1));
                density += (diagonalMode === "connected" ? 0.16 : -0.16) * centerWeight;
            }
            raw[y * size + x] = 0.5 - density;
        }
    }
    const sampleRaw = (x, y) => raw[Math.max(0, Math.min(size - 1, y)) * size + Math.max(0, Math.min(size - 1, x))];
    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            const index = y * size + x;
            const gradientX = (sampleRaw(x + 1, y) - sampleRaw(x - 1, y)) * 0.5;
            const gradientY = (sampleRaw(x, y + 1) - sampleRaw(x, y - 1)) * 0.5;
            const gradient = Math.max(1 / size, Math.hypot(gradientX, gradientY));
            const signedDistance = Math.max(-size, Math.min(size, raw[index] / gradient));
            distance[index] = signedDistance + contourLocalDisplacement(shape, x, y, size, variant, signedDistance);
        }
    }
    const sample = (x, y) => distance[Math.max(0, Math.min(size - 1, y)) * size + Math.max(0, Math.min(size - 1, x))];
    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            const dx = sample(x + 1, y) - sample(x - 1, y);
            const dy = sample(x, y + 1) - sample(x, y - 1);
            const length = Math.hypot(dx, dy) || 1;
            const index = y * size + x;
            normalX[index] = dx / length;
            normalY[index] = dy / length;
        }
    }
    const result = { distance, bandDistance: distance, normalX, normalY };
    fieldCache.set(key, result);
    return result;
}
function buildRecipeDistanceField(recipe, mask, size, variant) {
    return recipe.topology === "dual16"
        ? buildDualDistanceField(mask, size, recipe.shape, recipe.dualDiagonal, variant)
        : buildDistanceField(mask, size, recipe.shape, variant);
}
function parseHex(hex) {
    const normalized = hex.replace("#", "").padEnd(6, "0").slice(0, 6);
    return [
        Number.parseInt(normalized.slice(0, 2), 16),
        Number.parseInt(normalized.slice(2, 4), 16),
        Number.parseInt(normalized.slice(4, 6), 16),
    ];
}
function clampByte(value) {
    return Math.round(Math.max(0, Math.min(255, value)));
}
function mixColor(from, to, amount) {
    const t = Math.max(0, Math.min(1, amount));
    return [
        from[0] + (to[0] - from[0]) * t,
        from[1] + (to[1] - from[1]) * t,
        from[2] + (to[2] - from[2]) * t,
    ];
}
function directionFactor(sides, nx, ny) {
    const n = Math.max(0, -ny);
    const e = Math.max(0, nx);
    const s = Math.max(0, ny);
    const w = Math.max(0, -nx);
    const total = n + e + s + w;
    if (total <= 0.0001)
        return sides.N && sides.E && sides.S && sides.W ? 1 : 0;
    return ((sides.N ? n : 0) +
        (sides.E ? e : 0) +
        (sides.S ? s : 0) +
        (sides.W ? w : 0)) / total;
}
function modulo(value, divisor) {
    return ((value % divisor) + divisor) % divisor;
}
function uploadedTextureSample(layer, x, y, size, textures) {
    const texture = textures.get(layer.id);
    if (!texture)
        return null;
    const repeats = 1 / layer.scale;
    const normalizedX = (x + 0.5) / Math.max(1, size);
    const normalizedY = (y + 0.5) / Math.max(1, size);
    const tx = Math.floor(modulo((normalizedX * repeats + layer.offsetX) * texture.width, texture.width));
    const ty = Math.floor(modulo((normalizedY * repeats + layer.offsetY) * texture.height, texture.height));
    return { texture, index: (ty * texture.width + tx) * 4 };
}
function sampleUploadedTexture(layer, x, y, size, textures, _nx, _ny) {
    const sample = uploadedTextureSample(layer, x, y, size, textures);
    if (!sample)
        return null;
    return [sample.texture.data[sample.index], sample.texture.data[sample.index + 1], sample.texture.data[sample.index + 2]];
}
function sampleUploadedTextureAlpha(layer, x, y, size, textures) {
    const sample = uploadedTextureSample(layer, x, y, size, textures);
    return sample ? sample.texture.data[sample.index + 3] / 255 : null;
}
function scaledTexturePixels(texture, size) {
    const output = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y += 1)
        for (let x = 0; x < size; x += 1) {
            const sourceX = Math.min(texture.width - 1, Math.floor((x / size) * texture.width));
            const sourceY = Math.min(texture.height - 1, Math.floor((y / size) * texture.height));
            const source = (sourceY * texture.width + sourceX) * 4;
            const target = (y * size + x) * 4;
            output[target] = texture.data[source];
            output[target + 1] = texture.data[source + 1];
            output[target + 2] = texture.data[source + 2];
            output[target + 3] = texture.data[source + 3];
        }
    return output;
}
function sampleUploadedCliffTextureAtKey(layer, key, x, y, textures, scaleMultiplier = 1) {
    const texture = textures.get(key);
    if (!texture)
        return null;
    // The motif has its own output-pixel size. It is therefore unaffected by
    // the logical terrain tile size (32, 64, 128 px, ...), while the texture's
    // native aspect ratio remains intact.
    const displayScale = Math.max(0.001, layer.cliffPatternSizePx * scaleMultiplier / Math.max(1, texture.width));
    const tx = Math.floor(modulo(x / displayScale, texture.width));
    const vertical = Math.floor(y / displayScale);
    if (layer.cliffVerticalSampling === "preserve" && (vertical < 0 || vertical >= texture.height)) {
        return { color: [0, 0, 0], alpha: 0 };
    }
    const ty = layer.cliffVerticalSampling === "repeat"
        ? Math.floor(modulo(vertical, texture.height))
        : vertical;
    const index = (ty * texture.width + tx) * 4;
    return {
        color: applyLayerBrightness([texture.data[index], texture.data[index + 1], texture.data[index + 2]], layer.brightness),
        alpha: texture.data[index + 3] / 255,
    };
}
export function cliffTextureWeightsForNormal(layer, normalX, normalY) {
    const projection = directionVector(layer.cliffDirection);
    const facing = Math.max(-1, Math.min(1, projection.x * normalX + projection.y * normalY));
    const front = smoothstep(0, 1, Math.max(0, facing));
    const rear = smoothstep(0, 1, Math.max(0, -facing));
    return { front, side: Math.max(0, 1 - front - rear), rear };
}
export function sampleDirectionalCliffTexture(layer, x, y, textures, normalX, normalY) {
    const front = sampleUploadedCliffTextureAtKey(layer, cliffTextureKey(layer.id, "front"), x, y, textures);
    const side = sampleUploadedCliffTextureAtKey(layer, cliffTextureKey(layer.id, "side"), x, y, textures);
    const rear = sampleUploadedCliffTextureAtKey(layer, cliffTextureKey(layer.id, "rear"), x, y, textures);
    const fallback = front ?? side ?? rear;
    if (!fallback)
        return null;
    const rawWeights = cliffTextureWeightsForNormal(layer, normalX, normalY);
    const projection = directionVector(layer.cliffDirection);
    const facing = projection.x * normalX + projection.y * normalY;
    const sideActive = layer.cliffDirectional && layer.cliffSideDepth > 0;
    const rearActive = layer.cliffDirectional && layer.cliffRearDepth > 0;
    const weights = { ...rawWeights };
    // A zero-height (or disabled) face is structural absence, not a very small
    // face. Its material must not leak into the rounded transition that remains
    // between visible faces.
    if (!sideActive) {
        if (facing < 0 && rearActive)
            weights.rear += weights.side;
        else
            weights.front += weights.side;
        weights.side = 0;
    }
    if (!rearActive) {
        weights.front += weights.rear;
        weights.rear = 0;
    }
    const frontSample = front ?? fallback;
    const sideSample = side ?? frontSample;
    const rearSample = rear ?? frontSample;
    return {
        color: [0, 1, 2].map((channel) => (frontSample.color[channel] * weights.front
            + sideSample.color[channel] * weights.side
            + rearSample.color[channel] * weights.rear)),
        alpha: frontSample.alpha * weights.front + sideSample.alpha * weights.side + rearSample.alpha * weights.rear,
    };
}
function sampleProcedural(layer, x, y, size, nx, ny, seed, variant) {
    const base = parseHex(layer.color);
    const accent = parseHex(layer.accent);
    if (layer.roughness <= 0)
        return mixColor(base, accent, 0.5);
    const period = Math.max(1, size - 1);
    const layerSeed = seed + layer.seedOffset + variant * 181;
    const low = periodicNoise(x, y, period, layerSeed, layer.frequency, 4);
    const high = periodicNoise(x, y, period, layerSeed + 101, layer.frequency * 3, 2);
    const grain = periodicNoise(x, y, period, layerSeed + 211, layer.frequency * 7, 1);
    const paletteShift = seededJitter(layerSeed, variant + 1) * 0.045;
    let accentMix = 0.5 + low * 0.24 + high * 0.1 + paletteShift;
    let shade = 0;
    switch (layer.pattern) {
        case "organic":
            accentMix += Math.max(0, grain - 0.28) * 0.22;
            shade = high * 13;
            break;
        case "soil":
            accentMix = 0.38 + low * 0.18 + Math.abs(high) * 0.12;
            shade = grain * 12;
            break;
        case "sand":
            accentMix = 0.48 + low * 0.12 + Math.max(0, grain - 0.42) * 0.32;
            shade = high * 7;
            break;
        case "rock": {
            const directionalShade = ny * 0.18 - Math.abs(nx) * 0.04;
            accentMix = 0.34 + low * 0.2 + directionalShade;
            shade = high * 18 - ny * 13;
            break;
        }
        case "foam":
            accentMix = 0.25 + Math.max(0, low + high * 0.45) * 0.52;
            shade = grain * 20;
            break;
        case "water": {
            const wave = Math.sin((y / period) * Math.PI * 8 + low * 1.4) * 0.09;
            accentMix = 0.42 + low * 0.16 + wave;
            shade = high * 9;
            break;
        }
        default:
            break;
    }
    const mixed = mixColor(base, accent, Math.max(0, Math.min(1, accentMix)));
    return [mixed[0] + shade, mixed[1] + shade, mixed[2] + shade];
}
function applyLayerBrightness(color, amount) {
    const brightness = Math.max(-1, Math.min(1, amount));
    if (brightness === 0)
        return color;
    if (brightness < 0) {
        const multiplier = 1 + brightness;
        return [color[0] * multiplier, color[1] * multiplier, color[2] * multiplier];
    }
    return [
        color[0] + (255 - color[0]) * brightness,
        color[1] + (255 - color[1]) * brightness,
        color[2] + (255 - color[2]) * brightness,
    ];
}
function sampleLayer(layer, x, y, size, nx, ny, recipe, textures, variant) {
    const custom = sampleUploadedTexture(layer, x, y, size, textures, nx, ny);
    if (custom)
        return applyLayerBrightness(custom, layer.brightness);
    const getCachedPixels = (cacheVariant) => {
        const cacheKey = [layer.id, size, recipe.shape.seed, cacheVariant, layer.pattern, layer.color, layer.accent, layer.scale, layer.frequency, layer.roughness, layer.seedOffset].join(":");
        let cached = layerPixelCache.get(cacheKey);
        if (!cached) {
            cached = new Float32Array(size * size * 3);
            for (let sampleY = 0; sampleY < size; sampleY += 1) {
                for (let sampleX = 0; sampleX < size; sampleX += 1) {
                    const color = sampleProcedural(layer, sampleX, sampleY, size, 0, 0, recipe.shape.seed, cacheVariant);
                    const sampleIndex = (sampleY * size + sampleX) * 3;
                    cached[sampleIndex] = color[0];
                    cached[sampleIndex + 1] = color[1];
                    cached[sampleIndex + 2] = color[2];
                }
            }
            layerPixelCache.set(cacheKey, cached);
        }
        return cached;
    };
    const cached = getCachedPixels(variant);
    const index = (y * size + x) * 3;
    const edgeDistance = Math.min(x, y, size - 1 - x, size - 1 - y);
    const seamDamping = smoothstep(0, 2.5, edgeDistance);
    const directionalShade = layer.pattern === "rock" ? (ny * 10 - Math.abs(nx) * 3) * seamDamping : 0;
    let red = cached[index];
    let green = cached[index + 1];
    let blue = cached[index + 2];
    if (terrainEdgeDeformations(recipe.shape).some((effect) => effect.mode === "artistic") && variant > 0) {
        const shared = getCachedPixels(0);
        const variationStrength = Math.min(1, 0.35 + recipe.variants.textureVariation * 1.3);
        const mix = artisticVariantInteriorWeight(x, y, size) * variationStrength;
        red = shared[index] + (red - shared[index]) * mix;
        green = shared[index + 1] + (green - shared[index + 1]) * mix;
        blue = shared[index + 2] + (blue - shared[index + 2]) * mix;
    }
    const procedural = [red + directionalShade, green + directionalShade, blue + directionalShade];
    return applyLayerBrightness(procedural, layer.brightness);
}
function enabledLayerStack(recipe) {
    const layers = recipe.layers.filter((layer) => layer.enabled);
    const inside = layers.find((layer) => layer.kind === "inside") ?? layers[0];
    const outside = [...layers].reverse().find((layer) => layer.kind === "outside") ?? layers[layers.length - 1];
    const storedBands = layers.filter((layer) => layer.kind === "band" && !layer.cliffFaceOnly && !layer.cliffEnabled);
    const bands = recipe.stackOrder === "top-first" ? [...storedBands].reverse() : storedBands;
    return [inside, ...bands, outside].filter(Boolean);
}
const cutoutRecipeCache = new WeakMap();
function isCutoutOutput(recipe) {
    return recipe.shape.outputMode !== "composite";
}
/**
 * A "Dig outside" overlay retains the authored inner borders. They sit on
 * the visible side of the generated alpha contour, so treating the overlay as
 * surface-only made the "Add inner border" action appear to do nothing.
 * Outer layers and cliff faces remain excluded from the cut-out renderer.
 */
function surfaceOnlyRecipe(recipe) {
    const cached = cutoutRecipeCache.get(recipe);
    if (cached)
        return cached;
    const source = recipe.layers.find((layer) => layer.kind === "inside") ?? recipe.layers[0];
    const surface = { ...source, kind: "inside", enabled: true, cliffEnabled: false, cliffFaceOnly: false, shadowEnabled: false };
    const innerBands = recipe.layers.filter((layer) => layer.kind === "band"
        && layer.enabled
        && layer.placement === "inner"
        && !layer.cliffEnabled
        && !layer.cliffFaceOnly);
    const outside = { ...surface, id: `${surface.id}:cutout-outside`, kind: "outside" };
    const result = {
        ...recipe,
        shape: { ...recipe.shape, transparentBackground: true, outputMode: "composite" },
        layers: [surface, ...innerBands, outside],
        selectedLayerId: surface.id,
        stackOrder: "top-first",
    };
    cutoutRecipeCache.set(recipe, result);
    return result;
}
function buildCutoutAlphaField(recipe, mask, size, variant) {
    const surface = recipe.layers.find((layer) => layer.kind === "inside") ?? recipe.layers[0];
    const extrusion = Math.max(0, Math.min(1, recipe.shape.cutoutExtrusion)) * size;
    const key = `cutout:${recipe.shape.outputMode}:${extrusion}:${surface?.feather ?? 0}:${heightFieldKey(recipe, mask, size, variant)}`;
    const cached = alphaFieldCache.get(key);
    if (cached)
        return cached;
    const field = buildRecipeDistanceField(recipe, mask, size, variant);
    const fade = Math.max(0.5, (surface?.feather ?? 0) * size);
    const keepInside = recipe.shape.outputMode === "cutout-inside";
    const alpha = Float32Array.from(field.distance, (distance) => {
        // Extrusion grows the selected transparent side across the generated
        // contour. In both modes this erodes the retained texture by the exact
        // requested spatial distance; the user never paints alpha manually.
        const shiftedDistance = keepInside ? distance + extrusion : distance - extrusion;
        const coverage = 1 - smoothstep(-fade, fade, shiftedDistance);
        return keepInside ? coverage : 1 - coverage;
    });
    alphaFieldCache.set(key, alpha);
    return alpha;
}
function usesCornerPreservingDistance(recipe, layer) {
    if (layer.placement !== "inner" || layer.fadeInward > 1e-6)
        return false;
    // Independent overlapping bands need the continuous Euclidean field for
    // their authored fades and ordering. The common single-border case uses the
    // radius-preserving offset that fixes concave corner joins.
    return recipe.layers.filter((candidate) => candidate.enabled
        && candidate.kind === "band"
        && !candidate.cliffEnabled
        && !candidate.cliffFaceOnly
        && candidate.placement === "inner").length === 1;
}
function applyFadeCurve(value, curve) {
    const t = Math.max(0, Math.min(1, value));
    if (curve === "linear")
        return t;
    if (curve === "soft")
        return 1 - (1 - t) ** 3;
    if (curve === "hard")
        return t ** 3;
    return t * t * (3 - 2 * t);
}
function contourDisplacement(profile, x, y, size, seed, phaseOffset) {
    if (profile.mode === "straight" || profile.amplitude <= 0)
        return 0;
    const period = Math.max(1, size - 1);
    const continuousFrequency = Math.max(0.25, profile.frequency);
    const frequency = profile.mode === "wave" || profile.mode === "scallop"
        ? Math.max(1, Math.round(continuousFrequency))
        : continuousFrequency;
    const phase = (profile.phase + phaseOffset) * Math.PI * 2;
    const px = (x / period) * Math.PI * 2 * frequency;
    const py = (y / period) * Math.PI * 2 * frequency;
    let value = 0;
    if (profile.mode === "wave")
        value = Math.sin(px + py * 0.35 + phase);
    else if (profile.mode === "scallop")
        value = (Math.sin(px + phase) + Math.sin(py + phase * 0.71)) * 0.5;
    else {
        const noise = periodicNoise(x, y, period, seed + Math.round(profile.phase * 997), frequency, 3);
        value = profile.mode === "fractured"
            ? Math.sign(noise) * Math.sqrt(Math.abs(noise))
            : noise;
    }
    return value * profile.amplitude * size;
}
function layerEdgeDisplacement(layer, x, y, size, seed) {
    const authoredRatio = layer.edgeDeformations.reduce((total, deformation) => total + deformation.amount * LAYER_EDGE_DISPLACEMENT_RATIO, 0);
    const stackScale = authoredRatio > MAX_LAYER_EDGE_STACK_RATIO
        ? MAX_LAYER_EDGE_STACK_RATIO / authoredRatio
        : 1;
    const frequencyLimit = layerEdgeFrequencyLimit(size);
    return layer.edgeDeformations.reduce((total, deformation, index) => {
        const amplitude = deformation.amount * LAYER_EDGE_DISPLACEMENT_RATIO * stackScale;
        const frequency = Math.min(deformation.frequency, frequencyLimit);
        if (deformation.mode === "artistic") {
            const period = Math.max(1, size - 1);
            const offsetX = deformation.phase * period;
            const offsetY = deformation.phase * period * 0.61803398875;
            return total + periodicCoastMotif(x + offsetX, y + offsetY, period, seed + index * 409, frequency, 4, 0.5) * amplitude * size;
        }
        return total + contourDisplacement({
            mode: deformation.mode,
            amplitude,
            frequency,
            phase: deformation.phase,
        }, x, y, size, seed + index * 409, index * 0.173);
    }, 0);
}
function bandBounds(recipe, layer, x, y, size, variant) {
    const requestedWidth = Math.max(0, Math.min(1, layer.width));
    // Dual Grid's local signed-distance domain is half a tile, but the authored
    // percentage is expressed in whole-tile units: 50% must mean 0.5 tile, not
    // 0.25 tile. Values above 50% continue through the saturated Full state in
    // bandCoverage while the local contour remains clamped to its seam-safe
    // half-tile domain.
    const dualContourReach = size * 0.5;
    const reach = size;
    // Blob's saturated center state needs a small progressive guard at the
    // endpoint; Dual deliberately has none so coverage reaches exactly zero on
    // the seam shared with its Full state.
    const seamGuard = recipe.topology === "dual16" ? 0 : requestedWidth ** 6 * size * 0.05;
    const width = Math.max(1, requestedWidth * reach + seamGuard);
    const placementBias = layer.placement === "inner" ? -width / 2 : layer.placement === "outer" ? width / 2 : 0;
    const mergeBias = (recipe.shape.mergePoint - 0.5) * size * 0.12;
    const center = (layer.distanceOffset + layer.cutoff) * size + placementBias + mergeBias;
    // Legacy profiles remain disabled while a global contour is active. The
    // explicit effect stack is different: it is intentionally additive and is
    // evaluated only for this material.
    const layerContourScale = terrainEdgeDeformations(recipe.shape).length === 0 ? 1 : 0;
    const maximumLegacyOffset = width * 0.45;
    const clampLegacy = (value) => Math.max(-maximumLegacyOffset, Math.min(maximumLegacyOffset, value));
    // Explicit effects move both band boundaries together. Their amplitudes are
    // normalized as a stack in layerEdgeDisplacement, avoiding the flat peaks
    // produced by a per-pixel hard clamp.
    const local = layerEdgeDisplacement(layer, x, y, size, recipe.shape.seed + layer.seedOffset + variant * 211);
    const inner = local + clampLegacy(layerContourScale * contourDisplacement(layer.innerContour, x, y, size, recipe.shape.seed + layer.seedOffset + variant * 103, 0));
    const outer = local + clampLegacy(layerContourScale * contourDisplacement(layer.outerContour, x, y, size, recipe.shape.seed + layer.seedOffset + variant * 149, 0.37));
    let rawStart = center - width / 2 + inner;
    let rawEnd = center + width / 2 + outer;
    const minimumWidth = Math.max(0.5, width * 0.1);
    if (recipe.topology === "dual16") {
        // Offsets from imported/legacy recipes must stay inside Dual's local
        // signed-distance domain too. At the exact +/- half-tile limits coverage
        // evaluates to zero, so Full and Empty states remain context-free while
        // their neighbouring contour states still join without a seam.
        const limit = dualContourReach;
        rawStart = Math.max(-limit, Math.min(limit, rawStart));
        rawEnd = Math.max(-limit, Math.min(limit, rawEnd));
        if (rawEnd <= rawStart + minimumWidth) {
            const midpoint = Math.max(-limit + minimumWidth / 2, Math.min(limit - minimumWidth / 2, (rawStart + rawEnd) / 2));
            return { start: midpoint - minimumWidth / 2, end: midpoint + minimumWidth / 2 };
        }
    }
    return rawEnd > rawStart + minimumWidth
        ? { start: rawStart, end: rawEnd }
        : { start: (rawStart + rawEnd - minimumWidth) / 2, end: (rawStart + rawEnd + minimumWidth) / 2 };
}
function bandCoverage(recipe, layer, x, y, size, distance, nx, ny, variant, mask) {
    const { start, end } = bandBounds(recipe, layer, x, y, size, variant);
    const sideAmount = directionFactor(layer.sides, nx, ny);
    if (layer.placement === "inner" && layer.width >= 1 - 1e-6 && layer.fadeInward <= 1e-6) {
        const enabled = recipe.layers.filter((candidate) => candidate.enabled);
        const inside = enabled.find((candidate) => candidate.kind === "inside") ?? enabled[0];
        const outside = [...enabled].reverse().find((candidate) => candidate.kind === "outside") ?? enabled[enabled.length - 1];
        const terrainFade = Math.max(0.5, ((inside.feather + outside.feather) / 2) * size);
        if (distance < terrainFade)
            return { start, end, amount: layer.opacity * sideAmount };
    }
    const antialiasFloor = layer.edgeDeformations.length > 0 ? 0.5 : 0.25;
    const innerFade = Math.max(antialiasFloor, layer.innerFade * size);
    const outerFade = Math.max(antialiasFloor, Math.max(layer.outerFade, layer.taper * layer.width * 0.5) * size);
    const enters = applyFadeCurve(smoothstep(start, start + innerFade * 2, distance), layer.fadeCurve);
    const exits = 1 - applyFadeCurve(smoothstep(end - outerFade * 2, end, distance), layer.fadeCurve);
    // Saturated terrain states have no local contour beyond the topology's
    // signed-distance domain. Blend their deep interior progressively from 50%
    // to 100% instead of jumping from a thin contour at 99% to a full takeover.
    // Fade toward inside deliberately reveals the surface in that deep region.
    const deepInteriorLimit = recipe.topology === "dual16" ? size * 0.5 : size;
    if (recipe.topology !== "dual16" && layer.placement === "inner" && distance <= -deepInteriorLimit + 0.5) {
        const deepCoverage = applyFadeCurve(smoothstep(0.5, 1, layer.width), layer.fadeCurve);
        const inwardOpacity = 1 - layer.fadeInward;
        const amount = deepCoverage * inwardOpacity * layer.opacity * sideAmount;
        return { start, end, amount };
    }
    // Fade across this layer's complete authored width. The former half-tile
    // clamp made wide overlapping borders share almost the same gradient, so a
    // higher layer could visually erase the fade of the one below it.
    const inwardGradient = layer.placement === "inner"
        ? 1 - layer.fadeInward + layer.fadeInward * applyFadeCurve(smoothstep(start, end, distance), layer.fadeCurve)
        : 1;
    // With an authored inward fade, the gradient already performs the inner
    // transition. Blending out the hard inner envelope avoids applying the fade
    // twice, which previously made lower overlapping borders disappear.
    const innerEnvelope = enters * (1 - layer.fadeInward) + layer.fadeInward;
    return { start, end, amount: innerEnvelope * exits * inwardGradient * layer.opacity * sideAmount };
}
function applyArtDirection(color, settings) {
    const exposure = 2 ** settings.exposure;
    let red = color[0] * exposure;
    let green = color[1] * exposure;
    let blue = color[2] * exposure;
    const temperature = settings.temperature * 24;
    red += temperature;
    green += temperature * 0.15;
    blue -= temperature;
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    red = luminance + (red - luminance) * settings.saturation;
    green = luminance + (green - luminance) * settings.saturation;
    blue = luminance + (blue - luminance) * settings.saturation;
    return [
        128 + (red - 128) * settings.contrast,
        128 + (green - 128) * settings.contrast,
        128 + (blue - 128) * settings.contrast,
    ];
}
function shadeRelief(color, layer, nx, ny, distance, start, end, x, y, size) {
    if (layer.relief === 0 || layer.reliefStrength === 0)
        return color;
    const angle = (layer.reliefAngle * Math.PI) / 180;
    const light = -(nx * Math.cos(angle) + ny * Math.sin(angle));
    const halfWidth = Math.max(0.5, (end - start) / 2);
    const center = (start + end) / 2;
    const dome = Math.max(0, 1 - Math.abs(distance - center) / halfWidth);
    const shaped = dome ** (0.35 + layer.reliefSoftness * 2.4);
    const edgeDistance = Math.min(x, y, size - 1 - x, size - 1 - y);
    const seamDamping = smoothstep(0, 2.5, edgeDistance);
    const shade = light * layer.relief * layer.reliefStrength * (18 + shaped * 38) * seamDamping;
    const ambientOcclusion = -Math.abs(layer.relief) * layer.reliefStrength * (1 - shaped) * 9 * seamDamping;
    return [color[0] + shade + ambientOcclusion, color[1] + shade + ambientOcclusion, color[2] + shade + ambientOcclusion];
}
function renderColorAt(recipe, textures, stack, mask, x, y, size, distance, bandDistance, nx, ny, variant, pixelIndex, shadowMaps) {
    const bands = stack.slice(1, -1);
    const inside = stack[0];
    const outside = stack[stack.length - 1];
    const baseFade = Math.max(0.5, ((inside.feather + outside.feather) / 2) * size);
    const baseMix = smoothstep(-baseFade, baseFade, distance);
    let result = mixColor(sampleLayer(inside, x, y, size, nx, ny, recipe, textures, variant), sampleLayer(outside, x, y, size, nx, ny, recipe, textures, variant), baseMix);
    const insideCastShadow = shadowMaps.get(`outer:${inside.id}`)?.[pixelIndex] ?? 0;
    if (insideCastShadow > 0)
        result = mixColor(result, parseHex(inside.shadowColor), insideCastShadow);
    for (const layer of bands) {
        const shadow = shadowMaps.get(`outer:${layer.id}`)?.[pixelIndex] ?? 0;
        if (shadow > 0)
            result = mixColor(result, parseHex(layer.shadowColor), shadow);
        const layerDistance = usesCornerPreservingDistance(recipe, layer) ? bandDistance : distance;
        const { start, end, amount } = bandCoverage(recipe, layer, x, y, size, layerDistance, nx, ny, variant, mask);
        const layerColor = shadeRelief(sampleLayer(layer, x, y, size, nx, ny, recipe, textures, variant), layer, nx, ny, layerDistance, start, end, x, y, size);
        result = mixColor(result, layerColor, amount);
    }
    return applyArtDirection(result, recipe.artDirection);
}
function heightFieldKey(recipe, mask, size, variant) {
    return `${recipe.topology}:${recipe.dualDiagonal}:${mask}:${size}:${variant}:${recipe.shape.seed}:${recipe.shape.thickness}:${recipe.shape.outerRadius}:${recipe.shape.innerRadius}:${recipe.shape.roughness}:${recipe.shape.frequency}:${recipe.shape.deformationMode}:${recipe.shape.deformationPhase}:${recipe.shape.organicOffset}:${recipe.shape.organicOctaves}:${recipe.shape.organicPersistence}:${JSON.stringify(recipe.shape.edgeDeformations)}:${recipe.artDirection.heightScale}:${JSON.stringify(recipe.layers.map((layer) => [layer.id, layer.enabled, layer.width, layer.placement, layer.distanceOffset, layer.cutoff, layer.innerFade, layer.outerFade, layer.taper, layer.fadeInward, layer.fadeCurve, layer.opacity, layer.sides, layer.innerContour, layer.outerContour, layer.edgeDeformations, layer.relief, layer.reliefStrength, layer.shadowEnabled, layer.shadowOpacity, layer.shadowDistance, layer.shadowAngle, layer.shadowBlur, layer.shadowAffectsAo]))}`;
}
function buildHeightField(recipe, mask, size, variant) {
    const key = heightFieldKey(recipe, mask, size, variant);
    const cached = heightFieldCache.get(key);
    if (cached)
        return cached;
    const field = buildRecipeDistanceField(recipe, mask, size, variant);
    const stack = enabledLayerStack(recipe);
    const bands = stack.slice(1, -1);
    const inside = stack[0];
    const outside = stack[stack.length - 1];
    const baseFade = Math.max(0.5, ((inside.feather + outside.feather) / 2) * size);
    const height = new Float32Array(size * size);
    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            const index = y * size + x;
            const distance = field.distance[index];
            const bandDistance = field.bandDistance[index];
            const nx = field.normalX[index];
            const ny = field.normalY[index];
            const land = 1 - smoothstep(-baseFade, baseFade, distance);
            let value = 0.48 + land * 0.04;
            const edgeDistance = Math.min(x, y, size - 1 - x, size - 1 - y);
            const seamDamping = smoothstep(0, 2.5, edgeDistance);
            for (const layer of bands) {
                const layerDistance = usesCornerPreservingDistance(recipe, layer) ? bandDistance : distance;
                const coverage = bandCoverage(recipe, layer, x, y, size, layerDistance, nx, ny, variant, mask);
                const halfWidth = Math.max(0.5, (coverage.end - coverage.start) / 2);
                const dome = Math.max(0, 1 - Math.abs(layerDistance - (coverage.start + coverage.end) / 2) / halfWidth);
                value += layer.relief * layer.reliefStrength * recipe.artDirection.heightScale * coverage.amount * (0.12 + dome * 0.2) * seamDamping;
            }
            height[index] = Math.max(0, Math.min(1, value));
        }
    }
    heightFieldCache.set(key, height);
    if (heightFieldCache.size > 160) {
        const firstKey = heightFieldCache.keys().next().value;
        if (firstKey)
            heightFieldCache.delete(firstKey);
    }
    return height;
}
function buildTerrainCoverageField(recipe, mask, size, variant) {
    const key = `coverage:${recipe.shape.thickness}:${recipe.shape.outerRadius}:${recipe.shape.innerRadius}:${recipe.shape.roughness}:${recipe.shape.frequency}:${recipe.shape.deformationMode}:${recipe.shape.deformationPhase}:${recipe.shape.organicOffset}:${recipe.shape.organicOctaves}:${recipe.shape.organicPersistence}:${JSON.stringify(recipe.shape.edgeDeformations)}:${heightFieldKey(recipe, mask, size, variant)}`;
    const cached = alphaFieldCache.get(key);
    if (cached)
        return cached;
    const alpha = new Float32Array(size * size);
    const field = buildRecipeDistanceField(recipe, mask, size, variant);
    const stack = enabledLayerStack(recipe);
    const bands = stack.slice(1, -1);
    const inside = stack[0];
    const outside = stack[stack.length - 1];
    const baseFade = Math.max(0.5, ((inside.feather + outside.feather) / 2) * size);
    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            const index = y * size + x;
            const distance = field.distance[index];
            const land = 1 - smoothstep(-baseFade, baseFade, distance);
            let amount = land;
            for (const layer of bands) {
                const layerDistance = usesCornerPreservingDistance(recipe, layer) ? field.bandDistance[index] : distance;
                const coverage = bandCoverage(recipe, layer, x, y, size, layerDistance, field.normalX[index], field.normalY[index], variant, mask).amount;
                // An inner border is paint inside the terrain, never additional
                // terrain. Letting its tile-local offset enlarge alpha produced the
                // repeated semicircular bumps visible along straight Blob edges.
                amount = Math.max(amount, layer.placement === "inner" ? coverage * land : coverage);
            }
            alpha[index] = Math.max(0, Math.min(1, amount));
        }
    }
    alphaFieldCache.set(key, alpha);
    if (alphaFieldCache.size > 160) {
        const firstKey = alphaFieldCache.keys().next().value;
        if (firstKey)
            alphaFieldCache.delete(firstKey);
    }
    return alpha;
}
function buildTerrainAlphaField(recipe, mask, size, variant) {
    if (isCutoutOutput(recipe))
        return buildCutoutAlphaField(recipe, mask, size, variant);
    if (recipe.shape.transparentBackground)
        return buildTerrainCoverageField(recipe, mask, size, variant);
    const key = `alpha:opaque:${size}:${heightFieldKey(recipe, mask, size, variant)}`;
    const cached = alphaFieldCache.get(key);
    if (cached)
        return cached;
    const alpha = new Float32Array(size * size);
    alpha.fill(1);
    alphaFieldCache.set(key, alpha);
    return alpha;
}
export function renderAuxiliaryTilePixels(recipe, mask, size, channel, variant = 0, textures = new Map()) {
    const renderRecipe = isCutoutOutput(recipe) ? surfaceOnlyRecipe(recipe) : recipe;
    const height = buildHeightField(renderRecipe, mask, size, variant);
    const alpha = buildTerrainAlphaField(recipe, mask, size, variant);
    const output = new Uint8ClampedArray(size * size * 4);
    const stack = enabledLayerStack(renderRecipe);
    const surface = stack[0];
    const shadowMaps = channel === "ao" ? buildLayerShadowMaps(renderRecipe, mask, size, variant, stack) : new Map();
    const sample = (x, y) => height[Math.max(0, Math.min(size - 1, y)) * size + Math.max(0, Math.min(size - 1, x))];
    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            const index = y * size + x;
            const out = index * 4;
            if (channel === "height") {
                const value = clampByte(height[index] * 255);
                output[out] = value;
                output[out + 1] = value;
                output[out + 2] = value;
            }
            else if (channel === "normal") {
                if (x === 0 || y === 0 || x === size - 1 || y === size - 1) {
                    output[out] = 128;
                    output[out + 1] = 128;
                    output[out + 2] = 255;
                }
                else {
                    const dx = (sample(x - 1, y) - sample(x + 1, y)) * recipe.artDirection.normalStrength * 9;
                    const dy = (sample(x, y - 1) - sample(x, y + 1)) * recipe.artDirection.normalStrength * 9;
                    const length = Math.hypot(dx, dy, 1) || 1;
                    output[out] = clampByte((dx / length * 0.5 + 0.5) * 255);
                    output[out + 1] = clampByte((dy / length * 0.5 + 0.5) * 255);
                    output[out + 2] = clampByte((1 / length * 0.5 + 0.5) * 255);
                }
            }
            else {
                if (x === 0 || y === 0 || x === size - 1 || y === size - 1) {
                    output[out] = 255;
                    output[out + 1] = 255;
                    output[out + 2] = 255;
                }
                else {
                    const center = height[index];
                    const laplacian = sample(x - 1, y) + sample(x + 1, y) + sample(x, y - 1) + sample(x, y + 1) - center * 4;
                    const gradient = Math.hypot(sample(x + 1, y) - sample(x - 1, y), sample(x, y + 1) - sample(x, y - 1));
                    const occlusion = Math.max(0, Math.min(1, Math.abs(laplacian) * 8 + gradient * 2.5)) * recipe.artDirection.aoStrength;
                    let castShadow = 0;
                    for (const layer of stack) {
                        if (layer.shadowAffectsAo)
                            castShadow = Math.max(castShadow, shadowMaps.get(`outer:${layer.id}`)?.[index] ?? 0);
                    }
                    const value = clampByte((1 - Math.min(0.82, occlusion + castShadow * 0.72)) * 255);
                    output[out] = value;
                    output[out + 1] = value;
                    output[out + 2] = value;
                }
            }
            const sourceAlpha = isCutoutOutput(recipe) ? sampleUploadedTextureAlpha(surface, x, y, size, textures) ?? 1 : 1;
            output[out + 3] = clampByte(alpha[index] * sourceAlpha * 255);
        }
    }
    return output;
}
export function renderTilePixels(recipe, mask, size, textures = new Map(), variant = 0, silhouetteOnly = false) {
    const renderRecipe = isCutoutOutput(recipe) ? surfaceOnlyRecipe(recipe) : recipe;
    const output = new Uint8ClampedArray(size * size * 4);
    const field = buildRecipeDistanceField(recipe, mask, size, variant);
    const stack = enabledLayerStack(renderRecipe);
    const alpha = buildTerrainAlphaField(recipe, mask, size, variant);
    const shadowMaps = silhouetteOnly ? new Map() : buildLayerShadowMaps(renderRecipe, mask, size, variant, stack);
    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            const pixelIndex = y * size + x;
            const outputIndex = pixelIndex * 4;
            let color;
            if (silhouetteOnly) {
                const inside = alpha[pixelIndex] >= 0.5;
                color = inside ? [126, 157, 79] : [22, 48, 50];
            }
            else {
                color = renderColorAt(renderRecipe, textures, stack, mask, x, y, size, field.distance[pixelIndex], field.bandDistance[pixelIndex], field.normalX[pixelIndex], field.normalY[pixelIndex], variant, pixelIndex, shadowMaps);
            }
            output[outputIndex] = clampByte(color[0]);
            output[outputIndex + 1] = clampByte(color[1]);
            output[outputIndex + 2] = clampByte(color[2]);
            const surface = stack[0];
            const sourceAlpha = isCutoutOutput(recipe) && !silhouetteOnly
                ? sampleUploadedTextureAlpha(surface, x, y, size, textures) ?? 1
                : 1;
            output[outputIndex + 3] = clampByte(alpha[pixelIndex] * sourceAlpha * 255);
        }
    }
    return output;
}
/**
 * Renders the utility tile used to prefill a bounded Blob 47 cut-out overlay.
 * It is deliberately not a terrain state: painted terrain cells overwrite it
 * with the 47 carving transitions, including their transparent pixels.
 */
export function renderCutoutFillTilePixels(recipe, size, textures = new Map(), variant = 0, channel = "albedo", silhouetteOnly = false) {
    const renderRecipe = surfaceOnlyRecipe(recipe);
    const opaqueRecipe = {
        ...renderRecipe,
        shape: { ...renderRecipe.shape, outputMode: "composite", transparentBackground: false },
    };
    const pixels = channel === "albedo"
        ? renderTilePixels(opaqueRecipe, 255, size, textures, variant, silhouetteOnly)
        : renderAuxiliaryTilePixels(opaqueRecipe, 255, size, channel, variant, textures);
    const surface = renderRecipe.layers[0];
    if (!surface)
        return pixels;
    for (let y = 0; y < size; y += 1)
        for (let x = 0; x < size; x += 1) {
            const sourceAlpha = sampleUploadedTextureAlpha(surface, x, y, size, textures) ?? 1;
            pixels[(y * size + x) * 4 + 3] = clampByte(pixels[(y * size + x) * 4 + 3] * sourceAlpha);
        }
    return pixels;
}
export function renderTileWithOverridePixels(recipe, mask, size, textures = new Map(), variant = 0) {
    const override = textures.get(`override:${mask}`);
    if (!override)
        return renderTilePixels(recipe, mask, size, textures, variant);
    const custom = scaledTexturePixels(override, size);
    const settings = tileOverrideSettings(recipe, mask);
    if (settings.mode === "replace")
        return custom;
    const base = renderTilePixels(recipe, mask, size, textures, variant);
    const previewScale = size / Math.max(1, recipe.shape.tileSize);
    return blendTileOverride(base, custom, size, {
        ...settings,
        insetPx: settings.insetPx * previewScale,
        featherPx: settings.featherPx * previewScale,
    });
}
function buildBandCoverageMap(recipe, layer, mask, size, variant) {
    const field = buildRecipeDistanceField(recipe, mask, size, variant);
    const coverage = new Float32Array(size * size);
    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            const index = y * size + x;
            coverage[index] = bandCoverage(recipe, layer, x, y, size, usesCornerPreservingDistance(recipe, layer) ? field.bandDistance[index] : field.distance[index], field.normalX[index], field.normalY[index], variant, mask).amount;
        }
    }
    return coverage;
}
function offsetMask(source, width, height, shiftX, shiftY) {
    const shifted = new Float32Array(width * height);
    const dx = Math.round(shiftX);
    const dy = Math.round(shiftY);
    for (let sourceY = 0; sourceY < height; sourceY += 1) {
        const targetY = sourceY + dy;
        if (targetY < 0 || targetY >= height)
            continue;
        for (let sourceX = 0; sourceX < width; sourceX += 1) {
            const coverage = source[sourceY * width + sourceX];
            if (coverage <= 0)
                continue;
            const targetX = sourceX + dx;
            if (targetX < 0 || targetX >= width)
                continue;
            const target = targetY * width + targetX;
            shifted[target] = Math.max(shifted[target], coverage);
        }
    }
    return shifted;
}
function blurMask(source, width, height, radius) {
    const blurRadius = Math.max(0, Math.round(radius));
    if (blurRadius === 0)
        return source;
    const windowSize = blurRadius * 2 + 1;
    const horizontal = new Float32Array(width * height);
    const output = new Float32Array(width * height);
    for (let y = 0; y < height; y += 1) {
        let sum = 0;
        for (let x = -blurRadius; x <= blurRadius; x += 1)
            if (x >= 0 && x < width)
                sum += source[y * width + x];
        for (let x = 0; x < width; x += 1) {
            horizontal[y * width + x] = sum / windowSize;
            const removeX = x - blurRadius;
            const addX = x + blurRadius + 1;
            if (removeX >= 0 && removeX < width)
                sum -= source[y * width + removeX];
            if (addX >= 0 && addX < width)
                sum += source[y * width + addX];
        }
    }
    for (let x = 0; x < width; x += 1) {
        let sum = 0;
        for (let y = -blurRadius; y <= blurRadius; y += 1)
            if (y >= 0 && y < height)
                sum += horizontal[y * width + x];
        for (let y = 0; y < height; y += 1) {
            output[y * width + x] = sum / windowSize;
            const removeY = y - blurRadius;
            const addY = y + blurRadius + 1;
            if (removeY >= 0 && removeY < height)
                sum -= horizontal[removeY * width + x];
            if (addY >= 0 && addY < height)
                sum += horizontal[addY * width + x];
        }
    }
    return output;
}
function offsetAndBlurMask(source, width, height, shiftX, shiftY, radius, coreStrength = 0.5) {
    const shifted = offsetMask(source, width, height, shiftX, shiftY);
    if (radius <= 0)
        return shifted;
    const blurred = blurMask(shifted, width, height, radius);
    // A normalized blur can dilute a thin border or cliff edge until its shadow
    // is practically invisible. Preserve a readable displaced core underneath
    // the soft penumbra, as a conventional drop shadow does.
    for (let index = 0; index < blurred.length; index += 1) {
        blurred[index] = Math.max(blurred[index], shifted[index] * coreStrength);
    }
    return blurred;
}
/**
 * Keeps the visible cliff face untouched while removing tile-sized scallops
 * from the silhouette used only to cast its downward shadow. The lowest
 * contiguous wall segment is regularized over roughly one tile, so organic
 * feet remain alive but no longer turn into repeated circular halos after a
 * large blur.
 */
function stabilizeDownwardCliffShadowCaster(source, width, height, tileSize) {
    const feet = new Int32Array(width).fill(-1);
    const starts = new Int32Array(width).fill(-1);
    const strengths = new Float32Array(width);
    for (let x = 0; x < width; x += 1) {
        let foot = -1;
        for (let y = height - 1; y >= 0; y -= 1) {
            if (source[y * width + x] > 0.02) {
                foot = y;
                break;
            }
        }
        if (foot < 0)
            continue;
        let start = foot;
        let strength = 0;
        while (start > 0 && source[(start - 1) * width + x] > 0.02)
            start -= 1;
        for (let y = start; y <= foot; y += 1)
            strength = Math.max(strength, source[y * width + x]);
        feet[x] = foot;
        starts[x] = start;
        strengths[x] = strength;
    }
    const radius = Math.max(2, Math.round(tileSize * 0.5));
    const smoothed = new Int32Array(width).fill(-1);
    for (let x = 0; x < width; x += 1) {
        if (feet[x] < 0)
            continue;
        let weighted = 0;
        let weight = 0;
        for (let sampleX = Math.max(0, x - radius); sampleX <= Math.min(width - 1, x + radius); sampleX += 1) {
            if (feet[sampleX] < 0)
                continue;
            const sampleWeight = radius + 1 - Math.abs(sampleX - x);
            weighted += feet[sampleX] * sampleWeight;
            weight += sampleWeight;
        }
        smoothed[x] = weight > 0 ? Math.round(weighted / weight) : feet[x];
    }
    const output = source.slice();
    for (let x = 0; x < width; x += 1) {
        if (feet[x] < 0 || smoothed[x] < 0)
            continue;
        const start = starts[x];
        const end = Math.max(feet[x], smoothed[x]);
        for (let y = start; y <= end; y += 1)
            output[y * width + x] = y <= smoothed[x] ? strengths[x] : 0;
    }
    return output;
}
function placeLogicalMask(source, size, footprint) {
    const placed = new Float32Array(footprint.width * footprint.height);
    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            placed[(footprint.originY + y) * footprint.width + footprint.originX + x] = source[y * size + x];
        }
    }
    return placed;
}
function buildLayerShadowMaps(recipe, mask, size, variant, stack) {
    const result = new Map();
    const casters = stack.filter((layer) => layer.shadowEnabled && layer.shadowOpacity > 0 && layer.kind !== "outside");
    if (casters.length === 0)
        return result;
    const field = buildRecipeDistanceField(recipe, mask, size, variant);
    const inside = stack[0];
    const outside = stack[stack.length - 1];
    const baseFade = Math.max(0.5, ((inside.feather + outside.feather) / 2) * size);
    for (const layer of casters) {
        const coverage = layer.kind === "inside"
            ? Float32Array.from(field.distance, (distance) => 1 - smoothstep(-baseFade, baseFade, distance))
            : buildBandCoverageMap(recipe, layer, mask, size, variant);
        if (layer.shadowEnabled && layer.shadowOpacity > 0) {
            const key = `shadow:outer:${heightFieldKey(recipe, mask, size, variant)}:${layer.id}:${layer.shadowOpacity}:${layer.shadowDistance}:${layer.shadowAngle}:${layer.shadowBlur}`;
            let shadow = shadowFieldCache.get(key);
            if (!shadow) {
                const angle = layer.shadowAngle * Math.PI / 180;
                const shiftX = Math.cos(angle) * layer.shadowDistance * size;
                const shiftY = Math.sin(angle) * layer.shadowDistance * size;
                const radius = layer.shadowBlur * size;
                const blurred = offsetAndBlurMask(coverage, size, size, shiftX, shiftY, radius);
                shadow = new Float32Array(size * size);
                const seam = Math.max(2, Math.ceil(Math.abs(shiftX) + Math.abs(shiftY) + radius + 1));
                for (let y = 0; y < size; y += 1) {
                    for (let x = 0; x < size; x += 1) {
                        const index = y * size + x;
                        const edgeDistance = Math.min(x, y, size - 1 - x, size - 1 - y);
                        const seamDamping = smoothstep(0, seam, edgeDistance);
                        shadow[index] = Math.max(0, Math.min(1, blurred[index] * (1 - coverage[index]) * layer.shadowOpacity * seamDamping));
                    }
                }
                shadowFieldCache.set(key, shadow);
            }
            result.set(`outer:${layer.id}`, shadow);
        }
    }
    if (shadowFieldCache.size > 160) {
        const firstKey = shadowFieldCache.keys().next().value;
        if (firstKey)
            shadowFieldCache.delete(firstKey);
    }
    return result;
}
function writeProjectedPixel(output, width, height, x, y, color, alpha) {
    if (x < 0 || y < 0 || x >= width || y >= height || alpha <= 0)
        return;
    const index = (y * width + x) * 4;
    const sourceAlpha = Math.max(0, Math.min(1, alpha));
    const targetAlpha = output[index + 3] / 255;
    const combined = sourceAlpha + targetAlpha * (1 - sourceAlpha);
    if (combined <= 0)
        return;
    output[index] = clampByte((color[0] * sourceAlpha + output[index] * targetAlpha * (1 - sourceAlpha)) / combined);
    output[index + 1] = clampByte((color[1] * sourceAlpha + output[index + 1] * targetAlpha * (1 - sourceAlpha)) / combined);
    output[index + 2] = clampByte((color[2] * sourceAlpha + output[index + 2] * targetAlpha * (1 - sourceAlpha)) / combined);
    output[index + 3] = clampByte(combined * 255);
}
/**
 * Dual Grid only encodes the contour inside a half-tile signed-distance
 * domain. Widths above 50% therefore have to project from the contour tile
 * into the neighbouring full tile. Keeping that continuation transparent and
 * oversized makes it exportable without the old opacity overlay shortcut.
 */
function distanceTransformLine(source, length, target, sites, intersections) {
    let envelope = 0;
    sites[0] = 0;
    intersections[0] = -1e20;
    intersections[1] = 1e20;
    for (let point = 1; point < length; point += 1) {
        let site = sites[envelope];
        let split = ((source[point] + point * point) - (source[site] + site * site)) / (2 * (point - site));
        while (split <= intersections[envelope] && envelope > 0) {
            envelope -= 1;
            site = sites[envelope];
            split = ((source[point] + point * point) - (source[site] + site * site)) / (2 * (point - site));
        }
        envelope += 1;
        sites[envelope] = point;
        intersections[envelope] = split;
        intersections[envelope + 1] = 1e20;
    }
    envelope = 0;
    for (let point = 0; point < length; point += 1) {
        while (intersections[envelope + 1] < point)
            envelope += 1;
        const delta = point - sites[envelope];
        target[point] = delta * delta + source[sites[envelope]];
    }
}
/** Exact Euclidean distance, in pixels, from every terrain pixel to outside. */
function interiorDistanceField(terrain, width, height) {
    const maximum = Math.max(width, height);
    const source = new Float64Array(maximum);
    const target = new Float64Array(maximum);
    const sites = new Int32Array(maximum);
    const intersections = new Float64Array(maximum + 1);
    const horizontal = new Float64Array(width * height);
    const squared = new Float64Array(width * height);
    const far = 1e10;
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1)
            source[x] = terrain[y * width + x] >= 0.5 ? far : 0;
        distanceTransformLine(source, width, target, sites, intersections);
        for (let x = 0; x < width; x += 1)
            horizontal[y * width + x] = target[x];
    }
    for (let x = 0; x < width; x += 1) {
        for (let y = 0; y < height; y += 1)
            source[y] = horizontal[y * width + x];
        distanceTransformLine(source, height, target, sites, intersections);
        for (let y = 0; y < height; y += 1)
            squared[y * width + x] = target[y];
    }
    return Float32Array.from(squared, (value, index) => terrain[index] >= 0.5 ? Math.sqrt(Math.max(0, value)) : 0);
}
/** Exact chessboard (L-infinity) distance from every terrain pixel to outside. */
function chessboardInteriorDistanceField(terrain, width, height) {
    const far = width + height + 1;
    const distance = new Float32Array(width * height);
    for (let index = 0; index < distance.length; index += 1)
        distance[index] = terrain[index] >= 0.5 ? far : 0;
    const relax = (index, neighbor) => { distance[index] = Math.min(distance[index], distance[neighbor] + 1); };
    for (let y = 0; y < height; y += 1)
        for (let x = 0; x < width; x += 1) {
            const index = y * width + x;
            if (distance[index] === 0)
                continue;
            if (x > 0)
                relax(index, index - 1);
            if (y > 0) {
                relax(index, index - width);
                if (x > 0)
                    relax(index, index - width - 1);
                if (x + 1 < width)
                    relax(index, index - width + 1);
            }
        }
    for (let y = height - 1; y >= 0; y -= 1)
        for (let x = width - 1; x >= 0; x -= 1) {
            const index = y * width + x;
            if (distance[index] === 0)
                continue;
            if (x + 1 < width)
                relax(index, index + 1);
            if (y + 1 < height) {
                relax(index, index + width);
                if (x > 0)
                    relax(index, index + width - 1);
                if (x + 1 < width)
                    relax(index, index + width + 1);
            }
        }
    return distance;
}
function distanceNormal(distance, width, height, x, y) {
    const dx = distance[y * width + Math.min(width - 1, x + 1)] - distance[y * width + Math.max(0, x - 1)];
    const dy = distance[Math.min(height - 1, y + 1) * width + x] - distance[Math.max(0, y - 1) * width + x];
    const length = Math.hypot(dx, dy) || 1;
    return { nx: -dx / length, ny: -dy / length };
}
function dualCorner(mask, x, y) {
    const bit = y === 0 ? (x === 0 ? DUAL_BIT.NW : DUAL_BIT.NE) : (x === 0 ? DUAL_BIT.SW : DUAL_BIT.SE);
    return (mask & bit) !== 0;
}
function extendedDualMask(mask, offsetX, offsetY) {
    let result = 0;
    const corners = [[0, 0, DUAL_BIT.NW], [1, 0, DUAL_BIT.NE], [1, 1, DUAL_BIT.SE], [0, 1, DUAL_BIT.SW]];
    for (const [x, y, bit] of corners) {
        const sourceX = Math.max(0, Math.min(1, offsetX + x));
        const sourceY = Math.max(0, Math.min(1, offsetY + y));
        if (dualCorner(mask, sourceX, sourceY))
            result |= bit;
    }
    return result;
}
function logicalTerrainCoverage(recipe, mask, size, variant) {
    const field = buildRecipeDistanceField(recipe, mask, size, variant);
    const stack = enabledLayerStack(recipe);
    const inside = stack[0];
    const outside = stack[stack.length - 1];
    const fade = Math.max(0.5, ((inside.feather + outside.feather) / 2) * size);
    return Float32Array.from(field.distance, (distance) => 1 - smoothstep(-fade, fade, distance));
}
function buildDualProjectedContext(recipe, mask, size, variant, footprint) {
    let cache = dualProjectedContextCache.get(recipe);
    if (!cache) {
        cache = new Map();
        dualProjectedContextCache.set(recipe, cache);
    }
    const key = `${heightFieldKey(recipe, mask, size, variant)}:${footprint.width}:${footprint.height}:${footprint.originX}:${footprint.originY}`;
    const cached = cache.get(key);
    if (cached)
        return cached;
    const extendedSize = size * 3;
    const extended = new Float32Array(extendedSize * extendedSize);
    for (let offsetY = -1; offsetY <= 1; offsetY += 1)
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
            const coverage = logicalTerrainCoverage(recipe, extendedDualMask(mask, offsetX, offsetY), size, variant);
            const originX = (offsetX + 1) * size;
            const originY = (offsetY + 1) * size;
            for (let y = 0; y < size; y += 1)
                for (let x = 0; x < size; x += 1)
                    extended[(originY + y) * extendedSize + originX + x] = coverage[y * size + x];
        }
    const extendedDistance = interiorDistanceField(extended, extendedSize, extendedSize);
    const terrain = new Float32Array(footprint.width * footprint.height);
    const distance = new Float32Array(footprint.width * footprint.height);
    for (let y = 0; y < footprint.height; y += 1)
        for (let x = 0; x < footprint.width; x += 1) {
            const sourceX = size + x - footprint.originX;
            const sourceY = size + y - footprint.originY;
            if (sourceX < 0 || sourceY < 0 || sourceX >= extendedSize || sourceY >= extendedSize)
                continue;
            const sourceIndex = sourceY * extendedSize + sourceX;
            const targetIndex = y * footprint.width + x;
            terrain[targetIndex] = extended[sourceIndex];
            distance[targetIndex] = extendedDistance[sourceIndex];
        }
    const result = { terrain, distance };
    cache.set(key, result);
    return result;
}
function dualContourSamples(recipe, mask, size, variant) {
    const field = buildRecipeDistanceField(recipe, mask, size, variant);
    const boundary = [];
    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            const index = y * size + x;
            if (Math.abs(field.distance[index]) > 1.25)
                continue;
            const nx = field.normalX[index];
            const ny = field.normalY[index];
            if (Math.hypot(nx, ny) < 0.25)
                continue;
            boundary.push({ x, y, nx, ny });
        }
    }
    return boundary;
}
function buildWideDualLayerMask(recipe, layer, mask, size, variant, footprint) {
    const output = new Float32Array(footprint.width * footprint.height);
    if (recipe.topology !== "dual16" || layer.width <= 0.5 || layer.placement !== "inner" || layer.cliffEnabled)
        return output;
    const context = buildDualProjectedContext(recipe, mask, size, variant, footprint);
    const end = layer.width * size;
    for (let y = 0; y < footprint.height; y += 1)
        for (let x = 0; x < footprint.width; x += 1) {
            const index = y * footprint.width + x;
            if (context.terrain[index] < 0.5 || context.distance[index] > end + 0.75)
                continue;
            const normal = distanceNormal(context.distance, footprint.width, footprint.height, x, y);
            const sideAmount = directionFactor(layer.sides, normal.nx, normal.ny);
            const edge = 1 - smoothstep(end - 0.75, end + 0.75, context.distance[index]);
            const inwardProgress = Math.max(0, Math.min(1, context.distance[index] / Math.max(1, end)));
            const fade = 1 - layer.fadeInward * applyFadeCurve(inwardProgress, layer.fadeCurve);
            output[index] = context.terrain[index] * sideAmount * layer.opacity * fade * edge;
        }
    return output;
}
function renderWideDualBorderOverlay(recipe, mask, size, textures, variant, footprint) {
    const output = new Uint8ClampedArray(footprint.width * footprint.height * 4);
    if (recipe.topology !== "dual16")
        return output;
    const layers = enabledLayerStack(recipe).slice(1, -1).filter((layer) => (layer.kind === "band"
        && !layer.cliffEnabled
        && layer.placement === "inner"
        && layer.width > 0.5 + 1e-6));
    if (layers.length === 0)
        return output;
    const boundary = dualContourSamples(recipe, mask, size, variant);
    if (boundary.length === 0)
        return output;
    for (const layer of layers) {
        const start = size * 0.5;
        const end = Math.max(start, layer.width * size);
        for (const sample of boundary) {
            const sideAmount = directionFactor(layer.sides, sample.nx, sample.ny);
            if (sideAmount <= 0)
                continue;
            for (let distance = start; distance <= end + 0.001; distance += 0.75) {
                const globalX = sample.x - sample.nx * distance;
                const globalY = sample.y - sample.ny * distance;
                const targetX = Math.round(footprint.originX + globalX);
                const targetY = Math.round(footprint.originY + globalY);
                const inwardProgress = Math.max(0, Math.min(1, distance / Math.max(1, end)));
                const fade = 1 - layer.fadeInward * applyFadeCurve(inwardProgress, layer.fadeCurve);
                const color = applyArtDirection(sampleLayer(layer, modulo(Math.round(globalX), size), modulo(Math.round(globalY), size), size, sample.nx, sample.ny, recipe, textures, variant), recipe.artDirection);
                const alpha = layer.opacity * sideAmount * fade;
                // A small 3×3 splat closes sub-pixel gaps where normals fan out around
                // concave corners, while retaining a pixel-clean outer silhouette.
                for (let oy = -1; oy <= 1; oy += 1) {
                    for (let ox = -1; ox <= 1; ox += 1) {
                        writeProjectedPixel(output, footprint.width, footprint.height, targetX + ox, targetY + oy, color, alpha);
                    }
                }
            }
        }
    }
    return output;
}
function renderDistanceWideDualBorderOverlay(recipe, mask, size, textures, variant, footprint) {
    const output = new Uint8ClampedArray(footprint.width * footprint.height * 4);
    if (recipe.topology !== "dual16")
        return output;
    const layers = enabledLayerStack(recipe).slice(1, -1).filter((layer) => layer.kind === "band" && !layer.cliffEnabled && layer.placement === "inner" && layer.width > 0.5 + 1e-6);
    if (layers.length === 0)
        return output;
    const context = buildDualProjectedContext(recipe, mask, size, variant, footprint);
    for (const layer of layers) {
        const start = size * 0.5;
        const end = layer.width * size;
        for (let y = 0; y < footprint.height; y += 1)
            for (let x = 0; x < footprint.width; x += 1) {
                const index = y * footprint.width + x;
                const distance = context.distance[index];
                if (context.terrain[index] < 0.5 || distance < start - 1 || distance > end + 1)
                    continue;
                const normal = distanceNormal(context.distance, footprint.width, footprint.height, x, y);
                const sideAmount = directionFactor(layer.sides, normal.nx, normal.ny);
                if (sideAmount <= 0)
                    continue;
                const enters = smoothstep(start - 1, start + 1, distance);
                const exits = 1 - smoothstep(end - 0.75, end + 0.75, distance);
                const inwardProgress = Math.max(0, Math.min(1, distance / Math.max(1, end)));
                const fade = 1 - layer.fadeInward * applyFadeCurve(inwardProgress, layer.fadeCurve);
                const logicalX = x - footprint.originX;
                const logicalY = y - footprint.originY;
                const color = applyArtDirection(sampleLayer(layer, modulo(logicalX, size), modulo(logicalY, size), size, normal.nx, normal.ny, recipe, textures, variant), recipe.artDirection);
                writeProjectedPixel(output, footprint.width, footprint.height, x, y, color, layer.opacity * sideAmount * fade * enters * exits);
            }
    }
    return output;
}
export function cliffWallTextureCoordinates(layer, sourceX, sourceY, step, normalX, normalY, worldTextureOffsetX = 0, worldTextureOffsetY = 0) {
    const worldX = sourceX + worldTextureOffsetX;
    const worldY = sourceY + worldTextureOffsetY;
    return {
        x: worldX * Math.abs(normalY) + worldY * Math.abs(normalX) + layer.cliffTextureOffsetXPx,
        y: Math.max(0, step - 1),
    };
}
function projectedWallSample(source, sourceIndex, layer, progress, sourceX, sourceY, step, size, recipe, textures, variant, normalX, normalY, worldTextureOffsetX, worldTextureOffsetY, channel) {
    // Step zero lies on the terrain boundary and is covered by the logical
    // terrain pixels. The first visible face row/column is step one, so map it
    // back to texture coordinate zero instead of silently skipping the first
    // source row.
    const worldX = sourceX + worldTextureOffsetX;
    const worldY = sourceY + worldTextureOffsetY;
    // The tangent is perpendicular to the contour normal. Absolute weights
    // rotate the texture flow progressively through rounded corners instead of
    // switching abruptly between local X and local Y.
    const wallCoordinates = cliffWallTextureCoordinates(layer, sourceX, sourceY, step, normalX, normalY, worldTextureOffsetX, worldTextureOffsetY);
    const wallX = wallCoordinates.x;
    // Every face samples the source at the same output-pixel scale. A shallower
    // side or rear face reveals fewer source rows; it never squeezes the whole
    // image into the available height.
    const wallY = wallCoordinates.y;
    const uploaded = sampleDirectionalCliffTexture(layer, wallX, wallY, textures, normalX, normalY);
    const alpha = uploaded?.alpha ?? 1;
    if (channel === "normal") {
        // This normal map doubles as the direction field required by a future
        // Godot world-space material: front, sides, rear and corner blends remain
        // recoverable from RG instead of being baked into one cardinal label.
        const nx = -normalX * 0.72;
        const ny = -normalY * 0.72;
        const nz = 0.52;
        const length = Math.hypot(nx, ny, nz) || 1;
        return { color: [(nx / length * 0.5 + 0.5) * 255, (ny / length * 0.5 + 0.5) * 255, (nz / length * 0.5 + 0.5) * 255], alpha };
    }
    if (channel === "height") {
        const value = source[sourceIndex] * (0.88 - progress * 0.62);
        return { color: [value, value, value], alpha };
    }
    if (channel === "ao") {
        const value = 255 * (1 - Math.min(0.86, layer.cliffShadow * (0.42 + progress * 0.48)));
        return { color: [value, value, value], alpha };
    }
    let textureColor = uploaded?.color ?? parseHex(layer.color);
    const detail = sampleUploadedCliffTextureAtKey(layer, cliffTextureKey(layer.id, "detail"), wallX, wallY, textures, 2.4);
    if (!uploaded && !detail)
        return { color: textureColor, alpha: 1 };
    if (detail && layer.cliffDetailDensity > 0 && layer.cliffDetailStrength > 0) {
        const macroPeriod = Math.max(16, layer.cliffPatternSizePx * 3.5);
        const macroPhase = (recipe.shape.seed + layer.seedOffset * 17) * 0.017;
        const signal = 0.5 + 0.24 * Math.sin((worldX / (macroPeriod * 1.7)) * Math.PI * 2 + macroPhase * 1.9)
            + 0.18 * Math.sin((worldY / (macroPeriod * 1.13)) * Math.PI * 2 - macroPhase)
            + 0.08 * Math.sin(((worldX + worldY) / (macroPeriod * 0.83)) * Math.PI * 2);
        const detailMask = smoothstep(1 - layer.cliffDetailDensity, Math.min(1, 1.12 - layer.cliffDetailDensity), signal);
        textureColor = mixColor(textureColor, detail.color, detail.alpha * layer.cliffDetailStrength * detailMask);
    }
    // Imported albedo is color-faithful. Direction belongs in the exported
    // normal map, not in a baked light overlay that changes one face relative
    // to another.
    return { color: textureColor, alpha };
}
function sampleCliffCrown(layer, x, y, distance, normalX, normalY, textures, worldTextureOffsetX, worldTextureOffsetY, channel) {
    if (channel === "normal") {
        const nx = -normalX * 0.18;
        const ny = -normalY * 0.18;
        const nz = 0.97;
        const length = Math.hypot(nx, ny, nz) || 1;
        return { color: [(nx / length * 0.5 + 0.5) * 255, (ny / length * 0.5 + 0.5) * 255, (nz / length * 0.5 + 0.5) * 255], alpha: 1 };
    }
    if (channel === "height")
        return { color: [250, 250, 250], alpha: 1 };
    if (channel === "ao")
        return { color: [238, 238, 238], alpha: 1 };
    const width = Math.max(2, layer.cliffCrownWidthPx);
    const innerWidth = width * 0.82;
    const across = Math.max(0, Math.min(1, (distance + innerWidth) / width));
    const worldX = x + worldTextureOffsetX;
    const worldY = y + worldTextureOffsetY;
    const along = worldX * Math.abs(normalY) + worldY * Math.abs(normalX);
    const crownTexture = textures.get(cliffTextureKey(layer.id, "crown"));
    let color;
    let alpha = 1;
    if (crownTexture) {
        const displayScale = Math.max(0.001, layer.cliffCrownPatternSizePx / Math.max(1, crownTexture.width));
        const tx = Math.floor(modulo(along / displayScale, crownTexture.width));
        const ty = Math.max(0, Math.min(crownTexture.height - 1, Math.round(across * (crownTexture.height - 1))));
        const source = (ty * crownTexture.width + tx) * 4;
        color = applyLayerBrightness([crownTexture.data[source], crownTexture.data[source + 1], crownTexture.data[source + 2]], layer.brightness);
        alpha = crownTexture.data[source + 3] / 255;
    }
    else {
        const derived = sampleDirectionalCliffTexture(layer, worldX, worldY, textures, normalX, normalY);
        color = derived?.color ?? applyLayerBrightness(parseHex(layer.color), layer.brightness);
        alpha = derived?.alpha ?? 1;
    }
    const bevel = 0.92 + Math.sin(across * Math.PI) * 0.2;
    const shade = Math.max(0.75, Math.min(1.28, bevel));
    return { color: [color[0] * shade, color[1] * shade, color[2] * shade], alpha };
}
function renderCliffCrownOverlay(recipe, mask, size, layer, textures, variant, footprint, worldTextureOffset, channel) {
    const overlay = new Uint8ClampedArray(footprint.width * footprint.height * 4);
    if (!layer.cliffCrownEnabled || layer.cliffCrownWidthPx <= 0)
        return overlay;
    const field = buildRecipeDistanceField(recipe, mask, size, variant);
    const width = Math.max(2, layer.cliffCrownWidthPx);
    const innerWidth = width * 0.82;
    const outerWidth = width - innerWidth;
    const edgeSamples = CARDINAL_DIRECTIONS.flatMap((direction) => buildCliffEdgeSamples(recipe, mask, size, field, layer, direction, textures, variant));
    if (edgeSamples.length === 0)
        return overlay;
    // A deformed per-tile SDF can contain harmless saddle contours at Blob
    // junctions. They are fine for the terrain fill but must never become a
    // visible rock ribbon. Seed the crown exclusively from exposed silhouette
    // pixels, so fully surrounded tiles remain empty and assembled maps cannot
    // reveal their logical grid.
    const nearestDistance = new Float32Array(size * size);
    nearestDistance.fill(Number.POSITIVE_INFINITY);
    const nearestNormalX = new Float32Array(size * size);
    const nearestNormalY = new Float32Array(size * size);
    const reach = Math.ceil(Math.max(innerWidth, outerWidth) + 2);
    for (const sample of edgeSamples) {
        const minX = Math.max(0, sample.x - reach);
        const maxX = Math.min(size - 1, sample.x + reach);
        const minY = Math.max(0, sample.y - reach);
        const maxY = Math.min(size - 1, sample.y + reach);
        for (let y = minY; y <= maxY; y += 1)
            for (let x = minX; x <= maxX; x += 1) {
                const distance = Math.hypot(x - sample.x, y - sample.y);
                const index = y * size + x;
                if (distance >= nearestDistance[index])
                    continue;
                nearestDistance[index] = distance;
                nearestNormalX[index] = sample.normalX;
                nearestNormalY[index] = sample.normalY;
            }
    }
    const terrainCoverage = buildTerrainCoverageField(recipe, mask, size, variant);
    for (let y = 0; y < size; y += 1)
        for (let x = 0; x < size; x += 1) {
            const index = y * size + x;
            const unsignedDistance = nearestDistance[index];
            if (!Number.isFinite(unsignedDistance))
                continue;
            const distance = terrainCoverage[index] >= 0.5 ? -unsignedDistance : unsignedDistance;
            if (distance < -innerWidth - 1 || distance > outerWidth + 1)
                continue;
            const enters = smoothstep(-innerWidth - 0.75, -innerWidth + 0.75, distance);
            const exits = 1 - smoothstep(outerWidth - 0.75, outerWidth + 0.75, distance);
            const amount = enters * exits;
            if (amount <= 0.001)
                continue;
            const sample = sampleCliffCrown(layer, x, y, distance, nearestNormalX[index], nearestNormalY[index], textures, worldTextureOffset.x, worldTextureOffset.y, channel);
            writeProjectedPixel(overlay, footprint.width, footprint.height, footprint.originX + x, footprint.originY + y, sample.color, amount * sample.alpha);
        }
    return overlay;
}
function buildCliffEdgeSamples(recipe, mask, size, field, layer, direction, textures, variant = 0) {
    const vector = directionVector(direction);
    const hasLocalDeformation = layer.edgeDeformations.some((deformation) => deformation.amount > 0);
    const terrainCoverage = hasLocalDeformation
        ? Float32Array.from({ length: size * size }, (_, index) => {
            const x = index % size;
            const y = Math.floor(index / size);
            const displaced = field.distance[index] + layerEdgeDisplacement(layer, x, y, size, recipe.shape.seed + layer.seedOffset + variant * 211);
            return 1 - smoothstep(-0.75, 0.75, displaced);
        })
        : buildTerrainCoverageField(recipe, mask, size, variant);
    const coverageAt = (coverage, x, y) => {
        if (x >= 0 && y >= 0 && x < size && y < size) {
            return coverage[y * size + x];
        }
        const clampedX = Math.max(0, Math.min(size - 1, x));
        const clampedY = Math.max(0, Math.min(size - 1, y));
        const boundaryAmount = coverage[clampedY * size + clampedX];
        if (recipe.topology === "dual16")
            return boundaryAmount;
        if (x < 0)
            return hasBit(mask, BIT.W) ? boundaryAmount : 0;
        if (x >= size)
            return hasBit(mask, BIT.E) ? boundaryAmount : 0;
        if (y < 0)
            return hasBit(mask, BIT.N) ? boundaryAmount : 0;
        return hasBit(mask, BIT.S) ? boundaryAmount : 0;
    };
    const inside = (x, y) => coverageAt(terrainCoverage, x, y);
    // Imported replacement artwork can be a sparse wall-top outline. Its alpha
    // determines where the visible face starts, but it cannot define how many
    // terrain contours exist: decorative post endings used to become isolated
    // 48px cliff needles. Start from the semantic Blob contour, then snap each
    // legitimate contour sample to the nearest parallel alpha edge.
    const override = !hasLocalDeformation ? textures.get(`override:${mask}`) : undefined;
    const overridePixels = override ? renderTileWithOverridePixels(recipe, mask, size, textures, variant) : undefined;
    const overrideCoverage = overridePixels
        ? Float32Array.from({ length: size * size }, (_, index) => overridePixels[index * 4 + 3] / 255)
        : undefined;
    if (overrideCoverage && recipe.topology === "blob47") {
        const neighborBit = direction === "N" ? BIT.N : direction === "E" ? BIT.E : direction === "S" ? BIT.S : BIT.W;
        if (!layer.cliffAlphaEdgesOnly && hasBit(mask, neighborBit))
            return [];
        const samples = [];
        const authoredCoverageAt = (x, y) => {
            if (x < 0 || y < 0 || x >= size || y >= size) {
                // An interior material follows the authored alpha contour itself.
                // Extending alpha through a semantic Blob neighbour hides edge ends
                // that are visibly present in transparent wall-top artwork.
                return layer.cliffAlphaEdgesOnly ? 0 : coverageAt(overrideCoverage, x, y);
            }
            return overrideCoverage[y * size + x];
        };
        const tangentCount = size;
        for (let tangent = 0; tangent < tangentCount; tangent += 1) {
            let visible;
            for (let axis = 0; axis < size; axis += 1) {
                const x = vector.x === 0 ? tangent : axis;
                const y = vector.y === 0 ? tangent : axis;
                const amount = authoredCoverageAt(x, y);
                const forward = authoredCoverageAt(x + vector.x, y + vector.y);
                const drop = amount - forward;
                if (amount <= 0.02 || drop <= 0.02)
                    continue;
                if (!visible
                    || (direction === "S" && y > visible.y)
                    || (direction === "N" && y < visible.y)
                    || (direction === "E" && x > visible.x)
                    || (direction === "W" && x < visible.x))
                    visible = { x, y, amount, drop };
            }
            if (!visible)
                continue;
            samples.push({
                x: visible.x,
                y: visible.y,
                amount: Math.min(1, Math.max(visible.amount, visible.drop * 2)),
                sourceIndex: (visible.y * size + visible.x) * 4,
                normalX: vector.x,
                normalY: vector.y,
            });
        }
        if (!layer.cliffAlphaEdgesOnly)
            return samples;
        // Transparent wall-top atlases can contain decorative vertical posts.
        // Interior walls intentionally follow the lowest/highest visible alpha
        // edge, but only when it forms a real horizontal/vertical run. This keeps
        // isolated post endings from turning back into long cliff needles.
        const minimumRun = Math.max(3, Math.round(size / 16));
        const runs = [];
        for (const sample of samples) {
            const tangent = vector.x === 0 ? sample.x : sample.y;
            const edge = vector.x === 0 ? sample.y : sample.x;
            const current = runs.at(-1);
            const previous = current?.at(-1);
            const previousTangent = previous ? (vector.x === 0 ? previous.x : previous.y) : -Infinity;
            const previousEdge = previous ? (vector.x === 0 ? previous.y : previous.x) : edge;
            if (!current || tangent !== previousTangent + 1 || Math.abs(edge - previousEdge) > 2)
                runs.push([sample]);
            else
                current.push(sample);
        }
        return runs.filter((run) => {
            if (run.length >= minimumRun)
                return true;
            if (run.length < 2)
                return false;
            const tangents = run.map((sample) => vector.x === 0 ? sample.x : sample.y);
            return Math.min(...tangents) <= 1 || Math.max(...tangents) >= size - 2;
        }).flat();
    }
    const snapToOverrideEdge = (semanticX, semanticY) => {
        if (!overrideCoverage)
            return { x: semanticX, y: semanticY, amount: inside(semanticX, semanticY), drop: inside(semanticX, semanticY) - inside(semanticX + vector.x, semanticY + vector.y) };
        let nearest;
        for (let axis = 0; axis < size; axis += 1) {
            const x = vector.x === 0 ? semanticX : axis;
            const y = vector.y === 0 ? semanticY : axis;
            const amount = coverageAt(overrideCoverage, x, y);
            const forward = coverageAt(overrideCoverage, x + vector.x, y + vector.y);
            const drop = amount - forward;
            if (amount <= 0.02 || drop <= 0.02)
                continue;
            const distance = Math.abs(x - semanticX) + Math.abs(y - semanticY);
            if (!nearest || distance < nearest.distance)
                nearest = { x, y, amount, drop, distance };
        }
        return nearest;
    };
    const samples = [];
    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            const amount = inside(x, y);
            const forward = inside(x + vector.x, y + vector.y);
            const drop = amount - forward;
            if (amount <= 0.02 || drop <= 0.02)
                continue;
            const source = snapToOverrideEdge(x, y);
            if (!source)
                continue;
            // The imported alpha places the authored edge, but the validated Blob
            // edge supplies its orientation. Alpha gradients at tile boundaries are
            // ambiguous because neighbor continuity changes the outside sample and
            // can turn a vertical post ending into a false south-facing normal.
            const gradientX = overrideCoverage
                ? vector.x
                : inside(x - 1, y) - inside(x + 1, y);
            const gradientY = overrideCoverage
                ? vector.y
                : inside(x, y - 1) - inside(x, y + 1);
            const gradientLength = Math.hypot(gradientX, gradientY);
            const fieldIndex = y * size + x;
            const fallbackX = Number.isFinite(field.normalX[fieldIndex]) ? field.normalX[fieldIndex] : vector.x;
            const fallbackY = Number.isFinite(field.normalY[fieldIndex]) ? field.normalY[fieldIndex] : vector.y;
            const fallbackLength = Math.hypot(fallbackX, fallbackY) || 1;
            samples.push({
                x: source.x,
                y: source.y,
                amount: Math.min(1, Math.max(source.amount, source.drop * 2)),
                sourceIndex: (source.y * size + source.x) * 4,
                normalX: gradientLength > 0.05 ? gradientX / gradientLength : fallbackX / fallbackLength,
                normalY: gradientLength > 0.05 ? gradientY / gradientLength : fallbackY / fallbackLength,
            });
        }
    }
    return samples;
}
function composeProjectedTile(recipe, mask, size, base, variant, textures, channel, projectWalls = true, includeWideOverlay = true, baseDefinesCoverage = false, worldTextureOffset = { x: 0, y: 0 }) {
    const footprint = projectionFootprint(recipe, size);
    const output = new Uint8ClampedArray(footprint.width * footprint.height * 4);
    const deferredFlatShadows = new Uint8ClampedArray(footprint.width * footprint.height * 4);
    if (projectWalls && !recipe.shape.transparentBackground) {
        if (channel) {
            const background = channel === "normal" ? [128, 128, 255] : channel === "ao" ? [255, 255, 255] : [0, 0, 0];
            for (let index = 0; index < footprint.width * footprint.height; index += 1) {
                const target = index * 4;
                output[target] = background[0];
                output[target + 1] = background[1];
                output[target + 2] = background[2];
                output[target + 3] = 255;
            }
        }
        else {
            const outside = renderOutsidePixels(recipe, size, textures);
            for (let y = 0; y < footprint.height; y += 1) {
                for (let x = 0; x < footprint.width; x += 1) {
                    const source = (modulo(y - footprint.originY, size) * size + modulo(x - footprint.originX, size)) * 4;
                    const target = (y * footprint.width + x) * 4;
                    output[target] = outside[source];
                    output[target + 1] = outside[source + 1];
                    output[target + 2] = outside[source + 2];
                    output[target + 3] = outside[source + 3];
                }
            }
        }
    }
    const projectedLayers = projectWalls
        ? recipe.layers.filter((layer) => layer.enabled && layer.kind === "band" && layer.cliffEnabled)
        : [];
    if (projectWalls && (!channel || channel === "ao")) {
        const stack = enabledLayerStack(recipe);
        const field = buildRecipeDistanceField(recipe, mask, size, variant);
        const inside = stack[0];
        const outside = stack[stack.length - 1];
        const baseFade = Math.max(0.5, ((inside.feather + outside.feather) / 2) * size);
        const flatCasters = stack.filter((layer) => layer.shadowEnabled && layer.shadowOpacity > 0 && layer.kind !== "outside" && !layer.cliffEnabled && (!channel || layer.shadowAffectsAo));
        for (const layer of flatCasters) {
            const coverage = layer.kind === "inside"
                ? Float32Array.from(field.distance, (distance) => 1 - smoothstep(-baseFade, baseFade, distance))
                : buildBandCoverageMap(recipe, layer, mask, size, variant);
            const angle = layer.shadowAngle * Math.PI / 180;
            // A Dual Grid border wider than half a tile lives outside the logical
            // tile rectangle. Its shadow must use the same 3x3 distance context as
            // the visible overlay, otherwise the caster stops at 50% and leaves a
            // detached halo in previews and exported atlas regions.
            const placedCoverage = recipe.topology === "dual16"
                && layer.kind === "band"
                && layer.placement === "inner"
                && layer.width > 0.5
                ? buildWideDualLayerMask(recipe, layer, mask, size, variant, footprint)
                : placeLogicalMask(coverage, size, footprint);
            const shadowMask = offsetAndBlurMask(placedCoverage, footprint.width, footprint.height, Math.cos(angle) * layer.shadowDistance * size, Math.sin(angle) * layer.shadowDistance * size, layer.shadowBlur * size);
            const color = channel === "ao" ? [0, 0, 0] : parseHex(layer.shadowColor);
            for (let shadowIndex = 0; shadowIndex < shadowMask.length; shadowIndex += 1) {
                const amount = shadowMask[shadowIndex] * (1 - placedCoverage[shadowIndex]);
                if (amount <= 0)
                    continue;
                writeProjectedPixel(deferredFlatShadows, footprint.width, footprint.height, shadowIndex % footprint.width, Math.floor(shadowIndex / footprint.width), color, layer.shadowOpacity * amount);
            }
        }
    }
    for (const layer of projectedLayers) {
        const field = buildRecipeDistanceField(recipe, mask, size, variant);
        const vector = directionVector(layer.cliffDirection);
        const edgeDirections = layer.cliffDirectional ? CARDINAL_DIRECTIONS : [layer.cliffDirection];
        const edgeSamples = edgeDirections.flatMap((direction) => buildCliffEdgeSamples(recipe, mask, size, field, layer, direction, textures, variant));
        const wallMask = new Float32Array(footprint.width * footprint.height);
        for (const sample of edgeSamples) {
            const edgeDepth = cliffDepthForNormal(layer, sample.normalX, sample.normalY, size);
            const projectedVisibility = cliffProjectedVisibility(layer, sample.normalX, sample.normalY, edgeDepth, size);
            const projectedAmount = layer.cliffFaceOnly
                ? (projectedVisibility >= 0.05 ? 1 : 0)
                : sample.amount * projectedVisibility;
            if (projectedAmount <= 0.001)
                continue;
            for (let step = edgeDepth; step >= 0; step -= 1) {
                const progress = Math.max(0, Math.min(1, step / (edgeDepth || 1)));
                const baseX = Math.round(footprint.originX + sample.x + vector.x * step + layer.cliffOffsetX * size * progress + vector.px * layer.cliffShear * step);
                const baseY = Math.round(footprint.originY + sample.y + vector.y * step + layer.cliffOffsetY * size * progress + vector.py * layer.cliffShear * step);
                if (baseX < 0 || baseY < 0 || baseX >= footprint.width || baseY >= footprint.height)
                    continue;
                const index = baseY * footprint.width + baseX;
                wallMask[index] = Math.max(wallMask[index], projectedAmount);
            }
        }
        const drawCastShadow = layer.shadowEnabled && layer.shadowOpacity > 0 && (!channel || (channel === "ao" && layer.shadowAffectsAo));
        if (drawCastShadow) {
            const angle = layer.shadowAngle * Math.PI / 180;
            const shadowX = Math.cos(angle) * layer.shadowDistance * size;
            const shadowY = Math.sin(angle) * layer.shadowDistance * size;
            const radius = layer.shadowBlur * size;
            const color = channel === "ao" ? [0, 0, 0] : parseHex(layer.shadowColor);
            const shadowCaster = layer.cliffDirection === "S"
                ? stabilizeDownwardCliffShadowCaster(wallMask, footprint.width, footprint.height, size)
                : wallMask;
            const shadowMask = offsetAndBlurMask(shadowCaster, footprint.width, footprint.height, shadowX, shadowY, radius, 0.85);
            for (let shadowIndex = 0; shadowIndex < shadowMask.length; shadowIndex += 1) {
                if (shadowMask[shadowIndex] <= 0)
                    continue;
                writeProjectedPixel(output, footprint.width, footprint.height, shadowIndex % footprint.width, Math.floor(shadowIndex / footprint.width), color, layer.shadowOpacity * shadowMask[shadowIndex]);
            }
        }
        for (const sample of edgeSamples) {
            const edgeDepth = cliffDepthForNormal(layer, sample.normalX, sample.normalY, size);
            const projectedVisibility = cliffProjectedVisibility(layer, sample.normalX, sample.normalY, edgeDepth, size);
            const projectedAmount = layer.cliffFaceOnly
                ? (projectedVisibility >= 0.05 ? 1 : 0)
                : sample.amount * projectedVisibility;
            if (projectedAmount <= 0.001)
                continue;
            const overlap = 0;
            for (let step = edgeDepth; step >= -overlap; step -= 1) {
                const progress = Math.max(0, Math.min(1, (step + overlap) / (edgeDepth + overlap || 1)));
                const shiftX = vector.x * step + layer.cliffOffsetX * size * progress + vector.px * layer.cliffShear * step;
                const shiftY = vector.y * step + layer.cliffOffsetY * size * progress + vector.py * layer.cliffShear * step;
                const targetX = footprint.originX + sample.x + Math.round(shiftX);
                const targetY = footprint.originY + sample.y + Math.round(shiftY);
                const wall = projectedWallSample(base, sample.sourceIndex, layer, progress, sample.x, sample.y, step + overlap, size, recipe, textures, variant, sample.normalX, sample.normalY, worldTextureOffset.x, worldTextureOffset.y, channel);
                writeProjectedPixel(output, footprint.width, footprint.height, targetX, targetY, wall.color, projectedAmount * wall.alpha);
            }
        }
    }
    const terrainCoverage = buildTerrainCoverageField(recipe, mask, size, variant);
    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            const sourceIndex = (y * size + x) * 4;
            const baseAlpha = base[sourceIndex + 3] / 255;
            const sourceAlpha = baseDefinesCoverage ? baseAlpha : Math.min(baseAlpha, terrainCoverage[y * size + x]);
            writeProjectedPixel(output, footprint.width, footprint.height, footprint.originX + x, footprint.originY + y, [base[sourceIndex], base[sourceIndex + 1], base[sourceIndex + 2]], sourceAlpha);
        }
    }
    if (projectWalls && (!channel || channel === "ao")) {
        for (let index = 0; index < deferredFlatShadows.length; index += 4) {
            const alpha = deferredFlatShadows[index + 3] / 255;
            if (alpha <= 0)
                continue;
            const pixel = index / 4;
            writeProjectedPixel(output, footprint.width, footprint.height, pixel % footprint.width, Math.floor(pixel / footprint.width), [deferredFlatShadows[index], deferredFlatShadows[index + 1], deferredFlatShadows[index + 2]], alpha);
        }
    }
    if (includeWideOverlay && !channel) {
        const overlay = renderDistanceWideDualBorderOverlay(recipe, mask, size, textures, variant, footprint);
        for (let index = 0; index < overlay.length; index += 4) {
            const alpha = overlay[index + 3] / 255;
            if (alpha <= 0)
                continue;
            const pixel = index / 4;
            writeProjectedPixel(output, footprint.width, footprint.height, pixel % footprint.width, Math.floor(pixel / footprint.width), [overlay[index], overlay[index + 1], overlay[index + 2]], alpha);
        }
    }
    if (projectWalls) {
        for (const layer of projectedLayers) {
            const crown = renderCliffCrownOverlay(recipe, mask, size, layer, textures, variant, footprint, worldTextureOffset, channel);
            for (let index = 0; index < crown.length; index += 4) {
                const alpha = crown[index + 3] / 255;
                if (alpha <= 0)
                    continue;
                const pixel = index / 4;
                writeProjectedPixel(output, footprint.width, footprint.height, pixel % footprint.width, Math.floor(pixel / footprint.width), [crown[index], crown[index + 1], crown[index + 2]], alpha);
            }
        }
    }
    return { pixels: output, footprint };
}
export function renderProjectedTilePixels(recipe, mask, size, textures = new Map(), variant = 0, silhouetteOnly = false, includeWideOverlay = true, worldTextureOffset = { x: 0, y: 0 }) {
    let textureCache = projectedTileCache.get(recipe);
    if (!textureCache) {
        textureCache = new WeakMap();
        projectedTileCache.set(recipe, textureCache);
    }
    let recipeCache = textureCache.get(textures);
    if (!recipeCache) {
        recipeCache = new Map();
        textureCache.set(textures, recipeCache);
    }
    const cacheKey = `${mask}:${size}:${variant}:${silhouetteOnly}:${includeWideOverlay}:${worldTextureOffset.x}:${worldTextureOffset.y}`;
    const cached = recipeCache.get(cacheKey);
    if (cached)
        return cached;
    if (isCutoutOutput(recipe)) {
        const result = { pixels: renderTilePixels(recipe, mask, size, textures, variant, silhouetteOnly), footprint: projectionFootprint(recipe, size) };
        recipeCache.set(cacheKey, result);
        return result;
    }
    const override = silhouetteOnly ? undefined : textures.get(`override:${mask}`);
    const base = override ? renderTileWithOverridePixels(recipe, mask, size, textures, variant) : renderTilePixels(recipe, mask, size, textures, variant, silhouetteOnly);
    const result = silhouetteOnly
        ? composeProjectedTile(recipe, mask, size, base, variant, textures, undefined, false, includeWideOverlay)
        : composeProjectedTile(recipe, mask, size, base, variant, textures, undefined, true, includeWideOverlay, Boolean(override), worldTextureOffset);
    recipeCache.set(cacheKey, result);
    return result;
}
function renderProjectedCliffOnlyPixels(recipe, mask, size, textures, variant, worldTextureOffset) {
    const override = textures.get(`override:${mask}`);
    const base = override
        ? renderTileWithOverridePixels(recipe, mask, size, textures, variant)
        : renderTilePixels(recipe, mask, size, textures, variant, false);
    const transparentBase = base.slice();
    for (let index = 3; index < transparentBase.length; index += 4)
        transparentBase[index] = 0;
    return composeProjectedTile(recipe, mask, size, transparentBase, variant, textures, undefined, true, false, Boolean(override), worldTextureOffset);
}
/**
 * Composes a complete sandbox/map before applying cast shadows. Tile-local
 * shadows cannot be source-over composited safely: their overlapping blur
 * fields become darker and reveal rectangular tile footprints. This renderer
 * unions every caster into one map-sized mask, blurs it once, then draws all
 * terrain and cliff pixels above that continuous shadow.
 */
export function renderProjectedMapPixels(recipe, cells, gridWidth, gridHeight, size, textures = new Map(), variant = 0, silhouetteOnly = false, options = {}) {
    const footprint = projectionFootprint(recipe, size);
    const width = gridWidth * size + footprint.margins.left + footprint.margins.right;
    const height = gridHeight * size + footprint.margins.top + footprint.margins.bottom;
    const output = new Uint8ClampedArray(width * height * 4);
    const deferredExternalShadows = new Uint8ClampedArray(width * height * 4);
    if (isCutoutOutput(recipe)) {
        if (recipe.topology === "blob47" && recipe.shape.outputMode === "cutout-outside") {
            const fill = renderCutoutFillTilePixels(recipe, size, textures, variant, "albedo", silhouetteOnly);
            for (let cellY = 0; cellY < gridHeight; cellY += 1)
                for (let cellX = 0; cellX < gridWidth; cellX += 1) {
                    for (let y = 0; y < size; y += 1) {
                        const sourceStart = y * size * 4;
                        const targetStart = ((cellY * size + y) * width + cellX * size) * 4;
                        output.set(fill.subarray(sourceStart, sourceStart + size * 4), targetStart);
                    }
                }
        }
        for (const cell of cells) {
            const rendered = renderProjectedTilePixels(recipe, cell.mask, size, textures, variant, silhouetteOnly, false);
            for (let y = 0; y < size; y += 1) {
                const targetY = cell.y * size + y;
                if (targetY < 0 || targetY >= height)
                    continue;
                const sourceStart = y * size * 4;
                const targetStart = (targetY * width + cell.x * size) * 4;
                if (cell.x >= 0 && cell.x * size + size <= width) {
                    output.set(rendered.pixels.subarray(sourceStart, sourceStart + size * 4), targetStart);
                }
                else {
                    for (let x = 0; x < size; x += 1) {
                        const targetX = cell.x * size + x;
                        if (targetX < 0 || targetX >= width)
                            continue;
                        output.set(rendered.pixels.subarray(sourceStart + x * 4, sourceStart + x * 4 + 4), (targetY * width + targetX) * 4);
                    }
                }
            }
        }
        return { pixels: output, width, height, footprint };
    }
    const transparentRecipe = recipe.shape.transparentBackground
        ? recipe
        : { ...recipe, shape: { ...recipe.shape, transparentBackground: true } };
    const shadowlessRecipe = {
        ...transparentRecipe,
        layers: transparentRecipe.layers.map((layer) => layer.shadowEnabled
            ? { ...layer, shadowEnabled: false }
            : layer),
    };
    const interiorVariant = options.wallMaterials?.size
        ? createInteriorCliffVariant(shadowlessRecipe, textures)
        : undefined;
    const terrainMask = new Float32Array(width * height);
    if (!silhouetteOnly)
        for (const cell of cells) {
            const coverage = logicalTerrainCoverage(recipe, cell.mask, size, variant);
            for (let y = 0; y < size; y += 1) {
                const targetY = footprint.originY + cell.y * size + y;
                if (targetY < 0 || targetY >= height)
                    continue;
                for (let x = 0; x < size; x += 1) {
                    const targetX = footprint.originX + cell.x * size + x;
                    if (targetX < 0 || targetX >= width)
                        continue;
                    const target = targetY * width + targetX;
                    terrainMask[target] = Math.max(terrainMask[target], coverage[y * size + x]);
                }
            }
        }
    const wideDualLayers = recipe.topology === "dual16"
        ? enabledLayerStack(recipe).slice(1, -1).filter((layer) => layer.kind === "band" && !layer.cliffEnabled && layer.placement === "inner" && layer.width > 0.5 + 1e-6)
        : [];
    const mapInteriorDistance = wideDualLayers.length > 0 ? interiorDistanceField(terrainMask, width, height) : undefined;
    if (!silhouetteOnly) {
        const stack = enabledLayerStack(recipe);
        const inside = stack[0];
        const outside = stack[stack.length - 1];
        const baseFade = Math.max(0.5, ((inside.feather + outside.feather) / 2) * size);
        // The material stack intentionally excludes projected cliff-face layers,
        // but those layers still cast shadows in the composed map/preview. Build
        // the caster list from the recipe itself so tile exports and the sandbox
        // use the same shadow sources.
        const casters = recipe.layers.filter((layer) => layer.enabled && layer.shadowEnabled && layer.shadowOpacity > 0 && layer.kind !== "outside");
        for (const layer of casters) {
            const casterMask = new Float32Array(width * height);
            if (layer.cliffEnabled) {
                const vector = directionVector(layer.cliffDirection);
                const edgeDirections = layer.cliffDirectional ? CARDINAL_DIRECTIONS : [layer.cliffDirection];
                for (const cell of cells) {
                    const field = buildRecipeDistanceField(recipe, cell.mask, size, variant);
                    const edgeSamples = edgeDirections.flatMap((direction) => buildCliffEdgeSamples(recipe, cell.mask, size, field, layer, direction, textures, variant));
                    for (const sample of edgeSamples) {
                        const edgeDepth = cliffDepthForNormal(layer, sample.normalX, sample.normalY, size);
                        for (let step = edgeDepth; step >= 0; step -= 1) {
                            const progress = Math.max(0, Math.min(1, step / (edgeDepth || 1)));
                            const x = Math.round(footprint.originX + cell.x * size + sample.x + vector.x * step + layer.cliffOffsetX * size * progress + vector.px * layer.cliffShear * step);
                            const y = Math.round(footprint.originY + cell.y * size + sample.y + vector.y * step + layer.cliffOffsetY * size * progress + vector.py * layer.cliffShear * step);
                            if (x < 0 || y < 0 || x >= width || y >= height)
                                continue;
                            const index = y * width + x;
                            casterMask[index] = Math.max(casterMask[index], layer.cliffFaceOnly ? 1 : sample.amount);
                        }
                    }
                }
            }
            else {
                for (const cell of cells) {
                    const field = buildRecipeDistanceField(recipe, cell.mask, size, variant);
                    const coverage = layer.kind === "inside"
                        ? Float32Array.from(field.distance, (distance) => 1 - smoothstep(-baseFade, baseFade, distance))
                        : buildBandCoverageMap(recipe, layer, cell.mask, size, variant);
                    for (let y = 0; y < size; y += 1) {
                        const targetY = footprint.originY + cell.y * size + y;
                        if (targetY < 0 || targetY >= height)
                            continue;
                        for (let x = 0; x < size; x += 1) {
                            const targetX = footprint.originX + cell.x * size + x;
                            if (targetX < 0 || targetX >= width)
                                continue;
                            const target = targetY * width + targetX;
                            casterMask[target] = Math.max(casterMask[target], coverage[y * size + x]);
                        }
                    }
                }
            }
            if (mapInteriorDistance && layer.kind === "band" && layer.placement === "inner" && layer.width > 0.5) {
                const end = layer.width * size;
                for (let y = 0; y < height; y += 1)
                    for (let x = 0; x < width; x += 1) {
                        const index = y * width + x;
                        if (terrainMask[index] < 0.5 || mapInteriorDistance[index] > end + 0.75)
                            continue;
                        const normal = distanceNormal(mapInteriorDistance, width, height, x, y);
                        const sideAmount = directionFactor(layer.sides, normal.nx, normal.ny);
                        const edge = 1 - smoothstep(end - 0.75, end + 0.75, mapInteriorDistance[index]);
                        const inwardProgress = Math.max(0, Math.min(1, mapInteriorDistance[index] / Math.max(1, end)));
                        const fade = 1 - layer.fadeInward * applyFadeCurve(inwardProgress, layer.fadeCurve);
                        casterMask[index] = Math.max(casterMask[index], terrainMask[index] * sideAmount * layer.opacity * fade * edge);
                    }
            }
            if (layer.shadowEnabled && layer.shadowOpacity > 0) {
                const angle = layer.shadowAngle * Math.PI / 180;
                const shadowCaster = layer.cliffEnabled && layer.cliffDirection === "S"
                    ? stabilizeDownwardCliffShadowCaster(casterMask, width, height, size)
                    : casterMask;
                const shadowMask = offsetAndBlurMask(shadowCaster, width, height, Math.cos(angle) * layer.shadowDistance * size, Math.sin(angle) * layer.shadowDistance * size, layer.shadowBlur * size, layer.cliffEnabled ? 0.85 : 0.5);
                const color = parseHex(layer.shadowColor);
                for (let index = 0; index < shadowMask.length; index += 1) {
                    // A cliff shadow belongs below/outside the terrain. The global map
                    // pass is composited after all tiles, so without this receiver mask
                    // its blur leaks back over the grass as dark vertical fringes.
                    const receiver = (1 - casterMask[index]) * (layer.cliffEnabled ? 1 - terrainMask[index] : 1);
                    const amount = shadowMask[index] * receiver;
                    if (amount <= 0)
                        continue;
                    writeProjectedPixel(deferredExternalShadows, width, height, index % width, Math.floor(index / width), color, layer.shadowOpacity * amount);
                }
            }
        }
    }
    const uploadedCliff = shadowlessRecipe.layers.find((layer) => layer.enabled && layer.cliffEnabled && (textures.has(cliffTextureKey(layer.id, "front"))
        || textures.has(cliffTextureKey(layer.id, "crown"))
        || textures.has(cliffTextureKey(layer.id, "side"))
        || textures.has(cliffTextureKey(layer.id, "rear"))
        || textures.has(cliffTextureKey(layer.id, "detail"))));
    const greatestCommonDivisor = (a, b) => b === 0 ? a : greatestCommonDivisor(b, a % b);
    const wallPeriod = uploadedCliff ? Math.max(1, Math.round(uploadedCliff.cliffPatternSizePx)) : 0;
    const crownPeriod = uploadedCliff?.cliffCrownEnabled ? Math.max(1, Math.round(uploadedCliff.cliffCrownPatternSizePx)) : 0;
    const motifPeriod = wallPeriod > 0 && crownPeriod > 0
        ? Math.min(32768, Math.abs(wallPeriod * crownPeriod) / greatestCommonDivisor(wallPeriod, crownPeriod))
        : wallPeriod || crownPeriod;
    const authoredSurfaceMask = interiorVariant ? new Float32Array(width * height) : undefined;
    if (authoredSurfaceMask)
        for (const cell of [...cells, ...(options.wallSurfaceOccluders ?? [])]) {
            const override = textures.get(`override:${cell.mask}`);
            const base = override
                ? renderTileWithOverridePixels(shadowlessRecipe, cell.mask, size, textures, variant)
                : renderTilePixels(shadowlessRecipe, cell.mask, size, textures, variant, false);
            for (let y = 0; y < size; y += 1)
                for (let x = 0; x < size; x += 1) {
                    const targetX = footprint.originX + cell.x * size + x;
                    const targetY = footprint.originY + cell.y * size + y;
                    if (targetX < 0 || targetY < 0 || targetX >= width || targetY >= height)
                        continue;
                    const target = targetY * width + targetX;
                    authoredSurfaceMask[target] = Math.max(authoredSurfaceMask[target], base[(y * size + x) * 4 + 3] / 255);
                }
        }
    for (const cell of cells) {
        const textureCellX = cell.x - (options.textureOriginCell?.x ?? 0);
        const textureCellY = cell.y - (options.textureOriginCell?.y ?? 0);
        const worldTextureOffset = motifPeriod > 0
            ? { x: modulo(textureCellX * size, motifPeriod), y: modulo(textureCellY * size, motifPeriod) }
            : { x: 0, y: 0 };
        const useInterior = options.wallMaterials?.get(`${cell.x},${cell.y}`) === "inner" && interiorVariant;
        const rendered = renderProjectedTilePixels(useInterior ? interiorVariant.recipe : shadowlessRecipe, cell.mask, size, useInterior ? interiorVariant.textures : textures, variant, silhouetteOnly, false, worldTextureOffset);
        for (let y = 0; y < rendered.footprint.height; y += 1) {
            const targetY = footprint.originY + cell.y * size + y - rendered.footprint.originY;
            if (targetY < 0 || targetY >= height)
                continue;
            for (let x = 0; x < rendered.footprint.width; x += 1) {
                const source = (y * rendered.footprint.width + x) * 4;
                const alpha = rendered.pixels[source + 3] / 255;
                if (alpha <= 0)
                    continue;
                const targetX = footprint.originX + cell.x * size + x - rendered.footprint.originX;
                writeProjectedPixel(output, width, height, targetX, targetY, [rendered.pixels[source], rendered.pixels[source + 1], rendered.pixels[source + 2]], alpha);
            }
        }
    }
    // Tile-local composition correctly keeps each wall face behind its own
    // wall-top, but a neighbouring Blob tile used to paint its top over that
    // face afterwards. Replay interior faces once against the assembled alpha
    // union: exposed authored edges remain continuous across logical tile
    // boundaries, while opaque wall-top pixels still stay in front.
    if (interiorVariant && authoredSurfaceMask)
        for (const cell of cells) {
            if (options.wallMaterials?.get(`${cell.x},${cell.y}`) !== "inner")
                continue;
            const textureCellX = cell.x - (options.textureOriginCell?.x ?? 0);
            const textureCellY = cell.y - (options.textureOriginCell?.y ?? 0);
            const worldTextureOffset = motifPeriod > 0
                ? { x: modulo(textureCellX * size, motifPeriod), y: modulo(textureCellY * size, motifPeriod) }
                : { x: 0, y: 0 };
            const overlay = renderProjectedCliffOnlyPixels(interiorVariant.recipe, cell.mask, size, interiorVariant.textures, variant, worldTextureOffset);
            const interiorLayer = interiorVariant.recipe.layers.find((layer) => layer.enabled && layer.cliffEnabled);
            const vector = directionVector(interiorLayer?.cliffDirection ?? "S");
            const vertical = vector.x === 0;
            const tangentCount = vertical ? overlay.footprint.width : overlay.footprint.height;
            const axisCount = vertical ? overlay.footprint.height : overlay.footprint.width;
            for (let tangent = 0; tangent < tangentCount; tangent += 1) {
                const orderedAxis = Array.from({ length: axisCount }, (_, index) => vector.x + vector.y > 0 ? index : axisCount - 1 - index);
                let segment = [];
                const flush = () => {
                    if (segment.length === 0)
                        return;
                    let shift = 0;
                    for (let ordinal = 0; ordinal < segment.length; ordinal += 1) {
                        const axis = segment[ordinal];
                        const x = vertical ? tangent : axis;
                        const y = vertical ? axis : tangent;
                        const targetX = footprint.originX + cell.x * size + x - overlay.footprint.originX;
                        const targetY = footprint.originY + cell.y * size + y - overlay.footprint.originY;
                        if (targetX < 0 || targetY < 0 || targetX >= width || targetY >= height)
                            continue;
                        // The first wall pixel sits on the authored edge itself and remains
                        // behind the wall-top. Align that edge with the last covered source
                        // pixel; advancing one extra pixel shifts the texture phase at joins.
                        if (authoredSurfaceMask[targetY * width + targetX] > 0.02)
                            shift = ordinal;
                    }
                    for (const axis of segment) {
                        const x = vertical ? tangent : axis;
                        const y = vertical ? axis : tangent;
                        const source = (y * overlay.footprint.width + x) * 4;
                        const alpha = overlay.pixels[source + 3] / 255;
                        const targetX = footprint.originX + cell.x * size + x - overlay.footprint.originX + vector.x * shift;
                        const targetY = footprint.originY + cell.y * size + y - overlay.footprint.originY + vector.y * shift;
                        if (targetX < 0 || targetY < 0 || targetX >= width || targetY >= height)
                            continue;
                        const receiver = 1 - authoredSurfaceMask[targetY * width + targetX];
                        if (receiver <= 0)
                            continue;
                        writeProjectedPixel(output, width, height, targetX, targetY, [overlay.pixels[source], overlay.pixels[source + 1], overlay.pixels[source + 2]], alpha * receiver);
                    }
                    segment = [];
                };
                for (const axis of orderedAxis) {
                    const x = vertical ? tangent : axis;
                    const y = vertical ? axis : tangent;
                    const alpha = overlay.pixels[(y * overlay.footprint.width + x) * 4 + 3];
                    if (alpha > 0)
                        segment.push(axis);
                    else
                        flush();
                }
                flush();
            }
        }
    // Flat materials and cliff faces cast onto the already rendered receivers.
    // Drawing this buffer before the terrain made every shadow disappear below
    // opaque surface pixels. The caster silhouette itself was removed above, so
    // this pass shades only its surroundings and the caster stays crisp.
    if (!silhouetteOnly) {
        for (let index = 0; index < deferredExternalShadows.length; index += 4) {
            const alpha = deferredExternalShadows[index + 3] / 255;
            if (alpha <= 0)
                continue;
            const pixel = index / 4;
            writeProjectedPixel(output, width, height, pixel % width, Math.floor(pixel / width), [deferredExternalShadows[index], deferredExternalShadows[index + 1], deferredExternalShadows[index + 2]], alpha);
        }
    }
    // Wide Dual borders are projected after every logical tile so a neighbour's
    // base texture cannot cover the 50–100% continuation. This is the same
    // ordering used by the oversized exported atlas regions.
    if (!silhouetteOnly && mapInteriorDistance) {
        for (const layer of wideDualLayers) {
            const start = size * 0.5;
            const end = layer.width * size;
            for (let y = 0; y < height; y += 1)
                for (let x = 0; x < width; x += 1) {
                    const index = y * width + x;
                    const distance = mapInteriorDistance[index];
                    if (terrainMask[index] < 0.5 || distance < start - 1 || distance > end + 1)
                        continue;
                    const normal = distanceNormal(mapInteriorDistance, width, height, x, y);
                    const sideAmount = directionFactor(layer.sides, normal.nx, normal.ny);
                    if (sideAmount <= 0)
                        continue;
                    const enters = smoothstep(start - 1, start + 1, distance);
                    const exits = 1 - smoothstep(end - 0.75, end + 0.75, distance);
                    const inwardProgress = Math.max(0, Math.min(1, distance / Math.max(1, end)));
                    const fade = 1 - layer.fadeInward * applyFadeCurve(inwardProgress, layer.fadeCurve);
                    const logicalX = x - footprint.originX;
                    const logicalY = y - footprint.originY;
                    const color = applyArtDirection(sampleLayer(layer, modulo(logicalX, size), modulo(logicalY, size), size, normal.nx, normal.ny, recipe, textures, variant), recipe.artDirection);
                    writeProjectedPixel(output, width, height, x, y, color, layer.opacity * sideAmount * fade * enters * exits);
                }
        }
    }
    return { pixels: output, width, height, footprint };
}
export function renderProjectedAuxiliaryTilePixels(recipe, mask, size, channel, variant = 0, textures = new Map()) {
    if (isCutoutOutput(recipe))
        return { pixels: renderAuxiliaryTilePixels(recipe, mask, size, channel, variant, textures), footprint: projectionFootprint(recipe, size) };
    return composeProjectedTile(recipe, mask, size, renderAuxiliaryTilePixels(recipe, mask, size, channel, variant, textures), variant, textures, channel);
}
export function renderOutsidePixels(recipe, size, textures = new Map(), variant = 0) {
    if (isCutoutOutput(recipe))
        return new Uint8ClampedArray(size * size * 4);
    if (recipe.shape.transparentBackground)
        return new Uint8ClampedArray(size * size * 4);
    const outside = [...recipe.layers].reverse().find((layer) => layer.enabled && layer.kind === "outside") ??
        recipe.layers[recipe.layers.length - 1];
    const output = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            const color = applyArtDirection(sampleLayer(outside, x, y, size, 0, 1, recipe, textures, variant), recipe.artDirection);
            const index = (y * size + x) * 4;
            output[index] = clampByte(color[0]);
            output[index + 1] = clampByte(color[1]);
            output[index + 2] = clampByte(color[2]);
            output[index + 3] = 255;
        }
    }
    return output;
}
export function edgeProfile(mask) {
    return [
        hasBit(mask, BIT.N) ? "N" : "n",
        hasBit(mask, BIT.E) ? "E" : "e",
        hasBit(mask, BIT.S) ? "S" : "s",
        hasBit(mask, BIT.W) ? "W" : "w",
    ].join("");
}
export function clearRenderCache() {
    fieldCache.clear();
    layerPixelCache.clear();
    heightFieldCache.clear();
    alphaFieldCache.clear();
    shadowFieldCache.clear();
}
