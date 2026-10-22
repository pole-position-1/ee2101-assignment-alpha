# EE2101 Assignment Alpha · Interactive Tool

Companion website for EE2101 Assignment Alpha: https://pole-position-1.github.io/ee2101-assignment-alpha/

1. **Pole–Zero → Bode** (`#pole-zero`): drag a real pole (and optional real zero) and read ω−3dB and the −45° point from the live Bode plot.
2. **Circuit Sandbox** (`#sandbox`): build the two arms of the divider H(s) = Z₂/(Z₁ + Z₂) from R, L and C parts, view H(s), poles, zeros and the Bode plot, then drive it with a step, impulse, sine, cosine or square wave. Every input is switched on at t = 0.

Static HTML/CSS/JS with no build step. KaTeX is bundled in `vendor/`.

## Publishing

Settings → Pages → Deploy from a branch → `main` / `(root)`.

## Checking the maths

`engine.js` has no DOM access and is verified against the assignment's closed-form results (RC low-pass, 10× probe in all three compensation cases), a direct complex-impedance calculation on random circuits, and RK4 integration of RLC circuits:

```
node test/verify.js
```
