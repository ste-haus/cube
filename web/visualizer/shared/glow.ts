/**
 * The glow a line trails, like the flame it stands for: a ribbon from the line outward, bright at
 * the line and falling off along it, streaked like a flame.
 *
 * The ribbon's vertices carry `behind`, from 0 at the line to 1 at the far edge; `glow`, how
 * brightly the line there stands; and `across`, how far along the line they are, which the
 * streaks run by.
 */

import { AdditiveBlending, DoubleSide, ShaderMaterial } from "three";

import { GLOW_BODY, GLOW_CORE } from "./palette";

export interface GlowOptions {
  /** How quickly the glow falls off away from the line. */
  falloff: number;
  intensity: number;
  /** Streaks across the glow: bands this many to a unit of `across`, drifting at this speed, and this deep. */
  streakDensity: number;
  streakDrift: number;
  streakDepth: number;
  /** Where the glow fades out with distance from the camera; it does not fade without this. */
  fade?: { near: number; far: number };
}

const FADES = 1;
const STAYS = 0;

export function glowMaterial(options: GlowOptions): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      core: { value: GLOW_CORE },
      body: { value: GLOW_BODY },
      falloff: { value: options.falloff },
      streakDensity: { value: options.streakDensity },
      streakDrift: { value: options.streakDrift },
      streakDepth: { value: options.streakDepth },
      time: { value: 0 },
      intensity: { value: options.intensity },
      fades: { value: options.fade ? FADES : STAYS },
      fadeNear: { value: options.fade?.near ?? 0 },
      fadeFar: { value: options.fade?.far ?? 0 },
    },
    vertexShader: /* glsl */ `
      attribute float behind;
      attribute float glow;
      attribute float across;
      uniform float fades;
      uniform float fadeNear;
      uniform float fadeFar;
      varying float vBehind;
      varying float vGlow;
      varying float vFade;
      varying float vAcross;

      void main() {
        vBehind = behind;
        vGlow = glow;
        vAcross = across;
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        vFade = mix(1.0, 1.0 - smoothstep(fadeNear, fadeFar, -view.z), fades);
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 core;
      uniform vec3 body;
      uniform float falloff;
      uniform float intensity;
      uniform float streakDensity;
      uniform float streakDrift;
      uniform float streakDepth;
      uniform float time;
      varying float vBehind;
      varying float vGlow;
      varying float vFade;
      varying float vAcross;

      // The second set of bands: narrower by the golden ratio so the two never line up, drifting
      // the other way a little faster, and bending as it runs out so the streaks lean.
      const float SECOND_WIDTH = 1.618;
      const float SECOND_DRIFT = 1.3;
      const float LEAN = 3.0;

      void main() {
        // Two sets of bands at unrelated widths, drifting against each other, so the streaks
        // shift like flame rather than scrolling like a texture.
        float first = sin(vAcross * streakDensity + time * streakDrift);
        float second = sin(vAcross * streakDensity * SECOND_WIDTH - time * streakDrift * SECOND_DRIFT + vBehind * LEAN);
        float streak = (2.0 + first + second) / 4.0;
        float trail = pow(1.0 - vBehind, falloff) * mix(1.0, streak, streakDepth * vBehind);
        vec3 colour = mix(body, core, trail * vGlow);

        gl_FragColor = vec4(colour * trail * vGlow * intensity * vFade, 1.0);
      }
    `,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  });
}
