export const BIT = {
  N: 1,
  NE: 2,
  E: 4,
  SE: 8,
  S: 16,
  SW: 32,
  W: 64,
  NW: 128,
} as const;

export type BlobBitName = keyof typeof BIT;

export function hasBit(mask: number, bit: number): boolean {
  return (mask & bit) !== 0;
}

export function canonicalizeMask(input: number): number {
  let mask = input & 0xff;
  if (!(hasBit(mask, BIT.N) && hasBit(mask, BIT.E))) mask &= ~BIT.NE;
  if (!(hasBit(mask, BIT.E) && hasBit(mask, BIT.S))) mask &= ~BIT.SE;
  if (!(hasBit(mask, BIT.S) && hasBit(mask, BIT.W))) mask &= ~BIT.SW;
  if (!(hasBit(mask, BIT.W) && hasBit(mask, BIT.N))) mask &= ~BIT.NW;
  return mask;
}

// Godot's conventional 3x3-minimal 12 x 4 template. The null entry keeps the
// documented blank slot at atlas coordinate (10, 1); mask order is therefore
// a file-format contract, not a presentation sort.
export const BLOB_ATLAS_LAYOUT: readonly (number | null)[] = [
  16, 20, 84, 80, 213, 92, 116, 87, 28, 125, 124, 112,
  17, 21, 85, 81, 29, 127, 253, 113, 31, 119, null, 245,
  1, 5, 69, 65, 23, 223, 247, 209, 95, 255, 221, 241,
  0, 4, 68, 64, 117, 71, 197, 93, 7, 199, 215, 193,
];

/**
 * Blob 47 leaves one canonical 12x4 atlas cell unused. Cut-out overlays that
 * keep material outside a carved path use it as a non-terrain fill tile. The
 * 47 terrain states remain untouched, while Godot gains the opaque canvas it
 * needs around the path.
 */
export const BLOB_CUTOUT_FILL_ATLAS_COORDS = { x: 10, y: 1 } as const;

const BLOB_MASKS = BLOB_ATLAS_LAYOUT.filter((mask): mask is number => mask !== null);
const BLOB_ATLAS_INDEX = new Map(BLOB_MASKS.map((mask) => [mask, BLOB_ATLAS_LAYOUT.indexOf(mask)]));

export function getBlobMasks(): readonly number[] {
  return BLOB_MASKS;
}

export function blobAtlasCoords(mask: number): { x: number; y: number } {
  const index = BLOB_ATLAS_INDEX.get(mask);
  if (index === undefined) throw new Error(`Masque Blob 47 non canonique : ${mask}`);
  return { x: index % 12, y: Math.floor(index / 12) };
}

export function bitCount(value: number): number {
  let count = 0;
  let cursor = value & 0xff;
  while (cursor) {
    cursor &= cursor - 1;
    count += 1;
  }
  return count;
}

export function maskLabel(mask: number, language: "en" | "fr" = "en"): string {
  if (mask === 0) return language === "en" ? "Island" : "Îlot";
  if (mask === 255) return language === "en" ? "Center" : "Centre";
  const cardinal = [
    hasBit(mask, BIT.N) ? "N" : "",
    hasBit(mask, BIT.E) ? "E" : "",
    hasBit(mask, BIT.S) ? "S" : "",
    hasBit(mask, BIT.W) ? "W" : "",
  ].filter(Boolean);
  const cardinalCount = cardinal.length;
  const diagonals = [BIT.NE, BIT.SE, BIT.SW, BIT.NW].filter((bit) => hasBit(mask, bit)).length;
  if (cardinalCount === 1) return `${language === "en" ? "End" : "Fin"} ${cardinal[0]}`;
  if (cardinalCount === 2 && diagonals === 0) return `${language === "en" ? "Elbow" : "Angle"} ${cardinal.join("")}`;
  if (cardinalCount === 2 && diagonals > 0) return `${language === "en" ? "Corner" : "Coin"} ${cardinal.join("")}`;
  if (cardinalCount === 3) return `${language === "en" ? "Junction" : "Jonction"} ${cardinal.join("")}`;
  if (cardinalCount === 4 && diagonals === 0) return language === "en" ? "Cross" : "Croix";
  if (cardinalCount === 4 && diagonals < 4) return `${language === "en" ? "Hole" : "Trou"} ${4 - diagonals}`;
  return cardinal.join("") || (language === "en" ? "State" : "État");
}

export function maskFromGrid(grid: boolean[][], x: number, y: number): number {
  const filled = (dx: number, dy: number) => Boolean(grid[y + dy]?.[x + dx]);
  let mask = 0;
  if (filled(0, -1)) mask |= BIT.N;
  if (filled(1, -1)) mask |= BIT.NE;
  if (filled(1, 0)) mask |= BIT.E;
  if (filled(1, 1)) mask |= BIT.SE;
  if (filled(0, 1)) mask |= BIT.S;
  if (filled(-1, 1)) mask |= BIT.SW;
  if (filled(-1, 0)) mask |= BIT.W;
  if (filled(-1, -1)) mask |= BIT.NW;
  return canonicalizeMask(mask);
}

export function maskToNeighbors(mask: number): Array<{ x: number; y: number }> {
  const neighbors = [{ x: 0, y: 0 }];
  const candidates = [
    { bit: BIT.N, x: 0, y: -1 },
    { bit: BIT.NE, x: 1, y: -1 },
    { bit: BIT.E, x: 1, y: 0 },
    { bit: BIT.SE, x: 1, y: 1 },
    { bit: BIT.S, x: 0, y: 1 },
    { bit: BIT.SW, x: -1, y: 1 },
    { bit: BIT.W, x: -1, y: 0 },
    { bit: BIT.NW, x: -1, y: -1 },
  ];
  for (const candidate of candidates) {
    if (hasBit(mask, candidate.bit)) neighbors.push({ x: candidate.x, y: candidate.y });
  }
  return neighbors;
}

export function compatibleHorizontal(left: number, right: number): boolean {
  return (
    hasBit(left, BIT.E) &&
    hasBit(right, BIT.W) &&
    hasBit(left, BIT.NE) === hasBit(right, BIT.N) &&
    hasBit(left, BIT.SE) === hasBit(right, BIT.S) &&
    hasBit(right, BIT.NW) === hasBit(left, BIT.N) &&
    hasBit(right, BIT.SW) === hasBit(left, BIT.S)
  );
}

export function compatibleVertical(top: number, bottom: number): boolean {
  return (
    hasBit(top, BIT.S) &&
    hasBit(bottom, BIT.N) &&
    hasBit(top, BIT.SW) === hasBit(bottom, BIT.W) &&
    hasBit(top, BIT.SE) === hasBit(bottom, BIT.E) &&
    hasBit(bottom, BIT.NW) === hasBit(top, BIT.W) &&
    hasBit(bottom, BIT.NE) === hasBit(top, BIT.E)
  );
}
