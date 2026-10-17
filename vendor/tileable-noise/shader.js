const VERTEX_SHADER = `#version 300 es
in vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;

uniform vec2 uResolution;
uniform vec2 uTorusRadii;
uniform int uNoiseType;
uniform int uFractalType;
uniform int uSeed;
uniform float uScale;
uniform int uOctaves;
uniform float uPersistence;
uniform float uLacunarity;
uniform bool uWarpEnabled;
uniform float uWarpStrength;
uniform float uWarpScale;
uniform int uPalette;
uniform float uContrast;
uniform bool uMaskEnabled;
uniform float uThreshold;
uniform bool uInvertMask;
uniform float uBandDensity;
uniform float uBandWidth;
uniform sampler2D uReactionTexture;

out vec4 fragColor;

uint hash4(ivec4 p, uint seed) {
  uint h = seed ^ uint(p.x) * 0x27d4eb2du ^ uint(p.y) * 0x165667b1u
    ^ uint(p.z) * 0x1b873593u ^ uint(p.w) * 0x85ebca6bu;
  h = (h ^ (h >> 15u)) * 0x2c1b3c6du;
  h = (h ^ (h >> 12u)) * 0x297a2d39u;
  return h ^ (h >> 15u);
}

float random01(ivec4 p, uint seed) {
  return float(hash4(p, seed)) / 4294967295.0;
}

vec4 fade4(vec4 t) {
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

vec4 gradient4(uint h) {
  vec4 gradient = vec4(
    (h & 4u) == 0u ? 1.0 : -1.0,
    (h & 8u) == 0u ? 1.0 : -1.0,
    (h & 16u) == 0u ? 1.0 : -1.0,
    (h & 32u) == 0u ? 1.0 : -1.0
  );
  gradient[int(h & 3u)] = 0.0;
  return gradient * 0.57735026919;
}

float perlin4(vec4 point, uint seed) {
  ivec4 cell = ivec4(floor(point));
  vec4 local = fract(point);
  vec4 eased = fade4(local);
  float result = 0.0;

  for (int corner = 0; corner < 16; corner++) {
    ivec4 offset = ivec4(corner & 1, (corner >> 1) & 1, (corner >> 2) & 1, (corner >> 3) & 1);
    vec4 weights = mix(1.0 - eased, eased, vec4(offset));
    float weight = weights.x * weights.y * weights.z * weights.w;
    result += weight * dot(gradient4(hash4(cell + offset, seed)), local - vec4(offset));
  }
  return result;
}

float value4(vec4 point, uint seed) {
  ivec4 cell = ivec4(floor(point));
  vec4 eased = fade4(fract(point));
  float result = 0.0;

  for (int corner = 0; corner < 16; corner++) {
    ivec4 offset = ivec4(corner & 1, (corner >> 1) & 1, (corner >> 2) & 1, (corner >> 3) & 1);
    vec4 weights = mix(1.0 - eased, eased, vec4(offset));
    float weight = weights.x * weights.y * weights.z * weights.w;
    result += weight * (random01(cell + offset, seed) * 2.0 - 1.0);
  }
  return result;
}

float worley4(vec4 point, uint seed) {
  ivec4 cell = ivec4(floor(point));
  float nearest = 100.0;

  for (int dw = -1; dw <= 1; dw++) {
    for (int dz = -1; dz <= 1; dz++) {
      for (int dy = -1; dy <= 1; dy++) {
        for (int dx = -1; dx <= 1; dx++) {
          ivec4 candidate = cell + ivec4(dx, dy, dz, dw);
          vec4 feature = vec4(candidate) + vec4(
            random01(candidate, seed),
            random01(candidate, seed + 1013u),
            random01(candidate, seed + 2027u),
            random01(candidate, seed + 3041u)
          );
          nearest = min(nearest, dot(point - feature, point - feature));
        }
      }
    }
  }
  return 1.0 - min(1.0, sqrt(nearest) / 1.35) * 2.0;
}

float baseNoise(vec4 point, uint seed, int noiseType) {
  if (noiseType == 1) return value4(point, seed);
  if (noiseType == 2) return worley4(point, seed);
  return perlin4(point, seed);
}

float fractalNoise(vec4 point, int seedOffset, int octaveCount, int noiseType, int fractalType) {
  float amplitude = 1.0;
  float frequency = 1.0;
  float sum = 0.0;
  float normalization = 0.0;

  for (int octave = 0; octave < 7; octave++) {
    if (octave >= octaveCount) break;
    float value = baseNoise(point * frequency, uint(uSeed + seedOffset + octave * 157), noiseType);
    if (fractalType == 1) value = 1.0 - abs(value);
    if (fractalType == 2) value = abs(value);
    sum += value * amplitude;
    normalization += amplitude;
    amplitude *= uPersistence;
    frequency *= uLacunarity;
  }

  float value = sum / normalization;
  return fractalType == 0 ? value : value * 2.0 - 1.0;
}

vec3 palette(float value) {
  if (uPalette == 4) return vec3(value);

  vec3 a;
  vec3 b;
  vec3 c;
  vec3 d;
  if (uPalette == 1) {
    a = vec3(0.090, 0.129, 0.102); b = vec3(0.259, 0.325, 0.227);
    c = vec3(0.659, 0.722, 0.424); d = vec3(0.933, 0.941, 0.773);
  } else if (uPalette == 2) {
    a = vec3(0.118, 0.090, 0.125); b = vec3(0.424, 0.161, 0.149);
    c = vec3(0.875, 0.416, 0.196); d = vec3(0.961, 0.859, 0.569);
  } else if (uPalette == 3) {
    a = vec3(0.027, 0.110, 0.149); b = vec3(0.086, 0.306, 0.388);
    c = vec3(0.318, 0.659, 0.627); d = vec3(0.847, 0.933, 0.882);
  } else {
    a = vec3(0.078, 0.125, 0.118); b = vec3(0.255, 0.314, 0.290);
    c = vec3(0.682, 0.718, 0.663); d = vec3(0.957, 0.941, 0.898);
  }

  if (value < 0.38) return mix(a, b, value / 0.38);
  if (value < 0.68) return mix(b, c, (value - 0.38) / 0.30);
  return mix(c, d, (value - 0.68) / 0.32);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5) / max(uResolution - 1.0, vec2(1.0));
  float tau = 6.28318530718;
  vec4 point = vec4(
    cos(tau * uv.x) * uTorusRadii.x,
    sin(tau * uv.x) * uTorusRadii.x,
    cos(tau * uv.y) * uTorusRadii.y,
    sin(tau * uv.y) * uTorusRadii.y
  ) * uScale;

  if (uWarpEnabled && uWarpStrength > 0.0) {
    vec4 warpPoint = point * uWarpScale;
    int warpOctaves = min(3, uOctaves);
    vec4 warp = vec4(
      fractalNoise(warpPoint, 4001, warpOctaves, 0, 0),
      fractalNoise(warpPoint, 5003, warpOctaves, 0, 0),
      fractalNoise(warpPoint, 6007, warpOctaves, 0, 0),
      fractalNoise(warpPoint, 7001, warpOctaves, 0, 0)
    );
    point += warp * uWarpStrength;
  }

  float raw;
  if (uNoiseType == 4) {
    raw = texture(uReactionTexture, uv).g * 2.0 - 1.0;
  } else if (uNoiseType == 3) {
    float substrate = fractalNoise(point, 0, uOctaves, 0, 0);
    float modulation = fractalNoise(point * 0.62, 9001, min(3, uOctaves), 0, 0);
    float bandDistance = abs(sin((substrate * uBandDensity + modulation * 0.8) * 3.14159265359));
    float bands = 1.0 - smoothstep(uBandWidth, min(1.0, uBandWidth + 0.14), bandDistance);
    raw = bands * 2.0 - 1.0;
  } else {
    raw = fractalNoise(point, 0, uOctaves, uNoiseType, uFractalType);
  }
  float value = clamp((raw * 0.5) * uContrast + 0.5, 0.0, 1.0);
  if (uMaskEnabled) {
    bool filled = uInvertMask ? value < uThreshold : value >= uThreshold;
    fragColor = vec4(filled ? vec3(0.078, 0.125, 0.118) : vec3(0.957, 0.941, 0.898), 1.0);
  } else {
    fragColor = vec4(palette(value), 1.0);
  }
}`;

const REACTION_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D uState;
uniform ivec2 uStateSize;
uniform float uFeed;
uniform float uKill;
out vec4 nextState;

vec2 stateAt(ivec2 offset) {
  ivec2 coordinate = ivec2(gl_FragCoord.xy) + offset;
  coordinate = ivec2(
    (coordinate.x % uStateSize.x + uStateSize.x) % uStateSize.x,
    (coordinate.y % uStateSize.y + uStateSize.y) % uStateSize.y
  );
  return texelFetch(uState, coordinate, 0).rg;
}

void main() {
  vec2 center = stateAt(ivec2(0));
  vec2 laplacian =
    stateAt(ivec2(-1, 0)) * 0.2 + stateAt(ivec2(1, 0)) * 0.2
    + stateAt(ivec2(0, -1)) * 0.2 + stateAt(ivec2(0, 1)) * 0.2
    + stateAt(ivec2(-1, -1)) * 0.05 + stateAt(ivec2(1, -1)) * 0.05
    + stateAt(ivec2(-1, 1)) * 0.05 + stateAt(ivec2(1, 1)) * 0.05
    - center;
  float reaction = center.x * center.y * center.y;
  float activator = center.x + laplacian.x - reaction + uFeed * (1.0 - center.x);
  float inhibitor = center.y + laplacian.y * 0.5 + reaction - (uKill + uFeed) * center.y;
  nextState = vec4(clamp(activator, 0.0, 1.0), clamp(inhibitor, 0.0, 1.0), 0.0, 1.0);
}`;

const NOISE_TYPES = { perlin: 0, value: 1, worley: 2, contours: 3, reaction: 4 };
const FRACTAL_TYPES = { fbm: 0, ridged: 1, turbulence: 2 };
const PALETTES = { ink: 0, lichen: 1, ember: 2, ocean: 3, mono: 4 };

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compilation failed: ${message}`);
  }
  return shader;
}

function createProgram(gl, fragmentSource) {
  const program = gl.createProgram();
  gl.attachShader(program, compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER));
  gl.attachShader(program, compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`Shader linking failed: ${gl.getProgramInfoLog(program)}`);
  }
  return program;
}

export class TileableNoiseRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: true,
    });
    if (!this.gl) throw new Error("Tileable Noise requires a browser with WebGL 2 support.");

    const gl = this.gl;
    this.supportsReaction = Boolean(gl.getExtension("EXT_color_buffer_float"));
    const program = createProgram(gl, FRAGMENT_SHADER);
    this.program = program;
    this.reactionProgram = createProgram(gl, REACTION_FRAGMENT_SHADER);

    const vertices = gl.createBuffer();
    this.vertices = vertices;
    gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    this.uniforms = {};
    [
      "uResolution", "uTorusRadii", "uNoiseType", "uFractalType", "uSeed", "uScale", "uOctaves",
      "uPersistence", "uLacunarity", "uWarpEnabled", "uWarpStrength", "uWarpScale",
      "uPalette", "uContrast", "uMaskEnabled", "uThreshold", "uInvertMask",
      "uBandDensity", "uBandWidth", "uReactionTexture",
    ].forEach((name) => {
      this.uniforms[name] = gl.getUniformLocation(program, name);
    });
    this.reactionUniforms = {
      state: gl.getUniformLocation(this.reactionProgram, "uState"),
      size: gl.getUniformLocation(this.reactionProgram, "uStateSize"),
      feed: gl.getUniformLocation(this.reactionProgram, "uFeed"),
      kill: gl.getUniformLocation(this.reactionProgram, "uKill"),
    };
    this.reaction = null;
  }

  resize(width, height) {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  render(settings) {
    const gl = this.gl;
    if (settings.noiseType === "reaction") {
      this.ensureReaction(settings);
      this.stepReaction(settings, settings.simulationSpeed);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program);
    this.bindVertices(this.program);
    gl.uniform2f(this.uniforms.uResolution, this.canvas.width, this.canvas.height);
    const shortestAxis = Math.min(settings.outputWidth, settings.outputHeight);
    gl.uniform2f(
      this.uniforms.uTorusRadii,
      settings.outputWidth / shortestAxis,
      settings.outputHeight / shortestAxis,
    );
    gl.uniform1i(this.uniforms.uNoiseType, NOISE_TYPES[settings.noiseType]);
    gl.uniform1i(this.uniforms.uFractalType, FRACTAL_TYPES[settings.fractalType]);
    gl.uniform1i(this.uniforms.uSeed, settings.seed);
    gl.uniform1f(this.uniforms.uScale, settings.scale);
    gl.uniform1i(this.uniforms.uOctaves, settings.octaves);
    gl.uniform1f(this.uniforms.uPersistence, settings.persistence);
    gl.uniform1f(this.uniforms.uLacunarity, settings.lacunarity);
    gl.uniform1i(this.uniforms.uWarpEnabled, settings.warpEnabled);
    gl.uniform1f(this.uniforms.uWarpStrength, settings.warpStrength);
    gl.uniform1f(this.uniforms.uWarpScale, settings.warpScale);
    gl.uniform1i(this.uniforms.uPalette, PALETTES[settings.palette]);
    gl.uniform1f(this.uniforms.uContrast, settings.contrast);
    gl.uniform1i(this.uniforms.uMaskEnabled, settings.maskEnabled);
    gl.uniform1f(this.uniforms.uThreshold, settings.threshold);
    gl.uniform1i(this.uniforms.uInvertMask, settings.invertMask);
    gl.uniform1f(this.uniforms.uBandDensity, settings.bandDensity);
    gl.uniform1f(this.uniforms.uBandWidth, settings.bandWidth);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.reaction?.textures[this.reaction.index] ?? null);
    gl.uniform1i(this.uniforms.uReactionTexture, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  bindVertices(program) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertices);
    const position = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  }

  resetReaction() {
    if (!this.reaction) return;
    const gl = this.gl;
    this.reaction.textures.forEach((texture) => gl.deleteTexture(texture));
    this.reaction.framebuffers.forEach((framebuffer) => gl.deleteFramebuffer(framebuffer));
    this.reaction = null;
  }

  ensureReaction(settings) {
    if (!this.supportsReaction) {
      throw new Error("Gray–Scott mode requires floating-point render-target support.");
    }
    const longest = 256;
    const aspect = settings.outputWidth / settings.outputHeight;
    const width = aspect >= 1 ? longest : Math.max(48, Math.round(longest * aspect));
    const height = aspect >= 1 ? Math.max(48, Math.round(longest / aspect)) : longest;
    const key = `${width}x${height}:${settings.seed}`;
    if (this.reaction?.key === key) return;
    this.resetReaction();

    const gl = this.gl;
    const initial = new Float32Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      initial[i * 4] = 1;
      initial[i * 4 + 3] = 1;
    }
    let randomState = settings.seed >>> 0;
    const random = () => {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      return randomState / 4294967296;
    };
    for (let spot = 0; spot < 26; spot++) {
      const cx = Math.floor(random() * width);
      const cy = Math.floor(random() * height);
      const radius = 2 + Math.floor(random() * 5);
      for (let y = 0; y < height; y++) {
        const dy = Math.min(Math.abs(y - cy), height - Math.abs(y - cy));
        for (let x = 0; x < width; x++) {
          const dx = Math.min(Math.abs(x - cx), width - Math.abs(x - cx));
          if (dx * dx + dy * dy <= radius * radius) {
            const index = (y * width + x) * 4;
            initial[index] = random() * 0.08;
            initial[index + 1] = 0.92 + random() * 0.08;
          }
        }
      }
    }

    const textures = [0, 1].map((index) => {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, index === 0 ? initial : null);
      return texture;
    });
    const framebuffers = textures.map((texture) => {
      const framebuffer = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        throw new Error("Could not create the reaction-diffusion simulation buffers.");
      }
      return framebuffer;
    });
    this.reaction = { key, width, height, textures, framebuffers, index: 0 };
  }

  stepReaction(settings, iterations) {
    const gl = this.gl;
    const state = this.reaction;
    gl.viewport(0, 0, state.width, state.height);
    gl.useProgram(this.reactionProgram);
    this.bindVertices(this.reactionProgram);
    gl.uniform2i(this.reactionUniforms.size, state.width, state.height);
    gl.uniform1f(this.reactionUniforms.feed, settings.feedRate);
    gl.uniform1f(this.reactionUniforms.kill, settings.killRate);
    gl.uniform1i(this.reactionUniforms.state, 0);
    for (let iteration = 0; iteration < iterations; iteration++) {
      const destination = 1 - state.index;
      gl.bindFramebuffer(gl.FRAMEBUFFER, state.framebuffers[destination]);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, state.textures[state.index]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      state.index = destination;
    }
  }

  readPixels() {
    const pixels = new Uint8Array(this.canvas.width * this.canvas.height * 4);
    this.gl.readPixels(0, 0, this.canvas.width, this.canvas.height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, pixels);
    return pixels;
  }
}
