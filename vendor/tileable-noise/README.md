# Tileable Noise

A dependency-free WebGL 2 tool for generating seamless textures by sampling four-dimensional procedural noise on a flat Clifford torus.

**Live site:** <https://omgkaustav.github.io/tileable-noise/>

## Why it tiles

For normalized image coordinates `u, v ∈ [0, 1]`, the app uses

```text
Φ(u, v) = s (rₓ cos(2πu), rₓ sin(2πu), rᵧ cos(2πv), rᵧ sin(2πv)).
```

Because sine and cosine are periodic, `Φ(0, v) = Φ(1, v)` and `Φ(u, 0) = Φ(u, 1)`. Sampling any continuous 4D function after this mapping therefore produces matching opposite edges. For rectangular output, `rₓ:rᵧ` equals `width:height`; the longer axis samples a proportionally larger circumference, preserving feature size in pixels rather than stretching a square sample.

This embedding is a Clifford torus in `R⁴`. Its induced metric has constant coefficients and zero intrinsic Gaussian curvature, unlike the familiar torus embedded in `R³`. That keeps the texture scale uniform across the tile.

Domain warping also remains tileable because its displacement fields are functions of the same periodic 4D coordinates. All noise and warping calculations run per pixel in a fragment shader rather than in a JavaScript pixel loop.

## Reaction–diffusion

The contour-band mode is a fast stylized effect derived from noise level sets. The separate Gray–Scott mode is a genuine activator–inhibitor system:

```text
∂A/∂t = Dₐ∇²A − AB² + f(1 − A)
∂B/∂t = Dᵦ∇²B + AB² − (k + f)B
```

It is simulated directly on the intrinsic 2D flat torus with periodic neighbors, so material leaving one edge immediately enters from the opposite edge. Reaction–diffusion equations can also be defined in four spatial dimensions by using a 4D Laplacian, but simulating a full 4D volume is far more expensive and is unnecessary when the desired domain is the 2D torus itself.

## Features

- 4D gradient Perlin, value, and Worley noise
- Fast periodic contour bands for coral, fish-skin, and brain-like patterns
- Genuine Gray–Scott activator–inhibitor reaction–diffusion on a periodic 2D flat torus
- fBm, ridged, and turbulence fractal styles
- Periodic 4D domain warping
- Live single-tile and 3 × 3 seam previews
- Color palettes, contrast, thresholding, and mask inversion
- Square, rectangular, and custom PNG/SVG output up to 4000 × 4000
- Optional red 3 × 3 seam grid
- SVG threshold-mask output for fabrication workflows
- WebGL 2 fragment-shader rendering for interactive GPU performance
- No build step and no runtime dependencies

## Run locally

Opening `index.html` directly may work in some browsers, but ES modules are most reliable over a local server:

```powershell
cd TileableNoise
python -m http.server 8080
```

Then open <http://localhost:8080>.

## License

MIT
