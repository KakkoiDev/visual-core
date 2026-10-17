import { describe, expect, it } from "vitest";
import { automaticInteriorWallCells, createLabGrid } from "./lab";

describe("laboratory interior-wall classification", () => {
  it("marks walls around enclosed cavities but not open shapes", () => {
    const ring = automaticInteriorWallCells(createLabGrid("ring", 1, 13));
    expect(ring.size).toBeGreaterThan(0);
    expect(ring.has("1,1")).toBe(true);
    expect(ring.has("4,1")).toBe(true);
    expect(ring.has("11,1")).toBe(true);
    expect(ring.has("3,9")).toBe(true);
    expect(automaticInteriorWallCells(createLabGrid("u", 1, 13)).size).toBe(0);
    expect(automaticInteriorWallCells(createLabGrid("c", 1, 13)).size).toBe(0);
  });

  it("never classifies a border-connected void as interior", () => {
    const grid = [
      [false, false, false],
      [false, true, false],
      [false, false, false],
    ];
    expect(automaticInteriorWallCells(grid)).toEqual(new Set());
  });
});
