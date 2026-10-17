const TAU = Math.PI * 2;

function fract(value: number): number {
  return value - Math.floor(value);
}

export function hash(seed: number): number {
  return fract(Math.sin(seed * 127.1 + 311.7) * 43758.5453123);
}

function samplePeriodicBase(
  x: number,
  y: number,
  period: number,
  seed: number,
  base: number,
  octaves: number,
  persistence: number,
): number {
  let value = 0;
  let amplitude = 1;
  let total = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    const f = base * 2 ** octave;
    const phaseA = hash(seed + octave * 17) * TAU;
    const phaseB = hash(seed + octave * 31 + 9) * TAU;
    const phaseC = hash(seed + octave * 47 + 13) * TAU;
    const nx = (TAU * f * x) / period;
    const ny = (TAU * f * y) / period;
    const wave =
      Math.sin(nx + phaseA) * Math.cos(ny + phaseB) * 0.52 +
      Math.sin(nx + ny + phaseC) * 0.28 +
      Math.cos(nx - ny + phaseB) * 0.2;
    value += wave * amplitude;
    total += amplitude;
    amplitude *= persistence;
  }
  return total === 0 ? 0 : value / total;
}

export function periodicNoise(
  x: number,
  y: number,
  period: number,
  seed: number,
  frequency = 3,
  octaves = 3,
  persistence = 0.5,
): number {
  const detailPersistence = Math.max(0, Math.min(1, persistence));
  const continuousFrequency = Math.max(0, frequency);
  const lowerBase = Math.floor(continuousFrequency);
  const upperBase = Math.ceil(continuousFrequency);

  const lower = samplePeriodicBase(x, y, period, seed, lowerBase, octaves, detailPersistence);
  if (lowerBase === upperBase) return lower;
  const linearMix = continuousFrequency - lowerBase;
  const smoothMix = linearMix * linearMix * (3 - 2 * linearMix);
  const upper = samplePeriodicBase(x, y, period, seed, upperBase, octaves, detailPersistence);
  return lower + (upper - lower) * smoothMix;
}

/**
 * Periodic, art-directed coastline signal. Broad asymmetric lobes create the
 * main capes and coves; a ridged mid-band adds deliberate-looking cuts; fine
 * noise only breaks the silhouette instead of defining it. The function is
 * periodic on both axes, which makes it safe on auto-tile borders.
 */
export function periodicCoastMotif(
  x: number,
  y: number,
  period: number,
  seed: number,
  featureScale = 0.8,
  octaves = 5,
  persistence = 0.42,
): number {
  const safePeriod = Math.max(1, period);
  const scale = Math.max(0.25, featureScale);
  const u = x / safePeriod;
  const v = y / safePeriod;
  const phaseA = hash(seed + 17) * TAU;
  const phaseB = hash(seed + 41) * TAU;
  const phaseC = hash(seed + 83) * TAU;
  const primaryHarmonic = Math.max(1, Math.round(scale));
  const chiselHarmonic = Math.max(2, Math.round(scale * 2));

  const broad = periodicNoise(x, y, safePeriod, seed + 101, scale, 2, 0.48);
  const directional =
    Math.sin(TAU * primaryHarmonic * (u + v) + phaseA) * 0.56
    + Math.cos(TAU * primaryHarmonic * (v - u) + phaseB) * 0.44;
  const middle = periodicNoise(x, y, safePeriod, seed + 307, scale * 2.15, Math.max(2, octaves - 2), persistence);
  const ridgeSource = periodicNoise(x, y, safePeriod, seed + 613, scale * 3.6, 2, 0.38);
  const ridge = Math.sign(ridgeSource) * Math.pow(Math.abs(ridgeSource), 0.58);
  const chisel = Math.sin(TAU * chiselHarmonic * (u - v) + phaseC + middle * 1.8);
  const fine = periodicNoise(x, y, safePeriod, seed + 997, scale * 6.2, Math.max(1, octaves - 3), persistence * 0.72);

  return Math.max(-1, Math.min(1,
    broad * 0.46
    + directional * 0.18
    + middle * 0.2
    + ridge * 0.1
    + chisel * 0.035
    + fine * 0.055,
  ));
}

/** Zero on every tile edge, smoothly reaching one toward the tile center. */
export function artisticVariantInteriorWeight(x: number, y: number, size: number): number {
  const period = Math.max(1, size - 1);
  const edgeDistance = Math.min(x, y, period - x, period - y);
  return smoothstep(period * 0.08, period * 0.24, edgeDistance);
}

export function seededJitter(seed: number, index: number): number {
  return hash(seed * 1.371 + index * 73.17) * 2 - 1;
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
