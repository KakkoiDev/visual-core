import { TileableNoiseRenderer } from "./shader.js";

const DEFAULTS = {
  noiseType: "contours", fractalType: "fbm", seed: 4821, scale: 1.8, octaves: 5,
  persistence: 0.52, lacunarity: 2, warpEnabled: true, warpStrength: 0.38,
  warpScale: 0.85, palette: "ink", contrast: 1.15, maskEnabled: false,
  threshold: 0.52, invertMask: false, bandDensity: 8, bandWidth: 0.32,
  feedRate: 0.055, killRate: 0.062, simulationSpeed: 8,
  resolutionPreset: "512x512", outputWidth: 512, outputHeight: 512,
};

const canvas = document.querySelector("#noiseCanvas");
const controls = document.querySelector("#controls");
const status = document.querySelector("#renderStatus");
const stats = document.querySelector("#textureStats");
const tileGrid = document.querySelector("#tileGrid");
const canvasStage = document.querySelector("#canvasStage");
let renderer;
let renderFrame;
let reactionFrameCount = 0;

try {
  renderer = new TileableNoiseRenderer(canvas);
  if (!renderer.supportsReaction) {
    const reactionOption = controls.noiseType.querySelector('option[value="reaction"]');
    reactionOption.disabled = true;
    reactionOption.textContent += " — unsupported by this GPU";
  }
} catch (error) {
  status.textContent = error.message;
  status.style.color = "#9f2f24";
  controls.querySelectorAll("input, select, button").forEach((element) => { element.disabled = true; });
  throw error;
}

function getSettings() {
  const limitDimension = (value) => Math.max(64, Math.min(4000, Math.round(Number(value) || 512)));
  return {
    noiseType: controls.noiseType.value,
    fractalType: controls.fractalType.value,
    seed: Number(controls.seed.value),
    scale: Number(controls.scale.value),
    octaves: Number(controls.octaves.value),
    persistence: Number(controls.persistence.value),
    lacunarity: Number(controls.lacunarity.value),
    warpEnabled: controls.warpEnabled.checked,
    warpStrength: Number(controls.warpStrength.value),
    warpScale: Number(controls.warpScale.value),
    palette: controls.palette.value,
    contrast: Number(controls.contrast.value),
    maskEnabled: controls.maskEnabled.checked,
    threshold: Number(controls.threshold.value),
    invertMask: controls.invertMask.checked,
    bandDensity: Number(controls.bandDensity.value),
    bandWidth: Number(controls.bandWidth.value),
    feedRate: Number(controls.feedRate.value),
    killRate: Number(controls.killRate.value),
    simulationSpeed: Number(controls.simulationSpeed.value),
    outputWidth: limitDimension(controls.outputWidth.value),
    outputHeight: limitDimension(controls.outputHeight.value),
  };
}

function render() {
  cancelAnimationFrame(renderFrame);
  status.textContent = "Rendering on GPU…";
  renderFrame = requestAnimationFrame(drawFrame);
}

function drawFrame() {
  const settings = getSettings();
  const previewScale = Math.min(1, 640 / Math.max(settings.outputWidth, settings.outputHeight));
  const previewWidth = Math.max(2, Math.round(settings.outputWidth * previewScale));
  const previewHeight = Math.max(2, Math.round(settings.outputHeight * previewScale));
  renderer.resize(previewWidth, previewHeight);
  canvasStage.style.aspectRatio = `${settings.outputWidth} / ${settings.outputHeight}`;
  renderer.render(settings);
  reactionFrameCount++;
  if (canvasStage.classList.contains("tiled") && (settings.noiseType !== "reaction" || reactionFrameCount % 8 === 0)) {
      tileGrid.style.backgroundImage = `url(${canvas.toDataURL("image/png")})`;
  }
  stats.textContent = `${settings.outputWidth} × ${settings.outputHeight} · Seed ${settings.seed}`;
  status.textContent = settings.noiseType === "reaction" ? "Chemistry evolving…" : "GPU ready";
  if (settings.noiseType === "reaction") renderFrame = requestAnimationFrame(drawFrame);
}

function updateControlState() {
  const settings = getSettings();
  const values = {
    seed: settings.seed,
    scale: settings.scale.toFixed(2),
    octaves: settings.octaves,
    persistence: settings.persistence.toFixed(2),
    lacunarity: settings.lacunarity.toFixed(2),
    warpStrength: settings.warpStrength.toFixed(2),
    warpScale: settings.warpScale.toFixed(2),
    contrast: settings.contrast.toFixed(2),
    threshold: settings.threshold.toFixed(2),
    bandDensity: settings.bandDensity.toFixed(2),
    bandWidth: settings.bandWidth.toFixed(2),
    feedRate: settings.feedRate.toFixed(4),
    killRate: settings.killRate.toFixed(4),
    simulationSpeed: settings.simulationSpeed,
  };
  for (const [name, value] of Object.entries(values)) {
    const output = document.querySelector(`#${name}Output`);
    if (output) output.value = value;
  }
  document.querySelector("#warpControls").setAttribute("aria-disabled", String(!settings.warpEnabled));
  document.querySelector("#warpFieldset").hidden = settings.noiseType === "reaction";
  document.querySelector("#maskControls").hidden = !settings.maskEnabled;
  document.querySelectorAll("[data-algorithms]").forEach((element) => {
    element.hidden = !element.dataset.algorithms.split(",").includes(settings.noiseType);
  });
}

function applySettings(settings) {
  for (const [name, value] of Object.entries(settings)) {
    const element = controls.elements[name];
    if (!element) continue;
    if (element.type === "checkbox") element.checked = value;
    else element.value = value;
  }
  updateControlState();
  render();
}

function downloadBlob(blob, name) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function renderForExport(settings) {
  if (settings.noiseType === "reaction") {
    renderer.resize(settings.outputWidth, settings.outputHeight);
    renderer.render(settings);
    return renderer;
  }
  const exportCanvas = document.createElement("canvas");
  const exportRenderer = new TileableNoiseRenderer(exportCanvas);
  exportRenderer.resize(settings.outputWidth, settings.outputHeight);
  exportRenderer.render(settings);
  return exportRenderer;
}

function exportPng() {
  const settings = getSettings();
  status.textContent = `GPU rendering ${settings.outputWidth} × ${settings.outputHeight}…`;
  requestAnimationFrame(() => {
    const exportRenderer = renderForExport(settings);
    exportRenderer.canvas.toBlob((blob) => {
      if (!blob) {
        status.textContent = "PNG export failed";
        return;
      }
      downloadBlob(blob, `tileable-noise-${settings.seed}-${settings.outputWidth}x${settings.outputHeight}.png`);
      status.textContent = "PNG exported";
      if (settings.noiseType === "reaction") render();
    }, "image/png");
  });
}

function exportSvg() {
  const settings = { ...getSettings(), maskEnabled: true };
  status.textContent = `GPU tracing ${settings.outputWidth} × ${settings.outputHeight}…`;
  requestAnimationFrame(() => {
    const exportRenderer = renderForExport(settings);
    const pixels = exportRenderer.readPixels();
    const width = settings.outputWidth;
    const height = settings.outputHeight;
    const runs = [];

    for (let y = 0; y < height; y++) {
      let runStart = -1;
      const sourceY = height - 1 - y;
      for (let x = 0; x <= width; x++) {
        const filled = x < width && pixels[(sourceY * width + x) * 4] < 128;
        if (filled && runStart < 0) runStart = x;
        if (!filled && runStart >= 0) {
          runs.push(`<rect x="${runStart}" y="${y}" width="${x - runStart}" height="1"/>`);
          runStart = -1;
        }
      }
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges"><title>Tileable noise mask, seed ${settings.seed}</title><g fill="#14201e">${runs.join("")}</g></svg>`;
    downloadBlob(new Blob([svg], { type: "image/svg+xml" }), `tileable-noise-mask-${settings.seed}-${width}x${height}.svg`);
    status.textContent = "SVG exported";
    if (settings.noiseType === "reaction") render();
  });
}

controls.addEventListener("input", () => {
  updateControlState();
  render();
});
controls.addEventListener("change", () => {
  updateControlState();
  render();
});

controls.resolutionPreset.addEventListener("change", () => {
  if (controls.resolutionPreset.value === "custom") return;
  const [width, height] = controls.resolutionPreset.value.split("x");
  controls.outputWidth.value = width;
  controls.outputHeight.value = height;
  updateControlState();
  render();
});

[controls.outputWidth, controls.outputHeight].forEach((input) => {
  input.addEventListener("input", () => {
    controls.resolutionPreset.value = "custom";
  });
  input.addEventListener("change", () => {
    const settings = getSettings();
    controls.outputWidth.value = settings.outputWidth;
    controls.outputHeight.value = settings.outputHeight;
  });
});

document.querySelectorAll("[data-preview]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-preview]").forEach((item) => item.classList.toggle("active", item === button));
    const tiled = button.dataset.preview === "tiled";
    canvasStage.classList.toggle("tiled", tiled);
    document.querySelector("#gridButton").disabled = !tiled;
    if (tiled) tileGrid.style.backgroundImage = `url(${canvas.toDataURL("image/png")})`;
  });
});

document.querySelector("#gridButton").addEventListener("click", (event) => {
  const enabled = event.currentTarget.getAttribute("aria-pressed") !== "true";
  event.currentTarget.setAttribute("aria-pressed", String(enabled));
  event.currentTarget.textContent = enabled ? "Grid on" : "Grid off";
  tileGrid.classList.toggle("grid-lines", enabled);
});

document.querySelector("#randomizeButton").addEventListener("click", () => {
  controls.seed.value = Math.floor(Math.random() * 1000000);
  controls.scale.value = (0.8 + Math.random() * 3.4).toFixed(2);
  controls.warpStrength.value = (Math.random() * 0.9).toFixed(2);
  updateControlState();
  render();
});
document.querySelector("#resetButton").addEventListener("click", () => applySettings(DEFAULTS));
document.querySelector("#restartSimulationButton").addEventListener("click", () => {
  renderer.resetReaction();
  reactionFrameCount = 0;
  render();
});
document.querySelector("#exportPngButton").addEventListener("click", exportPng);
document.querySelector("#exportSvgButton").addEventListener("click", exportSvg);

applySettings(DEFAULTS);
