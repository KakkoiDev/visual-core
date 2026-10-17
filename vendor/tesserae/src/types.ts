export type Direction = "N" | "E" | "S" | "W";
export type TerrainTopology = "blob47" | "dual16";
export type DualDiagonalMode = "separate" | "connected";

export type MaterialKind = "inside" | "band" | "outside";
export type EdgePlacement = "inner" | "center" | "outer";
export type ContourMode = "straight" | "organic" | "wave" | "scallop" | "fractured";
export type FadeCurve = "linear" | "smooth" | "soft" | "hard";
export type TextureScale = 0.125 | 0.25 | 0.5 | 1 | 2 | 4 | 8;
export type EdgeDeformationMode = "straight" | "wave" | "organic" | "artistic";
export type CliffTextureRole = "front" | "interior" | "crown" | "side" | "rear" | "detail";
export type CliffVerticalSampling = "preserve" | "repeat";
export type ProductionProfileId = "free" | "pixel-strict" | "orthogonal-90";

/** Maximum multiplier exposed for the shared terrain contour deformation. */
export const MAX_EDGE_DEFORMATION = 4;
/** A terrain effect at 100% moves the shared contour by at most 2% of a tile. */
export const TERRAIN_EDGE_DISPLACEMENT_RATIO = 0.02;
export const MAX_TERRAIN_EDGE_STACK_RATIO = 0.12;
/** Local material effects are deliberately finer than the shared terrain contour. */
export const MAX_LAYER_EDGE_DEFORMATION = 2;
export const LAYER_EDGE_DISPLACEMENT_RATIO = 0.02;
export const MAX_LAYER_EDGE_STACK_RATIO = 0.1;
/** Keep at least four rendered pixels per cycle while allowing finer contours. */
export const MIN_LAYER_EDGE_WAVELENGTH_PX = 4;
export const MAX_SHADOW_DISTANCE = 2;
export const MAX_SHADOW_BLUR = 1;

export interface ContourProfile {
  mode: ContourMode;
  amplitude: number;
  frequency: number;
  phase: number;
}

export interface LayerEdgeDeformation {
  id: string;
  mode: Exclude<ContourMode, "straight"> | "artistic";
  /** Local displacement multiplier; 1 equals 2% of one tile. */
  amount: number;
  frequency: number;
  phase: number;
}

export function layerEdgeStackDisplacement(effects: LayerEdgeDeformation[], tileSize: number): number {
  const authoredRatio = effects.reduce((total, effect) => total + effect.amount * LAYER_EDGE_DISPLACEMENT_RATIO, 0);
  return Math.min(MAX_LAYER_EDGE_STACK_RATIO, authoredRatio) * tileSize;
}

export function layerEdgeFrequencyLimit(renderSize: number): number {
  return Math.max(1, Math.floor(Math.max(1, renderSize) / MIN_LAYER_EDGE_WAVELENGTH_PX));
}

export function edgeFrequencyLimitForMode(mode: LayerEdgeDeformation["mode"], renderSize: number): number {
  return mode === "organic" || mode === "artistic" ? 2 : layerEdgeFrequencyLimit(renderSize);
}

export type PatternKind =
  | "organic"
  | "soil"
  | "sand"
  | "rock"
  | "foam"
  | "water"
  | "custom";

export interface DirectionSettings {
  N: boolean;
  E: boolean;
  S: boolean;
  W: boolean;
}

export interface DirectionTransform {
  rotation: 0 | 90 | 180 | 270;
  flipX: boolean;
  flipY: boolean;
}

export type DirectionTransforms = Record<Direction, DirectionTransform>;

export interface MaterialLayer {
  id: string;
  name: string;
  detail: string;
  kind: MaterialKind;
  pattern: PatternKind;
  color: string;
  accent: string;
  enabled: boolean;
  width: number;
  feather: number;
  /** Fades a border material toward the next layer near its outer edge. */
  taper: number;
  placement: EdgePlacement;
  distanceOffset: number;
  innerFade: number;
  outerFade: number;
  /** Blends the material to transparency across the inner half of an inner border. */
  fadeInward: number;
  fadeCurve: FadeCurve;
  innerContour: ContourProfile;
  outerContour: ContourProfile;
  /** Ordered, additive contour effects that affect this material only. */
  edgeDeformations: LayerEdgeDeformation[];
  /** Signed height: positive embosses, negative engraves. */
  relief: number;
  reliefStrength: number;
  reliefAngle: number;
  reliefSoftness: number;
  /** Draws a cliff face outside the logical tile while keeping the grid anchor unchanged. */
  cliffEnabled: boolean;
  cliffDirection: Direction;
  /** Structural elevation stored as a tile ratio and edited in exact output pixels. */
  cliffHeightSteps: number;
  /** Adapts visible face depth to the local contour orientation. */
  cliffDirectional: boolean;
  /** Serialized ratio for an independently edited side-face height. */
  cliffSideDepth: number;
  /** Serialized ratio for an independently edited rear-face height. */
  cliffRearDepth: number;
  /** Displayed width of one uploaded cliff motif, in output pixels. */
  cliffPatternSizePx: number;
  /** Horizontal sampling phase for the projected cliff wall, in output pixels. */
  cliffTextureOffsetXPx: number;
  /** Enables a separately paintable material for enclosed/interior walls. */
  cliffInteriorEnabled: boolean;
  /** Runtime-only: anchor projected walls to visible imported alpha edges instead of semantic Blob neighbors. */
  cliffAlphaEdgesOnly?: boolean;
  /** Flat-color fallback used when no interior wall texture is assigned. */
  cliffInteriorColor: string;
  /** Controls whether the authored vertical strip is sampled once or tiled. */
  cliffVerticalSampling: CliffVerticalSampling;
  /** Structural rock ribbon attached to the terrain contour above the projected wall. */
  cliffCrownEnabled: boolean;
  /** Visible crown width in output pixels. */
  cliffCrownWidthPx: number;
  /** Along-contour repeat length of the crown material in output pixels. */
  cliffCrownPatternSizePx: number;
  /** Along-contour texture scale used on side faces. */
  cliffSideTextureScale: number;
  /** Strength of orientation-based face lighting. */
  cliffDirectionalLight: number;
  /** Continuous world-space coordinate warp used to break obvious motif repetition. */
  cliffMacroVariation: number;
  /** Probability and opacity controls for an optional sparse detail texture. */
  cliffDetailDensity: number;
  cliffDetailStrength: number;
  /** Fine visual offsets expressed in logical tile units. */
  cliffOffsetX: number;
  cliffOffsetY: number;
  /** Lateral drift applied progressively along the projected face. */
  cliffShear: number;
  cliffShadow: number;
  /** Keeps the cliff texture off the terrain top and uses it only for the projected face. */
  cliffFaceOnly: boolean;
  /** Portion of a tile rendered under the top surface before the visible cliff face begins. */
  cliffOverlap: number;
  /** Optional non-destructive shadow cast by this material onto layers below it. */
  shadowEnabled: boolean;
  shadowColor: string;
  shadowOpacity: number;
  /** Shadow displacement expressed as a fraction of one logical tile. */
  shadowDistance: number;
  shadowAngle: number;
  /** Blur radius expressed as a fraction of one logical tile. */
  shadowBlur: number;
  shadowAffectsAo: boolean;
  /** Per-material albedo brightness: -1 blackens, 0 preserves, +1 whitens. */
  brightness: number;
  opacity: number;
  scale: TextureScale;
  roughness: number;
  frequency: number;
  offsetX: number;
  offsetY: number;
  seedOffset: number;
  /** Pulls the previous material under the edge to eliminate source bleed. */
  cutoff: number;
  sides: DirectionSettings;
  transforms: DirectionTransforms;
  textureUrl?: string;
  textureName?: string;
  cliffInteriorTextureUrl?: string;
  cliffInteriorTextureName?: string;
  cliffCrownTextureUrl?: string;
  cliffCrownTextureName?: string;
  cliffSideTextureUrl?: string;
  cliffSideTextureName?: string;
  cliffRearTextureUrl?: string;
  cliffRearTextureName?: string;
  cliffDetailTextureUrl?: string;
  cliffDetailTextureName?: string;
}

export interface ShapeSettings {
  transparentBackground: boolean;
  /** Controls whether the full material stack is composed or one surface is cut by the terrain motif. */
  outputMode: TerrainOutputMode;
  /** Distance, in logical tile units, by which the generated transparent region crosses the contour. */
  cutoutExtrusion: number;
  thickness: number;
  outerRadius: number;
  innerRadius: number;
  roughness: number;
  frequency: number;
  deformationMode: EdgeDeformationMode;
  deformationPhase: number;
  /** Ordered, additive contour effects shared by the complete terrain. */
  edgeDeformations: LayerEdgeDeformation[];
  /** Seamless translation of the organic pattern, kept separate from sine phase. */
  organicOffset: number;
  /** Number of progressively finer periodic noise layers. */
  organicOctaves: number;
  /** Relative strength retained by each finer organic-noise layer. */
  organicPersistence: number;
  seed: number;
  /** Limits how far two opposite borders may overlap. */
  mergePoint: number;
  /** Square output tile size in pixels. Any integer from 8 to 512 is supported. */
  tileSize: number;
}

/** Returns the new additive stack, or a synthesized legacy effect for older recipes. */
export function terrainEdgeDeformations(shape: ShapeSettings): LayerEdgeDeformation[] {
  if (Array.isArray(shape.edgeDeformations) && shape.edgeDeformations.length > 0) return shape.edgeDeformations;
  if (shape.deformationMode === "straight" || shape.roughness <= 0) return [];
  return [{
    id: "edge-1",
    mode: shape.deformationMode,
    amount: Math.min(MAX_EDGE_DEFORMATION, shape.roughness * 4),
    frequency: shape.frequency,
    phase: shape.deformationMode === "wave" ? shape.deformationPhase : shape.organicOffset,
  }];
}

export type TerrainOutputMode = "composite" | "cutout-inside" | "cutout-outside";

export interface VariantSettings {
  count: number;
  contourVariation: number;
  textureVariation: number;
  colorVariation: number;
  weights: number[];
}

export interface ArtDirectionSettings {
  saturation: number;
  contrast: number;
  temperature: number;
  exposure: number;
  normalStrength: number;
  heightScale: number;
  aoStrength: number;
  lightAngle: number;
  lightElevation: number;
  lightIntensity: number;
  ambientLight: number;
  lightColor: string;
}

export interface TerrainSemantics {
  terrainId: string;
  transitionGroup: string;
  transitionPriority: number;
  physicsEnabled: boolean;
  navigationEnabled: boolean;
  occlusionEnabled: boolean;
  walkable: boolean;
  surfaceType: string;
  footstep: string;
  movementCost: number;
}

export interface MacroPatternCell {
  x: number;
  y: number;
  mask: number;
}

export interface MacroPattern {
  id: string;
  name: string;
  width: number;
  height: number;
  cells: MacroPatternCell[];
}

export type TileOverrideMode = "replace" | "safe-center";

export interface TileOverrideSettings {
  mode: TileOverrideMode;
  /** Logical pixels kept untouched along every tile edge. */
  insetPx: number;
  /** Logical pixels used to blend the generated tile into custom art. */
  featherPx: number;
}

export interface TerrainRecipe {
  schemaVersion: 1 | 2 | 3;
  name: string;
  topology: TerrainTopology;
  dualDiagonal: DualDiagonalMode;
  productionProfile: ProductionProfileId;
  shape: ShapeSettings;
  variants: VariantSettings;
  artDirection: ArtDirectionSettings;
  semantics: TerrainSemantics;
  patterns: MacroPattern[];
  layers: MaterialLayer[];
  selectedLayerId: string;
  overrides: Record<string, string>;
  overrideSettings: Record<string, TileOverrideSettings>;
  createdWith: "Tesserae";
  /** Layers are stored as in Photoshop: first visible band is the topmost one. */
  stackOrder?: "top-first";
}

export interface TextureBitmap {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export type TextureRegistry = Map<string, TextureBitmap>;

export function cliffTextureKey(layerId: string, role: CliffTextureRole): string {
  return role === "front" ? layerId : `${layerId}:cliff-${role}`;
}

export type BottomTab = "atlas" | "sources" | "lab" | "proof" | "artlab" | "patterns" | "seams" | "godot";
export type WorkspaceStage = "design" | "validate" | "ship";

export type InspectorTab = "shape" | "material" | "edge" | "relief" | "direction" | "variants";
export type MeasurementUnit = "percent" | "pixels";

export type LabPreset = "ring" | "u" | "c" | "maze" | "islands";

export const ALL_DIRECTIONS: DirectionSettings = {
  N: true,
  E: true,
  S: true,
  W: true,
};

export const DEFAULT_TRANSFORMS: DirectionTransforms = {
  N: { rotation: 0, flipX: false, flipY: false },
  E: { rotation: 90, flipX: false, flipY: false },
  S: { rotation: 180, flipX: false, flipY: false },
  W: { rotation: 270, flipX: false, flipY: false },
};

export const DEFAULT_CONTOUR: ContourProfile = {
  mode: "straight",
  amplitude: 0,
  frequency: 4,
  phase: 0,
};

export const DEFAULT_CLIFF_HEIGHT_STEPS = 3;

export function normalizeCliffHeight(value: number, tileSize = 64): number {
  const finite = Number.isFinite(value) ? value : DEFAULT_CLIFF_HEIGHT_STEPS;
  return Math.max(1 / Math.max(1, tileSize), Math.min(4, finite));
}

export function automaticCliffCrownWidth(sourceWidth: number, sourceHeight: number, tileSize: number): number {
  const stripHeight = sourceWidth >= sourceHeight * 2 ? sourceHeight : tileSize * 0.1;
  return Math.max(2, Math.min(tileSize * 0.5, Math.round(stripHeight)));
}

const EDGE_DEFAULTS = {
  placement: "center" as EdgePlacement,
  distanceOffset: 0,
  innerFade: 0.012,
  outerFade: 0.012,
  fadeInward: 0,
  fadeCurve: "smooth" as FadeCurve,
  innerContour: structuredClone(DEFAULT_CONTOUR),
  outerContour: structuredClone(DEFAULT_CONTOUR),
  edgeDeformations: [] as LayerEdgeDeformation[],
  relief: 0,
  reliefStrength: 0.35,
  reliefAngle: 315,
  reliefSoftness: 0.5,
  cliffEnabled: false,
  cliffDirection: "S" as Direction,
  cliffHeightSteps: DEFAULT_CLIFF_HEIGHT_STEPS,
  cliffDirectional: true,
  cliffSideDepth: 0.8,
  cliffRearDepth: 0,
  cliffPatternSizePx: 64,
  cliffTextureOffsetXPx: 0,
  cliffInteriorEnabled: false,
  cliffInteriorColor: "#4b342b",
  cliffVerticalSampling: "preserve" as CliffVerticalSampling,
  cliffCrownEnabled: false,
  cliffCrownWidthPx: 6,
  cliffCrownPatternSizePx: 64,
  cliffSideTextureScale: 1,
  cliffDirectionalLight: 0,
  cliffMacroVariation: 0,
  cliffDetailDensity: 0.18,
  cliffDetailStrength: 0.42,
  cliffOffsetX: 0,
  cliffOffsetY: 0,
  cliffShear: 0,
  cliffShadow: 0.35,
  cliffFaceOnly: false,
  cliffOverlap: 0,
  shadowEnabled: false,
  shadowColor: "#000000",
  shadowOpacity: 0.7,
  shadowDistance: 0.12,
  shadowAngle: 45,
  shadowBlur: 0.05,
  shadowAffectsAo: true,
  brightness: 0,
};

export const DEFAULT_RECIPE: TerrainRecipe = {
  schemaVersion: 3,
  topology: "blob47",
  dualDiagonal: "separate",
  productionProfile: "free",
  name: "Wild Coast",
  createdWith: "Tesserae",
  selectedLayerId: "cliff",
  overrides: {},
  overrideSettings: {},
  semantics: {
    terrainId: "wild-coast",
    transitionGroup: "natural-ground",
    transitionPriority: 0,
    physicsEnabled: false,
    navigationEnabled: false,
    occlusionEnabled: false,
    walkable: true,
    surfaceType: "terrain",
    footstep: "default",
    movementCost: 1,
  },
  patterns: [],
  shape: {
    transparentBackground: false,
    outputMode: "composite",
    cutoutExtrusion: 0,
    thickness: 0.62,
    outerRadius: 0.18,
    innerRadius: 0.18,
    roughness: 0.12,
    frequency: 2,
    deformationMode: "organic",
    deformationPhase: 0.17,
    edgeDeformations: [],
    organicOffset: 0,
    organicOctaves: 4,
    organicPersistence: 0.5,
    seed: 1847,
    mergePoint: 0.5,
    tileSize: 64,
  },
  variants: {
    count: 3,
    contourVariation: 0.16,
    textureVariation: 0.32,
    colorVariation: 0.06,
    weights: [40, 30, 20],
  },
  artDirection: {
    saturation: 1.08,
    contrast: 1.06,
    temperature: 0.04,
    exposure: 0,
    normalStrength: 1.25,
    heightScale: 1,
    aoStrength: 1,
    lightAngle: 315,
    lightElevation: 0.58,
    lightIntensity: 0.9,
    ambientLight: 0.48,
    lightColor: "#ffd6a3",
  },
  layers: [
    {
      id: "surface",
      name: "Surface",
      detail: "Grass",
      kind: "inside",
      pattern: "organic",
      color: "#667f3f",
      accent: "#9ab867",
      enabled: true,
      width: 0,
      feather: 0.018,
      taper: 0,
      ...structuredClone(EDGE_DEFAULTS),
      opacity: 1,
      scale: 1,
      roughness: 0.12,
      frequency: 3,
      offsetX: 0,
      offsetY: 0,
      seedOffset: 11,
      cutoff: 0,
      sides: { ...ALL_DIRECTIONS },
      transforms: structuredClone(DEFAULT_TRANSFORMS),
    },
    {
      id: "lip",
      name: "Lip",
      detail: "Soil",
      kind: "band",
      pattern: "soil",
      color: "#92734a",
      accent: "#c08d58",
      enabled: true,
      width: 0.052,
      feather: 0.014,
      taper: 0.18,
      ...structuredClone(EDGE_DEFAULTS),
      placement: "inner",
      distanceOffset: 0,
      innerFade: 0.012,
      outerFade: 0.016,
      innerContour: { mode: "organic", amplitude: 0.009, frequency: 4, phase: 0.13 },
      outerContour: { mode: "organic", amplitude: 0.006, frequency: 5, phase: 0.47 },
      relief: 0.22,
      reliefStrength: 0.3,
      opacity: 1,
      scale: 1,
      roughness: 0.2,
      frequency: 4,
      offsetX: 0,
      offsetY: 0,
      seedOffset: 23,
      cutoff: 0.012,
      sides: { ...ALL_DIRECTIONS },
      transforms: structuredClone(DEFAULT_TRANSFORMS),
    },
    {
      id: "sand",
      name: "Sand",
      detail: "Light deposit",
      kind: "band",
      pattern: "sand",
      color: "#c5a766",
      accent: "#d9be79",
      enabled: true,
      width: 0.058,
      feather: 0.012,
      taper: 0.12,
      ...structuredClone(EDGE_DEFAULTS),
      placement: "inner",
      distanceOffset: -0.045,
      innerFade: 0.022,
      outerFade: 0.028,
      fadeCurve: "soft",
      innerContour: { mode: "organic", amplitude: 0.022, frequency: 3, phase: 0.31 },
      outerContour: { mode: "wave", amplitude: 0.014, frequency: 5, phase: 0.61 },
      relief: 0.08,
      reliefStrength: 0.18,
      opacity: 1,
      scale: 1,
      roughness: 0.26,
      frequency: 5,
      offsetX: 0,
      offsetY: 0,
      seedOffset: 37,
      cutoff: 0.008,
      sides: { ...ALL_DIRECTIONS },
      transforms: structuredClone(DEFAULT_TRANSFORMS),
    },
    {
      id: "cliff",
      name: "Cliff",
      detail: "Directional rock",
      kind: "band",
      pattern: "rock",
      color: "#696356",
      accent: "#a59b7b",
      enabled: true,
      width: 0.075,
      feather: 0,
      taper: 0,
      ...structuredClone(EDGE_DEFAULTS),
      placement: "center",
      innerFade: 0,
      outerFade: 0,
      innerContour: structuredClone(DEFAULT_CONTOUR),
      outerContour: structuredClone(DEFAULT_CONTOUR),
      relief: 0.82,
      reliefStrength: 0.72,
      reliefSoftness: 0.38,
      cliffEnabled: true,
      cliffFaceOnly: true,
      cliffDirection: "S",
      cliffHeightSteps: DEFAULT_CLIFF_HEIGHT_STEPS,
      cliffShear: 0,
      cliffShadow: 0.48,
      shadowOpacity: 0.85,
      shadowDistance: 0.3,
      shadowAngle: 90,
      shadowBlur: 0.1,
      opacity: 1,
      scale: 1,
      roughness: 0.45,
      frequency: 3,
      offsetX: 0.17,
      offsetY: -0.08,
      seedOffset: 53,
      cutoff: 0,
      sides: { N: false, E: false, S: true, W: false },
      transforms: structuredClone(DEFAULT_TRANSFORMS),
    },
    {
      id: "foam",
      name: "Foam",
      detail: "Broken fringe",
      kind: "band",
      pattern: "foam",
      color: "#d8e1d2",
      accent: "#76aaa1",
      enabled: true,
      width: 0.036,
      feather: 0.018,
      taper: 0.72,
      ...structuredClone(EDGE_DEFAULTS),
      placement: "outer",
      distanceOffset: 0.018,
      innerFade: 0.018,
      outerFade: 0.034,
      fadeCurve: "soft",
      innerContour: { mode: "wave", amplitude: 0.01, frequency: 7, phase: 0.18 },
      outerContour: { mode: "scallop", amplitude: 0.018, frequency: 8, phase: 0.54 },
      relief: 0.18,
      reliefStrength: 0.26,
      opacity: 0.86,
      scale: 2,
      roughness: 0.58,
      frequency: 6,
      offsetX: 0,
      offsetY: 0,
      seedOffset: 71,
      cutoff: 0,
      sides: { ...ALL_DIRECTIONS },
      transforms: structuredClone(DEFAULT_TRANSFORMS),
    },
    {
      id: "water",
      name: "Water",
      detail: "Deep teal",
      kind: "outside",
      pattern: "water",
      color: "#17464b",
      accent: "#2d7372",
      enabled: true,
      width: 0,
      feather: 0.012,
      taper: 0,
      ...structuredClone(EDGE_DEFAULTS),
      opacity: 1,
      scale: 1,
      roughness: 0.16,
      frequency: 2,
      offsetX: 0,
      offsetY: 0,
      seedOffset: 89,
      cutoff: 0,
      sides: { ...ALL_DIRECTIONS },
      transforms: structuredClone(DEFAULT_TRANSFORMS),
    },
  ],
};

export function createBlankRecipe(name = "Untitled Terrain"): TerrainRecipe {
  const recipe = structuredClone(DEFAULT_RECIPE);
  recipe.name = name;
  recipe.semantics.terrainId = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "terrain";
  recipe.semantics.transitionGroup = "default";
  recipe.semantics.transitionPriority = 0;
  recipe.selectedLayerId = "surface";
  recipe.overrides = {};
  recipe.overrideSettings = {};
  recipe.shape.seed = 47;
  recipe.shape.transparentBackground = true;
  recipe.shape.tileSize = 64;
  recipe.shape.thickness = 1;
  recipe.shape.roughness = 0;
  recipe.shape.deformationMode = "straight";
  recipe.shape.deformationPhase = 0;
  recipe.shape.edgeDeformations = [];
  recipe.shape.outerRadius = 0.5;
  recipe.shape.innerRadius = 0.5;
  recipe.variants = {
    count: 1,
    contourVariation: 0,
    textureVariation: 0,
    colorVariation: 0,
    weights: [100],
  };
  recipe.artDirection = {
    saturation: 1,
    contrast: 1,
    temperature: 0,
    exposure: 0,
    normalStrength: 1,
    heightScale: 1,
    aoStrength: 1,
    lightAngle: 315,
    lightElevation: 0.58,
    lightIntensity: 0.9,
    ambientLight: 0.48,
    lightColor: "#ffffff",
  };
  const surface = recipe.layers.find((layer) => layer.kind === "inside")!;
  const background = [...recipe.layers].reverse().find((layer) => layer.kind === "outside")!;
  const innerBorder = recipe.layers.find((layer) => layer.id === "lip")!;
  recipe.layers = [
    { ...surface, name: "Surface", detail: "Blank base", color: "#839615", accent: "#839615", scale: 1, roughness: 0, frequency: 1, feather: 0, innerContour: structuredClone(DEFAULT_CONTOUR), outerContour: structuredClone(DEFAULT_CONTOUR) },
    {
      ...innerBorder,
      id: "inner-border",
      name: "Inner border",
      detail: "20% straight border",
      color: "#ffe868",
      accent: "#ffe868",
      width: 0.2,
      placement: "inner",
      distanceOffset: 0,
      innerFade: 0,
      outerFade: 0,
      fadeInward: 0,
      feather: 0,
      taper: 0,
      cutoff: 0,
      roughness: 0,
      frequency: 1,
      innerContour: structuredClone(DEFAULT_CONTOUR),
      outerContour: structuredClone(DEFAULT_CONTOUR),
      relief: 0,
      reliefStrength: 0,
      cliffEnabled: false,
      cliffFaceOnly: false,
      scale: 1,
      sides: { ...ALL_DIRECTIONS },
    },
    {
      ...recipe.layers.find((layer) => layer.id === "cliff")!,
      id: "cliff",
      name: "Cliff",
      detail: "Projected texture face",
      enabled: false,
      pattern: "custom",
      color: "#542d20",
      accent: "#542d20",
      placement: "inner",
      width: 0.08,
      fadeInward: 0,
      cliffEnabled: true,
      cliffFaceOnly: true,
      cliffOverlap: 0,
      cliffDirection: "S",
      cliffHeightSteps: DEFAULT_CLIFF_HEIGHT_STEPS,
      cliffOffsetX: 0,
      cliffOffsetY: 0,
      cliffShear: 0,
      cliffShadow: 0,
      shadowOpacity: 0.85,
      shadowDistance: 0.3,
      shadowAngle: 90,
      shadowBlur: 0.1,
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      roughness: 0,
      frequency: 1,
      sides: { N: false, E: false, S: true, W: false },
      innerContour: structuredClone(DEFAULT_CONTOUR),
      outerContour: structuredClone(DEFAULT_CONTOUR),
    },
    { ...background, name: "Background", detail: "Transparent", color: "#263438", accent: "#34484b", roughness: 0, frequency: 1, feather: 0, innerContour: structuredClone(DEFAULT_CONTOUR), outerContour: structuredClone(DEFAULT_CONTOUR) },
  ];
  recipe.stackOrder = "top-first";
  recipe.selectedLayerId = "surface";
  return recipe;
}

/**
 * A production-oriented Blob 47 starting point. The artistic contour keeps a
 * shared border signature for every variant, so Godot may mix the alternatives
 * without exposing seams, while the center of each tile retains authored-looking
 * capes, coves and chiselled secondary detail.
 */
export function createArtisticCoastRecipe(name = "Artistic Coast"): TerrainRecipe {
  const recipe = structuredClone(DEFAULT_RECIPE);
  recipe.name = name;
  recipe.topology = "blob47";
  recipe.dualDiagonal = "separate";
  recipe.overrides = {};
  recipe.overrideSettings = {};
  recipe.shape = {
    ...recipe.shape,
    tileSize: 128,
    thickness: 0.68,
    outerRadius: 0.24,
    innerRadius: 0.24,
    roughness: 1.35,
    frequency: 0.8,
    deformationMode: "artistic",
    deformationPhase: 0.17,
    organicOffset: 0.19,
    organicOctaves: 5,
    organicPersistence: 0.42,
    seed: 7301,
  };
  recipe.variants = {
    count: 4,
    contourVariation: 0.34,
    textureVariation: 0.4,
    colorVariation: 0.06,
    weights: [40, 30, 20, 10],
  };
  const cliff = recipe.layers.find((layer) => layer.cliffEnabled);
  if (cliff) {
    cliff.cliffHeightSteps = 0.75;
    cliff.cliffDirectional = true;
    cliff.cliffSideDepth = 0.8;
    cliff.cliffRearDepth = 0;
    cliff.cliffPatternSizePx = recipe.shape.tileSize;
    cliff.cliffTextureOffsetXPx = 0;
    cliff.cliffCrownEnabled = false;
    cliff.cliffCrownWidthPx = automaticCliffCrownWidth(recipe.shape.tileSize, recipe.shape.tileSize, recipe.shape.tileSize);
    cliff.cliffCrownPatternSizePx = recipe.shape.tileSize;
    cliff.cliffSideTextureScale = 1;
    cliff.cliffDirectionalLight = 0;
    cliff.cliffMacroVariation = 0;
    cliff.cliffDetailDensity = 0.18;
    cliff.cliffDetailStrength = 0.42;
    cliff.shadowOpacity = 0.65;
    cliff.shadowDistance = 0.1;
    cliff.shadowBlur = 0.06;
  }
  return recipe;
}

export function cloneRecipe(recipe: TerrainRecipe): TerrainRecipe {
  return structuredClone(recipe);
}

export function appendInnerBorder(recipe: TerrainRecipe, name = "Inner border", detail = "below previous", id = `inner-border-${Date.now()}`): TerrainRecipe {
  const next = cloneRecipe(recipe);
  const borders = next.layers.filter((layer) => layer.kind === "band" && !layer.cliffFaceOnly && !layer.cliffEnabled);
  const source = borders[borders.length - 1]
    ?? createBlankRecipe().layers.find((layer) => layer.id === "inner-border");
  if (!source) return next;
  const width = borders.length === 0
    ? 0.2
    : Math.min(1, Math.round((source.width + 0.1) * 100) / 100);
  const layer = structuredClone(source);
  Object.assign(layer, {
    id,
    name: `${name} ${borders.length + 1}`,
    detail: `${Math.round(width * 100)}% · ${detail}`,
    width,
    placement: "inner",
    fadeInward: 0,
    textureUrl: undefined,
    textureName: undefined,
    cliffCrownTextureUrl: undefined,
    cliffCrownTextureName: undefined,
    cliffSideTextureUrl: undefined,
    cliffSideTextureName: undefined,
    cliffRearTextureUrl: undefined,
    cliffRearTextureName: undefined,
    cliffDetailTextureUrl: undefined,
    cliffDetailTextureName: undefined,
    color: "#d5b75d",
    accent: "#d5b75d",
    scale: 1,
    edgeDeformations: [],
    cliffEnabled: false,
    cliffFaceOnly: false,
  });
  const lastBorderIndex = next.layers.reduce((last, item, index) => item.kind === "band" && !item.cliffFaceOnly && !item.cliffEnabled ? index : last, -1);
  const cliffIndex = next.layers.findIndex((item) => item.cliffFaceOnly || item.cliffEnabled);
  const insertionIndex = lastBorderIndex >= 0 ? lastBorderIndex + 1 : cliffIndex >= 0 ? cliffIndex : Math.max(1, next.layers.length - 1);
  next.layers.splice(insertionIndex, 0, layer);
  next.selectedLayerId = id;
  next.stackOrder = "top-first";
  return next;
}

export function appendCliffLayer(recipe: TerrainRecipe, name = "Cliff", id = `cliff-${Date.now()}`): TerrainRecipe {
  const next = cloneRecipe(recipe);
  const template = createBlankRecipe().layers.find((layer) => layer.cliffEnabled);
  if (!template) return next;
  const cliffs = next.layers.filter((layer) => layer.cliffEnabled);
  if (cliffs.length > 0) {
    next.selectedLayerId = cliffs[0].id;
    return next;
  }
  const layer = structuredClone(template);
  Object.assign(layer, {
    id,
    name,
    detail: "Front face",
    enabled: true,
    cliffEnabled: true,
    cliffFaceOnly: true,
    cliffDirection: "S",
    cliffHeightSteps: DEFAULT_CLIFF_HEIGHT_STEPS,
    cliffPatternSizePx: next.shape.tileSize,
    cliffTextureOffsetXPx: 0,
    cliffCrownEnabled: false,
    cliffCrownWidthPx: automaticCliffCrownWidth(next.shape.tileSize, next.shape.tileSize, next.shape.tileSize),
    cliffCrownPatternSizePx: next.shape.tileSize,
    edgeDeformations: [],
    cliffOverlap: 0,
    textureUrl: undefined,
    textureName: undefined,
    cliffCrownTextureUrl: undefined,
    cliffCrownTextureName: undefined,
    cliffSideTextureUrl: undefined,
    cliffSideTextureName: undefined,
    cliffRearTextureUrl: undefined,
    cliffRearTextureName: undefined,
    cliffDetailTextureUrl: undefined,
    cliffDetailTextureName: undefined,
  });
  const outsideIndex = next.layers.findIndex((item) => item.kind === "outside");
  next.layers.splice(outsideIndex >= 0 ? outsideIndex : next.layers.length, 0, layer);
  next.selectedLayerId = id;
  next.stackOrder = "top-first";
  return next;
}

export function normalizeRecipe(input: TerrainRecipe): TerrainRecipe {
  const recipe = cloneRecipe(input);
  recipe.schemaVersion = 3;
  const legacyLayerOrder = recipe.stackOrder !== "top-first";
  recipe.createdWith = "Tesserae";
  recipe.semantics ??= {
    terrainId: "terrain",
    transitionGroup: "default",
    transitionPriority: 0,
    physicsEnabled: false,
    navigationEnabled: false,
    occlusionEnabled: false,
    walkable: true,
    surfaceType: "terrain",
    footstep: "default",
    movementCost: 1,
  };
  recipe.semantics.terrainId = recipe.semantics.terrainId?.trim() || recipe.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "terrain";
  recipe.semantics.transitionGroup = recipe.semantics.transitionGroup?.trim() || "default";
  recipe.semantics.transitionPriority = Math.round(Number.isFinite(recipe.semantics.transitionPriority) ? recipe.semantics.transitionPriority : 0);
  recipe.semantics.physicsEnabled = Boolean(recipe.semantics.physicsEnabled);
  recipe.semantics.navigationEnabled = Boolean(recipe.semantics.navigationEnabled);
  recipe.semantics.occlusionEnabled = Boolean(recipe.semantics.occlusionEnabled);
  recipe.semantics.walkable = recipe.semantics.walkable !== false;
  recipe.semantics.surfaceType = recipe.semantics.surfaceType?.trim() || "terrain";
  recipe.semantics.footstep = recipe.semantics.footstep?.trim() || "default";
  recipe.semantics.movementCost = Math.max(0, Number.isFinite(recipe.semantics.movementCost) ? recipe.semantics.movementCost : 1);
  recipe.patterns = Array.isArray(recipe.patterns) ? recipe.patterns.map((pattern) => ({
    id: String(pattern.id),
    name: pattern.name?.trim() || "Pattern",
    width: Math.max(1, Math.min(32, Math.round(pattern.width || 1))),
    height: Math.max(1, Math.min(32, Math.round(pattern.height || 1))),
    cells: Array.isArray(pattern.cells) ? pattern.cells.map((cell) => ({
      x: Math.max(0, Math.round(cell.x)),
      y: Math.max(0, Math.round(cell.y)),
      mask: Math.max(0, Math.round(cell.mask)),
    })) : [],
  })) : [];
  recipe.topology ??= "blob47";
  recipe.dualDiagonal ??= "separate";
  recipe.shape.tileSize = Math.max(8, Math.min(512, Math.round(
    Number.isFinite(recipe.shape.tileSize) ? recipe.shape.tileSize : 64,
  )));
  recipe.overrides ??= {};
  recipe.overrideSettings = Object.fromEntries(Object.entries(recipe.overrideSettings ?? {}).map(([mask, settings]) => {
    const tileLimit = Math.max(0, Math.floor(recipe.shape.tileSize / 2) - 1);
    const mode = settings?.mode === "safe-center" ? "safe-center" : "replace";
    const insetPx = Math.max(0, Math.min(tileLimit, Math.round(Number.isFinite(settings?.insetPx) ? settings.insetPx : recipe.shape.tileSize / 8)));
    const featherPx = Math.max(0, Math.min(16, Math.round(Number.isFinite(settings?.featherPx) ? settings.featherPx : 0)));
    return [mask, { mode, insetPx, featherPx }];
  }));
  recipe.productionProfile = ["free", "pixel-strict", "orthogonal-90"].includes(recipe.productionProfile) ? recipe.productionProfile : "free";
  recipe.shape.transparentBackground ??= false;
  recipe.shape.outputMode = ["cutout-inside", "cutout-outside"].includes(recipe.shape.outputMode)
    ? recipe.shape.outputMode
    : "composite";
  const cutoutExtrusion = Number.isFinite(recipe.shape.cutoutExtrusion) ? recipe.shape.cutoutExtrusion : 0;
  recipe.shape.cutoutExtrusion = Math.max(0, Math.min(1, cutoutExtrusion));
  recipe.shape.mergePoint ??= 0.5;
  recipe.shape.outerRadius = Math.max(0, Math.min(0.5, Number.isFinite(recipe.shape.outerRadius) ? recipe.shape.outerRadius : 0));
  // The editor exposes one roundness control. Keeping a second, hidden rate
  // made concave and convex corners evolve differently (historically 84%).
  // Normalize legacy recipes so 0% is square everywhere and 100% is the
  // maximum circular corner everywhere.
  recipe.shape.innerRadius = recipe.shape.outerRadius;
  recipe.shape.deformationMode ??= recipe.shape.roughness > 0 ? "organic" : "straight";
  recipe.shape.roughness = Math.max(0, Math.min(MAX_EDGE_DEFORMATION, Number.isFinite(recipe.shape.roughness) ? recipe.shape.roughness : 0));
  const usesOrganicFrequency = recipe.shape.deformationMode === "organic" || recipe.shape.deformationMode === "artistic";
  const shapeFrequency = Number.isFinite(recipe.shape.frequency) ? recipe.shape.frequency : usesOrganicFrequency ? 2 : 3;
  recipe.shape.frequency = usesOrganicFrequency
    ? Math.max(0.25, Math.min(2, shapeFrequency))
    : Math.max(1, Math.min(12, shapeFrequency));
  recipe.shape.deformationPhase = Math.max(0, Math.min(1, recipe.shape.deformationPhase ?? 0));
  const organicOffset = Number.isFinite(recipe.shape.organicOffset) ? recipe.shape.organicOffset : 0;
  recipe.shape.organicOffset = Math.max(0, Math.min(1, organicOffset));
  const organicOctaves = Number.isFinite(recipe.shape.organicOctaves) ? recipe.shape.organicOctaves : 4;
  const organicPersistence = Number.isFinite(recipe.shape.organicPersistence) ? recipe.shape.organicPersistence : 0.5;
  recipe.shape.organicOctaves = Math.max(1, Math.min(6, Math.round(organicOctaves)));
  recipe.shape.organicPersistence = Math.max(0, Math.min(1, organicPersistence));
  const legacyShapeEffect = recipe.shape.deformationMode !== "straight" && recipe.shape.roughness > 0
    ? [{
      id: "edge-1",
      mode: recipe.shape.deformationMode,
      // The legacy terrain control used 8% of a tile at 100%. The new stack
      // uses 2%, so multiplying by four preserves existing renders.
      amount: Math.min(MAX_EDGE_DEFORMATION, recipe.shape.roughness * 4),
      frequency: recipe.shape.frequency,
      phase: recipe.shape.deformationMode === "wave" ? recipe.shape.deformationPhase : recipe.shape.organicOffset,
    }]
    : [];
  recipe.shape.edgeDeformations = (Array.isArray(recipe.shape.edgeDeformations) && recipe.shape.edgeDeformations.length > 0
    ? recipe.shape.edgeDeformations
    : legacyShapeEffect).slice(0, 12).map((deformation, index) => ({
    id: typeof deformation?.id === "string" && deformation.id ? deformation.id : `edge-${index + 1}`,
    mode: (["organic", "wave", "artistic", "scallop", "fractured"] as const).includes(deformation?.mode as "organic")
      ? deformation.mode
      : "organic",
    amount: Math.max(0, Math.min(MAX_EDGE_DEFORMATION, Number.isFinite(deformation?.amount) ? deformation.amount : 0.5)),
    frequency: Math.max(0.25, Math.min(
      edgeFrequencyLimitForMode(deformation.mode, recipe.shape.tileSize),
      Number.isFinite(deformation?.frequency) ? deformation.frequency : 2,
    )),
    phase: Math.max(0, Math.min(1, Number.isFinite(deformation?.phase) ? deformation.phase : 0)),
  }));
  recipe.artDirection ??= {
    saturation: 1,
    contrast: 1,
    temperature: 0,
    exposure: 0,
    normalStrength: 1,
    heightScale: 1,
    aoStrength: 1,
    lightAngle: 315,
    lightElevation: 0.58,
    lightIntensity: 0.9,
    ambientLight: 0.48,
    lightColor: "#ffffff",
  };
  recipe.artDirection.lightAngle ??= 315;
  recipe.artDirection.lightElevation ??= 0.58;
  recipe.artDirection.lightIntensity ??= 0.9;
  recipe.artDirection.ambientLight ??= 0.48;
  recipe.artDirection.lightColor ??= "#ffffff";
  recipe.variants.weights ??= Array.from({ length: recipe.variants.count }, () => 100 / recipe.variants.count);
  recipe.variants.weights = Array.from(
    { length: recipe.variants.count },
    (_, index) => recipe.variants.weights[index] ?? 1,
  );
  recipe.layers = recipe.layers.map((layer) => {
    const cleanLayer = { ...layer } as MaterialLayer & Record<string, unknown>;
    for (const key of ["innerShadowEnabled", "innerShadowColor", "innerShadowOpacity", "innerShadowDistance", "innerShadowAngle", "innerShadowBlur", "innerShadowAffectsAo"]) delete cleanLayer[key];
    const placement: EdgePlacement = layer.placement ?? (
      layer.id === "sand" || layer.id === "lip" ? "inner" : layer.id === "foam" ? "outer" : "center"
    );
    // Early Tesserae recipes identified the structural cliff through its
    // canonical id / face-only flag, before `cliffEnabled` was persisted.
    // A later normalization pass wrote `false` and silently turned those
    // existing cliffs into ordinary inner borders. Restore that contract.
    const cliffEnabled = layer.kind === "band" && Boolean(
      layer.cliffEnabled
      || layer.cliffFaceOnly
      || layer.id === "cliff"
    );
    const genericCliffShadow = cliffEnabled && (
      (layer.shadowOpacity === 0.75 && layer.shadowDistance === 0.18)
      ||
      (layer.shadowOpacity === 0.7 && layer.shadowDistance === 0.12)
      || (layer.shadowOpacity === 0.55 && layer.shadowDistance === 0.08)
      || (layer.shadowOpacity === 0.35 && layer.shadowDistance === 0.04)
      || layer.shadowOpacity === undefined
      || layer.shadowDistance === undefined
    );
    const legacyAmplitude = layer.kind === "band" ? Math.min(0.025, layer.roughness * 0.025) : 0;
    const detail = cliffEnabled && /hidden under terrain|starts at 50|masqu.+sous le terrain/i.test(layer.detail)
      ? "Projected texture face"
      : layer.detail;
    const usesLegacyCliffDefaults = cliffEnabled
      && layer.cliffSideDepth === 0.34
      && layer.cliffRearDepth === 0.08
      && layer.cliffSideTextureScale === 0.62
      && layer.cliffDirectionalLight === 0.35;
    const cliffPatternSizePx = Math.max(4, Math.min(32768, Math.round(
      usesLegacyCliffDefaults && layer.cliffPatternSizePx === 96 ? recipe.shape.tileSize : layer.cliffPatternSizePx ?? recipe.shape.tileSize,
    )));
    const cliffHeightSteps = normalizeCliffHeight(layer.cliffHeightSteps ?? DEFAULT_CLIFF_HEIGHT_STEPS, recipe.shape.tileSize);
    const maximumDirectionalDepthRatio = 4 / cliffHeightSteps;
    return {
      ...structuredClone(EDGE_DEFAULTS),
      ...cleanLayer,
      detail,
      cutoff: layer.cutoff ?? 0,
      taper: layer.taper ?? 0,
      placement,
      distanceOffset: layer.distanceOffset ?? (layer.id === "sand" ? -0.045 : layer.id === "foam" ? 0.018 : 0),
      innerFade: layer.innerFade ?? layer.feather ?? 0.012,
      outerFade: layer.outerFade ?? Math.max(layer.feather ?? 0.012, (layer.taper ?? 0) * layer.width * 0.5),
      fadeInward: Math.max(0, Math.min(1, layer.fadeInward ?? 0)),
      fadeCurve: layer.fadeCurve ?? "smooth",
      innerContour: layer.innerContour ?? { mode: legacyAmplitude > 0 ? "organic" : "straight", amplitude: legacyAmplitude, frequency: layer.frequency, phase: 0.17 },
      outerContour: layer.outerContour ?? { mode: legacyAmplitude > 0 ? "organic" : "straight", amplitude: legacyAmplitude, frequency: layer.frequency + 1, phase: 0.63 },
      edgeDeformations: Array.isArray(layer.edgeDeformations)
        ? layer.edgeDeformations.slice(0, 12).map((deformation, index) => ({
          id: typeof deformation?.id === "string" && deformation.id ? deformation.id : `edge-${index + 1}`,
          mode: (["organic", "wave", "artistic", "scallop", "fractured"] as const).includes(deformation?.mode as "organic")
            ? deformation.mode
            : "organic",
          amount: Math.max(0, Math.min(MAX_LAYER_EDGE_DEFORMATION, Number.isFinite(deformation?.amount) ? deformation.amount : 1)),
          frequency: Math.max(0.25, Math.min(
            edgeFrequencyLimitForMode(deformation.mode, recipe.shape.tileSize),
            Number.isFinite(deformation?.frequency) ? deformation.frequency : 2,
          )),
          phase: Math.max(0, Math.min(1, Number.isFinite(deformation?.phase) ? deformation.phase : 0)),
        }))
        : [],
      relief: layer.relief ?? (layer.pattern === "rock" ? 0.7 : 0),
      reliefStrength: layer.reliefStrength ?? (layer.pattern === "rock" ? 0.7 : 0.3),
      reliefAngle: layer.reliefAngle ?? 315,
      reliefSoftness: layer.reliefSoftness ?? 0.5,
      cliffEnabled,
      cliffDirection: layer.cliffDirection ?? "S",
      cliffHeightSteps,
      cliffDirectional: layer.cliffDirectional ?? true,
      cliffSideDepth: Math.max(0, Math.min(maximumDirectionalDepthRatio, usesLegacyCliffDefaults ? 0.8 : layer.cliffSideDepth ?? 0.8)),
      cliffRearDepth: Math.max(0, Math.min(maximumDirectionalDepthRatio, usesLegacyCliffDefaults ? 0 : layer.cliffRearDepth ?? 0)),
      cliffPatternSizePx,
      cliffTextureOffsetXPx: Math.max(
        -cliffPatternSizePx,
        Math.min(
          cliffPatternSizePx,
          Number.isFinite(layer.cliffTextureOffsetXPx) ? Math.round(layer.cliffTextureOffsetXPx) : 0,
        ),
      ),
      cliffInteriorEnabled: layer.cliffInteriorEnabled ?? false,
      cliffInteriorColor: /^#[0-9a-f]{6}$/i.test(layer.cliffInteriorColor ?? "") ? layer.cliffInteriorColor : "#4b342b",
      cliffVerticalSampling: layer.cliffVerticalSampling ?? "preserve",
      cliffCrownEnabled: layer.cliffCrownEnabled ?? true,
      cliffCrownWidthPx: Math.max(2, Math.min(recipe.shape.tileSize * 0.5, Math.round(
        layer.cliffCrownWidthPx ?? automaticCliffCrownWidth(recipe.shape.tileSize, recipe.shape.tileSize, recipe.shape.tileSize),
      ))),
      cliffCrownPatternSizePx: Math.max(4, Math.min(32768, Math.round(layer.cliffCrownPatternSizePx ?? recipe.shape.tileSize))),
      // Retained in the recipe schema so older files remain readable. The
      // renderer now uses one faithful output-pixel mapping for every face.
      cliffSideTextureScale: 1,
      cliffDirectionalLight: 0,
      cliffMacroVariation: 0,
      cliffDetailDensity: Math.max(0, Math.min(1, layer.cliffDetailDensity ?? 0.18)),
      cliffDetailStrength: Math.max(0, Math.min(1, layer.cliffDetailStrength ?? 0.42)),
      cliffOffsetX: layer.cliffOffsetX ?? 0,
      cliffOffsetY: layer.cliffOffsetY ?? 0,
      cliffShear: layer.cliffShear ?? 0,
      cliffShadow: layer.cliffShadow ?? 0.35,
      cliffFaceOnly: cliffEnabled ? true : layer.cliffFaceOnly ?? false,
      cliffOverlap: 0,
      shadowEnabled: layer.shadowEnabled ?? false,
      shadowColor: layer.shadowColor ?? "#000000",
      shadowOpacity: Math.max(0, Math.min(1, genericCliffShadow ? 0.85 : layer.shadowOpacity ?? 0.7)),
      shadowDistance: Math.max(0, Math.min(MAX_SHADOW_DISTANCE, genericCliffShadow ? 0.3 : layer.shadowDistance ?? 0.12)),
      shadowAngle: (((genericCliffShadow ? 90 : layer.shadowAngle ?? 45)) % 360 + 360) % 360,
      shadowBlur: Math.max(0, Math.min(MAX_SHADOW_BLUR, genericCliffShadow ? 0.1 : layer.shadowBlur ?? 0.05)),
      shadowAffectsAo: layer.shadowAffectsAo ?? true,
      brightness: Math.max(-1, Math.min(1, Number.isFinite(layer.brightness) ? layer.brightness : 0)),
      scale: ([0.125, 0.25, 0.5, 1, 2, 4, 8] as number[]).includes(layer.scale) ? layer.scale : 1,
      transforms: layer.transforms ?? structuredClone(DEFAULT_TRANSFORMS),
    };
  });
  if (legacyLayerOrder) {
    const inside = recipe.layers.filter((layer) => layer.kind === "inside");
    const bands = recipe.layers.filter((layer) => layer.kind === "band").reverse();
    const outside = recipe.layers.filter((layer) => layer.kind === "outside");
    recipe.layers = [...inside, ...bands, ...outside];
  }
  const cliffLayers = recipe.layers.filter((layer) => layer.cliffEnabled);
  if (cliffLayers.length > 0) {
    const downwardCliff = cliffLayers.find((layer) => layer.cliffDirection === "S") ?? cliffLayers[0];
    const removedCliffIds = new Set(cliffLayers.filter((layer) => layer.id !== downwardCliff.id).map((layer) => layer.id));
    recipe.layers = recipe.layers.filter((layer) => !removedCliffIds.has(layer.id));
    downwardCliff.cliffDirection = "S";
    downwardCliff.sides = { N: false, E: false, S: true, W: false };
    if (/perspective|back face/i.test(downwardCliff.detail)) downwardCliff.detail = "Front face";
    if (removedCliffIds.has(recipe.selectedLayerId)) recipe.selectedLayerId = downwardCliff.id;
  }
  recipe.stackOrder = "top-first";
  return recipe;
}
