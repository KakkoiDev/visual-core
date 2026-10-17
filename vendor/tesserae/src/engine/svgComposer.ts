import type { MaterialLayer, TerrainRecipe } from "../types";

export interface SvgComposerMetrics {
  tileSize: number;
  gridSize: number;
  cliffDepth: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SvgComposerLayers {
  surface: MaterialLayer;
  innerBorders: MaterialLayer[];
  outside?: MaterialLayer;
  cliff?: MaterialLayer;
}

export function canUseSvgComposer(recipe: TerrainRecipe): boolean {
  return recipe.topology === "blob47" && Object.keys(recipe.overrides).length === 0;
}

export function svgComposerLayers(recipe: TerrainRecipe): SvgComposerLayers {
  const enabled = recipe.layers.filter((layer) => layer.enabled);
  const surface = enabled.find((layer) => layer.kind === "inside") ?? recipe.layers[0];
  if (!surface) throw new Error("A terrain recipe requires a surface layer.");
  return {
    surface,
    innerBorders: enabled
      .filter((layer) => layer.kind === "band" && layer.placement === "inner" && !layer.cliffFaceOnly)
      .sort((a, b) => b.width - a.width),
    outside: enabled.find((layer) => layer.kind === "outside"),
    cliff: enabled.find((layer) => layer.cliffEnabled),
  };
}

export function svgComposerMetrics(recipe: TerrainRecipe, gridSize: number, tileSize: number): SvgComposerMetrics {
  const cliff = svgComposerLayers(recipe).cliff;
  const cliffDepth = cliff ? Math.max(0, cliff.cliffHeightSteps * tileSize) : 0;
  const sideMargin = tileSize * 0.75;
  const topMargin = tileSize * 0.75;
  const bottomMargin = Math.max(tileSize * 0.75, cliffDepth + tileSize * 0.35);
  return {
    tileSize,
    gridSize,
    cliffDepth,
    x: -sideMargin,
    y: -topMargin,
    width: gridSize * tileSize + sideMargin * 2,
    height: gridSize * tileSize + topMargin + bottomMargin,
  };
}

export function filledSvgCells(grid: boolean[][]): Array<{ x: number; y: number }> {
  const cells: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < grid.length; y += 1) {
    for (let x = 0; x < (grid[y]?.length ?? 0); x += 1) {
      if (grid[y][x]) cells.push({ x, y });
    }
  }
  return cells;
}

export function svgCellUnionPath(grid: boolean[][], tileSize: number): string {
  return filledSvgCells(grid).map(({ x, y }) => {
    const left = x * tileSize;
    const top = y * tileSize;
    return `M${left} ${top}h${tileSize}v${tileSize}h-${tileSize}Z`;
  }).join("");
}

export async function svgElementToPng(svg: SVGSVGElement, scale: number): Promise<Blob> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const viewBox = svg.viewBox.baseVal;
  const width = Math.max(1, Math.round(viewBox.width * scale));
  const height = Math.max(1, Math.round(viewBox.height * scale));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  const source = new XMLSerializer().serializeToString(clone);
  const sourceUrl = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Unable to rasterize the SVG terrain preview."));
      image.src = sourceUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("Canvas 2D is unavailable.");
    context.drawImage(image, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("PNG export failed.")),
      "image/png",
    ));
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

export function svgExportScale(recipe: TerrainRecipe, previewTileSize: number): number {
  return recipe.shape.tileSize / previewTileSize;
}
