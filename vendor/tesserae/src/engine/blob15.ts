import type { TextureBitmap } from "../types";
import { BIT, getBlobMasks, hasBit } from "./blob47";

const CARDINAL_MASK = BIT.N | BIT.E | BIT.S | BIT.W;

// Expected 5 x 4 source layout. The first four columns contain the fifteen
// side-connected states; the extra cell at (4, 0) is the four-way crossroads
// whose quadrants provide the four missing concave corners.
const BASE_TILE_COORDS = new Map<number, readonly [number, number]>([
  [BIT.S, [0, 0]],
  [BIT.E | BIT.S, [1, 0]],
  [BIT.E | BIT.S | BIT.W, [2, 0]],
  [BIT.S | BIT.W, [3, 0]],
  [BIT.N | BIT.S, [0, 1]],
  [BIT.N | BIT.E | BIT.S, [1, 1]],
  [BIT.N | BIT.E | BIT.S | BIT.W, [2, 1]],
  [BIT.N | BIT.S | BIT.W, [3, 1]],
  [BIT.N, [0, 2]],
  [BIT.N | BIT.E, [1, 2]],
  [BIT.N | BIT.E | BIT.W, [2, 2]],
  [BIT.N | BIT.W, [3, 2]],
  [0, [0, 3]],
  [BIT.E, [1, 3]],
  [BIT.E | BIT.W, [2, 3]],
  [BIT.W, [3, 3]],
]);

const CROSSROADS_COORDS = [4, 0] as const;

interface CornerRule {
  diagonal: number;
  sideA: number;
  sideB: number;
  quadrantX: 0 | 1;
  quadrantY: 0 | 1;
}

const CORNER_RULES: readonly CornerRule[] = [
  { diagonal: BIT.NW, sideA: BIT.N, sideB: BIT.W, quadrantX: 0, quadrantY: 0 },
  { diagonal: BIT.NE, sideA: BIT.N, sideB: BIT.E, quadrantX: 1, quadrantY: 0 },
  { diagonal: BIT.SW, sideA: BIT.S, sideB: BIT.W, quadrantX: 0, quadrantY: 1 },
  { diagonal: BIT.SE, sideA: BIT.S, sideB: BIT.E, quadrantX: 1, quadrantY: 1 },
];

export interface Blob15Composition {
  tileSize: number;
  tiles: Map<number, TextureBitmap>;
}

function copyRegion(
  source: TextureBitmap,
  sourceX: number,
  sourceY: number,
  width: number,
  height: number,
  target: Uint8ClampedArray,
  targetWidth: number,
  targetX = 0,
  targetY = 0,
): void {
  for (let y = 0; y < height; y += 1) {
    const sourceStart = ((sourceY + y) * source.width + sourceX) * 4;
    const targetStart = ((targetY + y) * targetWidth + targetX) * 4;
    target.set(source.data.subarray(sourceStart, sourceStart + width * 4), targetStart);
  }
}

function validateSource(source: TextureBitmap): number {
  if (source.width % 5 !== 0 || source.height % 4 !== 0) {
    throw new Error("Le Blob 15 doit utiliser une grille exacte de 5 x 4 cases.");
  }
  const tileWidth = source.width / 5;
  const tileHeight = source.height / 4;
  if (tileWidth !== tileHeight) throw new Error("Les cases du Blob 15 doivent etre carrees.");
  if (tileWidth < 2 || tileWidth % 2 !== 0) throw new Error("La taille de case doit etre paire pour la decoupe en quatre quartiers.");
  if (source.data.length !== source.width * source.height * 4) throw new Error("Les pixels du Blob 15 sont incomplets.");
  return tileWidth;
}

export function composeBlob47FromBlob15(source: TextureBitmap): Blob15Composition {
  const tileSize = validateSource(source);
  const half = tileSize / 2;
  const tiles = new Map<number, TextureBitmap>();

  for (const mask of getBlobMasks()) {
    const baseCoords = BASE_TILE_COORDS.get(mask & CARDINAL_MASK);
    if (!baseCoords) throw new Error(`Configuration cardinale Blob 15 absente pour le masque ${mask}.`);
    const data = new Uint8ClampedArray(tileSize * tileSize * 4);
    copyRegion(source, baseCoords[0] * tileSize, baseCoords[1] * tileSize, tileSize, tileSize, data, tileSize);

    for (const corner of CORNER_RULES) {
      const needsCrossroadsCorner = hasBit(mask, corner.sideA)
        && hasBit(mask, corner.sideB)
        && !hasBit(mask, corner.diagonal);
      if (!needsCrossroadsCorner) continue;
      const quadrantX = corner.quadrantX * half;
      const quadrantY = corner.quadrantY * half;
      copyRegion(
        source,
        CROSSROADS_COORDS[0] * tileSize + quadrantX,
        CROSSROADS_COORDS[1] * tileSize + quadrantY,
        half,
        half,
        data,
        tileSize,
        quadrantX,
        quadrantY,
      );
    }

    tiles.set(mask, { width: tileSize, height: tileSize, data });
  }

  return { tileSize, tiles };
}
