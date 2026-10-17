import { describe, expect, it } from "vitest";
import { clampUiScale, fitSideDockWidths, maximumUiScale, panForAnchoredZoom, recommendedUiScale, UI_SCALE_OPTIONS } from "./view";

describe("preview view transforms", () => {
  it("keeps the terrain point under the cursor fixed while zooming", () => {
    const pan = { x: 35, y: -18 };
    const cursor = { x: 142, y: 76 };
    const currentZoom = 1.25;
    const nextZoom = 2.5;
    const nextPan = panForAnchoredZoom(pan, cursor, currentZoom, nextZoom);
    expect((cursor.x - nextPan.x) / nextZoom).toBeCloseTo((cursor.x - pan.x) / currentZoom, 8);
    expect((cursor.y - nextPan.y) / nextZoom).toBeCloseTo((cursor.y - pan.y) / currentZoom, 8);
  });

  it("scales the interface for QHD, 4K and 5K workspaces while retaining manual options", () => {
    expect(recommendedUiScale(1920, 1080)).toBe(1.25);
    expect(recommendedUiScale(2560, 1440)).toBe(1.5);
    expect(recommendedUiScale(3840, 2160)).toBe(2.5);
    expect(recommendedUiScale(3440, 1440)).toBe(1.5);
    expect(recommendedUiScale(5120, 2880)).toBe(2.5);
    expect(UI_SCALE_OPTIONS).toEqual([1, 1.25, 1.5, 1.75, 2, 2.25, 2.5]);
  });

  it("caps persisted UI scale to the current monitor width", () => {
    expect(maximumUiScale(1280)).toBe(1.25);
    expect(maximumUiScale(1920)).toBe(1.75);
    expect(maximumUiScale(2560)).toBe(2.5);
    expect(clampUiScale(2, 1920)).toBe(1.75);
    expect(clampUiScale(2, 3840)).toBe(2);
  });

  it("shrinks oversized persisted docks before they can hide the inspector", () => {
    const fitted = fitSideDockWidths(1280, 250, 1000);
    expect(fitted.left).toBeGreaterThanOrEqual(190);
    expect(fitted.right).toBeGreaterThanOrEqual(260);
    expect(fitted.left + fitted.right).toBeLessThanOrEqual(1280 - 420 - 14);
  });
});
