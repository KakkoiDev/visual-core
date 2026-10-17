import { describe, expect, it } from "vitest";
import type { TextureBitmap } from "../types";
import { BIT, BLOB_ATLAS_LAYOUT, blobAtlasCoords, getBlobMasks } from "./blob47";
import { composeBlob47FromBlob15 } from "./blob15";
import { terrainAtlasLayout } from "./topology";
import { createBlankRecipe } from "../types";

const TILE_SIZE = 4;

function fillRect(bitmap: TextureBitmap, x: number, y: number, width: number, height: number, color: readonly number[]): void {
  for (let py = y; py < y + height; py += 1) for (let px = x; px < x + width; px += 1) {
    const index = (py * bitmap.width + px) * 4;
    bitmap.data.set(color, index);
  }
}

function syntheticSource(): TextureBitmap {
  const bitmap: TextureBitmap = {
    width: TILE_SIZE * 5,
    height: TILE_SIZE * 4,
    data: new Uint8ClampedArray(TILE_SIZE * 5 * TILE_SIZE * 4 * 4),
  };
  for (let y = 0; y < 4; y += 1) for (let x = 0; x < 4; x += 1) {
    fillRect(bitmap, x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE, [20 + x * 30, 20 + y * 30, 40, 255]);
  }
  const crossroadsX = TILE_SIZE * 4;
  fillRect(bitmap, crossroadsX, 0, 2, 2, [201, 1, 1, 255]);
  fillRect(bitmap, crossroadsX + 2, 0, 2, 2, [2, 202, 2, 255]);
  fillRect(bitmap, crossroadsX, 2, 2, 2, [3, 3, 203, 255]);
  fillRect(bitmap, crossroadsX + 2, 2, 2, 2, [204, 204, 4, 255]);
  return bitmap;
}

function rgbaAt(bitmap: TextureBitmap, x: number, y: number): number[] {
  const index = (y * bitmap.width + x) * 4;
  return [...bitmap.data.slice(index, index + 4)];
}

describe("Blob 15 crossroads composer", () => {
  it("builds all 47 canonical masks at the detected tile size", () => {
    const result = composeBlob47FromBlob15(syntheticSource());
    expect(result.tileSize).toBe(TILE_SIZE);
    expect([...result.tiles.keys()]).toEqual(getBlobMasks());
  });

  it("exports Blob 47 in the requested 12 x 4 sheet", () => {
    expect(terrainAtlasLayout(createBlankRecipe())).toEqual({ columns: 12, rows: 4 });
    expect(BLOB_ATLAS_LAYOUT).toHaveLength(48);
    expect(BLOB_ATLAS_LAYOUT[22]).toBeNull();
    expect(blobAtlasCoords(0)).toEqual({ x: 0, y: 3 });
    expect(blobAtlasCoords(245)).toEqual({ x: 11, y: 1 });
  });

  it("uses the matching crossroads L only when a supported diagonal is absent", () => {
    const result = composeBlob47FromBlob15(syntheticSource());
    const elbow = result.tiles.get(BIT.N | BIT.E)!;
    const connectedCorner = result.tiles.get(BIT.N | BIT.NE | BIT.E)!;
    expect(rgbaAt(elbow, 3, 0)).toEqual([2, 202, 2, 255]);
    expect(rgbaAt(connectedCorner, 3, 0)).not.toEqual([2, 202, 2, 255]);
    expect(rgbaAt(elbow, 0, 3)).toEqual(rgbaAt(connectedCorner, 0, 3));
  });

  it("can replace all four quarters of the crossroads state independently", () => {
    const result = composeBlob47FromBlob15(syntheticSource());
    const crossroads = result.tiles.get(BIT.N | BIT.E | BIT.S | BIT.W)!;
    expect(rgbaAt(crossroads, 0, 0)).toEqual([201, 1, 1, 255]);
    expect(rgbaAt(crossroads, 3, 0)).toEqual([2, 202, 2, 255]);
    expect(rgbaAt(crossroads, 0, 3)).toEqual([3, 3, 203, 255]);
    expect(rgbaAt(crossroads, 3, 3)).toEqual([204, 204, 4, 255]);
  });

  it("rejects sheets that cannot be divided into the expected 5 x 4 grid", () => {
    expect(() => composeBlob47FromBlob15({ width: 19, height: 16, data: new Uint8ClampedArray(19 * 16 * 4) })).toThrow(/5 x 4/);
    expect(() => composeBlob47FromBlob15({ width: 20, height: 20, data: new Uint8ClampedArray(20 * 20 * 4) })).toThrow(/carrees/);
  });
});
