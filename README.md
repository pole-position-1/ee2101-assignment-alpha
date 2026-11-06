# EE2101 Assignment Alpha · Interactive Tool

Companion website for EE2101 Assignment Alpha: https://pole-position-1.github.io/ee2101-assignment-alpha/

0. **Student identity** (header): name and Matric No. are required. The last three digits give X, Y, Z (0 → 4, 5, 2), and `Matric: ID (X, Y, Z) | name | timestamp` is watermarked into every plot so screenshots are traceable. Until both are entered, plots are marked UNVERIFIED.
1. **Pole–Zero → Bode** (`#pole-zero`): choose a real pole, two independent real poles, or a complex-conjugate pole pair (dragged anywhere in the left half plane, with ζ, Q and the resonant peak shown) and no zero, a real zero in either half plane, a jω-axis pair (notch) or a complex-conjugate zero pair (dragged anywhere). The phase is built factor by factor with `atan2`, so an RHP zero (1 − s/ωz) gives +20 dB/dec with a lag towards −90°.
2. **Circuit Sandbox** (`#sandbox`): build the two arms of the divider H(s) = Z₂/(Z₁ + Z₂) from R, L and C parts, each arm in series or parallel (presets for Parts A, B and C). Read impedances, Z_match = jω₀L₁ + Z₂, |H| and ∠H at a cursor frequency ω₀, with a phasor diagram of V_in, V_out, I₁ and V_L. Drive the circuit with a step, impulse, sine, cosine or square wave (switched on at t = 0), or with the dual-tone ECG + hum signal 1.0 cos(0.1ω₀t) + 5.0 sin(ω₀t + 30°), shown as an AC steady state by superposition.
3. **2D Impedance Plane** (`#bullseye`): the same shunt-C, series-L match played on the R–jX impedance plane. Z₂ = R_L ∥ 1/(jω₀C) rides its capacitive semicircle onto the R = 50 Ω line (Step 1), then +jω₀L lifts it straight up into the 50 + j0 Ω bullseye (Step 2). Live Z₂, Z_match and |V_out/V_in| for a 50 Ω source. **Warp to Smith Chart** animates every curve through Γ = (Z/50 − 1)/(Z/50 + 1).
4. **Smith Chart L-Match** (`#smith`): match a resistive load R_L (100–2000 Ω) to Z₀ = 50 Ω at ω₀ with a shunt C (nF) then a series L (mH), using sliders or exact values. The chart draws the exact constant-g arc (shunt C) and constant-r arc (series L) from z_L through z₂ to z_match, with live Z₂, Z_match, |Γ| and VSWR. The status banner turns green when |Z_match − 50| < 0.5 Ω.
5. **Op-Amp Buffer** (`#opamp`): the open-loop gain A(s) wired as a follower (V₊ = V_in, V₋ = V_out), so H_CL = A/(1 + A). Four presets (single pole ≈ −90°, −135° target, the uncompensated amplifier from section 6, −180°) and a slider from −90° to −195° set the phase φᵤ where |A| = 1 (a three-pole model with K₀ = 100 and f_u = 1 MHz; one pole at −90°), or load the live design from section 6. Readouts of A(jωᵤ) = 1∠φᵤ = cos φᵤ + j sin φᵤ, |1 + A(jωᵤ)| and |H_CL(jωᵤ)| with a stability badge, the 1 + A phasor from −1, the closed-loop step response, |H_CL(j2πf)|, and the closed-loop poles crossing the jω axis at φᵤ = −180°.
6. **Amplifier Compensation** (`#amp`): a two-node amplifier (R₁ = (10 + X) kΩ, C₁, C₂, with g_m and R₂ editable) with an optional C_c + R_z branch from V₁ to V₂. The stability-test Bode plot of the open-loop gain A(s) = −V₂/V_s marks every unity-gain crossing and checks the target: a phase of −135° or higher where the gain is 1. Poles and zeros come from the full (up to cubic) polynomials. A trial table records each design.

Static HTML/CSS/JS with no build step. KaTeX is bundled in `vendor/`.

## Publishing

Settings → Pages → Deploy from a branch → `main` / `(root)`.

## Checking the maths

`engine.js` has no DOM access and is verified against the assignment's closed-form results (RC low-pass, 10× probe in all three compensation cases), a direct complex-impedance calculation on random circuits, RK4 integration of RLC circuits, the amplifier loop gain against two-node nodal analysis and the assignment's unity-gain table, the L-match condition and Smith chart design (Q = √(R_L/Z₀ − 1), C = Q/ω₀R_L, L = QZ₀/ω₀), RHP/jω-axis zero phase asymptotes, complex-pole resonance (|H(jωn)| = 1/2ζ, peak 1/(2ζ√(1−ζ²))), matric parsing, and the dual-tone steady state against the exact causal response:

```
node test/verify.js
```
