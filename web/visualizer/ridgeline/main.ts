/**
 * The ridgeline announcement overlay: a plane tilted away from the viewer, lined across like a page,
 * each line standing up in peaks the way flames do along a Rubens tube. At rest the lines carry
 * static. While an announcement plays, each new line takes up the sound at the listening place and
 * travels forward, still moving as it goes, trailing a glow behind it like the flame it stands for.
 */

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from "three";

import { glowMaterial } from "../shared/glow";
import { listen } from "../shared/hearing";
import { wander } from "../shared/noise";
import { LINE_PEAK, LINE_REST, NOTHING } from "../shared/palette";
import { Field } from "./field";
import "./style.css";

// The surface.
const ROWS = 36;
const COLUMNS = 360;
const PLANE_WIDTH = 22;
const ROW_SPACING = 0.096;
const ROWS_PER_SECOND = 8;
const PEAK_HEIGHT = 2.1;
const ASYMMETRY = 0.2;
const ASYMMETRY_KNOTS = 6;
const ENVELOPE_FOCUS = 1.2;
// The standing waves across half a row, from the lowest band to the highest.
const LOWEST_MODE = 2;
const HIGHEST_MODE = 55;
const SHARPNESS = 2;
const EMPHASIS = 2.5;
const TROUGH_DEPTH = 0.6;
const SOFTNESS = 3;
// How many bends the static and flicker take across a row: few enough that neighbouring points
// move together.
const SHIMMER_KNOTS = 24;
// How far back, as a fraction of the plane's depth, the sound comes in at full strength.
const LISTENING_DEPTH = 0.5;
// How many rows it takes a row to ease out of full strength after it leaves the listening place.
// Bell-shaped and flat at the top, so no row snaps down out of it.
const FALL_ROWS = 4;

// How a row keeps moving after it stops listening: a slow sway along the row, and each flame
// licking up and down on its own.
const UNDULATION_DEPTH = 0.08;
const UNDULATION_SPEED = 2.4;
const UNDULATION_WAVES = 3;
const FLICKER = 0.1;
// How much fine detail a row loses for each row it travels once it has stopped listening, spread
// across the frames it takes to travel it.
const SETTLE = 0.2;

// The static at rest, which carries on underneath the sound.
const STATIC_HEIGHT = 0.02;

// Hearing.
const BAND_COUNT = 112;
const LOWEST_HZ = 150;
const HIGHEST_HZ = 4000;
const WARP = 1;
const CONTRAST = 1.75;

// Looking at it.
const FIELD_OF_VIEW = 45;
const CAMERA_HEIGHT = 3.2;
const CAMERA_BACKSET = 3;
const LOOK_AT_HEIGHT = 0.8;
const LOOK_AT_DEPTH = -8;
const NEAR_PLANE = 0.1;
const FAR_PLANE = 60;
// Where rows fade out with distance from the camera. The page is laid over the panel by screening
// it, so black shows nothing and everything drawn is light; fading means dimming toward black.
const FADE_NEAR = 3.2;
const FADE_FAR = 7;
// How many rows a row takes to come up out of nothing after it appears at the back, and to sink
// back into it before it leaves at the front, so neither end of the plane pops as rows advance.
const SPAWN_ROWS = 3;
const DESPAWN_ROWS = 1;

// How tall a line has to stand, as a fraction of the peak, to reach its brightest.
const BRIGHTNESS_SATURATION = 0.4;

// The trail each line leaves behind it, gone before the next line back. How far back the trail reaches, in rows, and how far it rises as it goes, as a fraction of the
// line's height: a tall peak leaves a tall wisp behind it, the way a flame is dragged by moving.
const TRAIL_LENGTH = 3;
const TRAIL_RISE = 1;
// How quickly the trail falls off behind the line, and how bright it is at a line at rest and at
// one at its tallest.
const TRAIL_FALLOFF = 1.2;
const TRAIL_REST = 0.04;
const TRAIL_INTENSITY = 0.7;
// The trail is streaked like a flame: bands across it this many to a unit, drifting at this speed,
// and this deep.
const STREAK_DENSITY = 9;
const STREAK_DRIFT = 1.7;
const STREAK_DEPTH = 0.95;

// Below the lines, so a line hides whatever stands behind it at the height it is.
const FLOOR = -0.2;

const MILLISECONDS = 1000;
const EDGES = 2;
const XYZ = 3;
const RGB = 3;
const Y = 1;
// Curtains first, so the depth they leave hides the trails behind them.
const CURTAIN_ORDER = 0;
const TRAIL_ORDER = 1;
const LINE_ORDER = 2;

const LISTENING_ROW = Math.round((ROWS - 1) * LISTENING_DEPTH);

/** Hermite easing from 0 at `edge0` to 1 at `edge1`, the same curve the trails fade by. */
function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);

  return t * t * (3 - 2 * t);
}

/**
 * How much of what a row heard shows, by where it stands, counted in rows from the front and
 * measured as it glides rather than by the place it will next step to, so it changes smoothly.
 * Full at the listening place and easing away from it in front. The rows behind have heard nothing
 * and carry only static, which the listening row hides.
 */
function presence(position: number): number {
  const travelled = Math.max(LISTENING_ROW - position, 0);

  return Math.exp(-((travelled / FALL_ROWS) ** 2));
}

const field = new Field({
  rows: ROWS,
  columns: COLUMNS,
  asymmetry: ASYMMETRY,
  asymmetryKnots: ASYMMETRY_KNOTS,
  focus: ENVELOPE_FOCUS,
  lowestMode: LOWEST_MODE,
  highestMode: HIGHEST_MODE,
  sharpness: SHARPNESS,
  emphasis: EMPHASIS,
  depth: TROUGH_DEPTH,
  softness: SOFTNESS,
  shimmerKnots: SHIMMER_KNOTS,
  listeningRow: LISTENING_ROW,
});

// Scene.
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setClearColor(NOTHING);
document.body.appendChild(renderer.domElement);

const scene = new Scene();

const camera = new PerspectiveCamera(FIELD_OF_VIEW, 1, NEAR_PLANE, FAR_PLANE);
camera.position.set(0, CAMERA_HEIGHT, CAMERA_BACKSET);
camera.lookAt(0, LOOK_AT_HEIGHT, LOOK_AT_DEPTH);

const surface = new Group();
scene.add(surface);

const points = ROWS * COLUMNS;

// Lines, one polyline per row.
const linePositions = new Float32Array(points * XYZ);
const lineColors = new Float32Array(points * RGB);
const lineIndex: number[] = [];

// A curtain hanging from each line to the floor, drawn in the background colour.
const curtainPositions = new Float32Array(points * EDGES * XYZ);
const curtainIndex: number[] = [];

// A ribbon behind each line, from the line back toward the next one; see ../shared/glow.ts.
const trailPositions = new Float32Array(points * EDGES * XYZ);
const trailBehind = new Float32Array(points * EDGES);
const trailGlow = new Float32Array(points * EDGES);
const trailAcross = new Float32Array(points * EDGES);
const trailIndex: number[] = [];

for (let row = 0; row < ROWS; row++) {
  const z = -row * ROW_SPACING;

  for (let column = 0; column < COLUMNS; column++) {
    const x = (column / (COLUMNS - 1) - 1 / 2) * PLANE_WIDTH;
    const point = row * COLUMNS + column;
    const edge = point * EDGES;

    linePositions.set([x, 0, z], point * XYZ);
    curtainPositions.set([x, 0, z, x, FLOOR, z], edge * XYZ);
    trailPositions.set([x, 0, z, x, 0, z - ROW_SPACING * TRAIL_LENGTH], edge * XYZ);
    trailBehind.set([0, 1], edge);
    trailAcross.set([x, x], edge);

    if (column > 0) {
      lineIndex.push(point - 1, point);

      const previous = edge - EDGES;
      curtainIndex.push(previous, previous + 1, edge, edge, previous + 1, edge + 1);
      trailIndex.push(previous, previous + 1, edge, edge, previous + 1, edge + 1);
    }
  }
}

const lineGeometry = new BufferGeometry();
lineGeometry.setAttribute("position", new BufferAttribute(linePositions, XYZ));
lineGeometry.setAttribute("color", new BufferAttribute(lineColors, RGB));
lineGeometry.setIndex(lineIndex);
const lines = new LineSegments(
  lineGeometry,
  new LineBasicMaterial({ vertexColors: true, blending: AdditiveBlending, transparent: true, depthWrite: false }),
);
lines.renderOrder = LINE_ORDER;
surface.add(lines);

const curtainGeometry = new BufferGeometry();
curtainGeometry.setAttribute("position", new BufferAttribute(curtainPositions, XYZ));
curtainGeometry.setIndex(curtainIndex);
const curtains = new Mesh(
  curtainGeometry,
  // Depth only: a curtain hides what stands behind a line without painting over the panel. Pushed
  // back a touch so the line along its top edge always wins.
  new MeshBasicMaterial({
    colorWrite: false,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  }),
);
curtains.renderOrder = CURTAIN_ORDER;
surface.add(curtains);

const trailGeometry = new BufferGeometry();
trailGeometry.setAttribute("position", new BufferAttribute(trailPositions, XYZ));
trailGeometry.setAttribute("behind", new BufferAttribute(trailBehind, 1));
trailGeometry.setAttribute("glow", new BufferAttribute(trailGlow, 1));
trailGeometry.setAttribute("across", new BufferAttribute(trailAcross, 1));
trailGeometry.setIndex(trailIndex);

const trailMaterial = glowMaterial({
  falloff: TRAIL_FALLOFF,
  intensity: TRAIL_INTENSITY,
  streakDensity: STREAK_DENSITY,
  streakDrift: STREAK_DRIFT,
  streakDepth: STREAK_DEPTH,
  fade: { near: FADE_NEAR, far: FADE_FAR },
});

const trails = new Mesh(trailGeometry, trailMaterial);
trails.renderOrder = TRAIL_ORDER;
surface.add(trails);

function resize(): void {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

window.addEventListener("resize", resize);
resize();

const ear = listen({
  bandCount: BAND_COUNT,
  lowestHz: LOWEST_HZ,
  highestHz: HIGHEST_HZ,
  warp: WARP,
  contrast: CONTRAST,
});

// Drawing.
const color = new Color();
let lastAdvance = performance.now();
let lastFrame = lastAdvance;

function frame(now: number): void {
  requestAnimationFrame(frame);

  if (ear) {
    field.listen(ear.hear(now));
  }

  const interval = MILLISECONDS / ROWS_PER_SECOND;
  while (now - lastAdvance >= interval) {
    field.advance();
    lastAdvance += interval;
  }

  field.settle(1 - (1 - SETTLE) ** (((now - lastFrame) / MILLISECONDS) * ROWS_PER_SECOND));

  // Between advances the whole surface glides forward, so rows travel rather than step.
  const glide = (now - lastAdvance) / interval;
  surface.position.z = glide * ROW_SPACING;

  const seconds = now / MILLISECONDS;

  for (let row = 0; row < ROWS; row++) {
    const position = row - glide;
    const carried = presence(position);
    const emergence = Math.min(Math.max(position / DESPAWN_ROWS, 0), Math.max((ROWS - 1 - position) / SPAWN_ROWS, 0), 1);
    const depth = -position * ROW_SPACING;
    const nearness = 1 - smoothstep(FADE_NEAR, FADE_FAR, Math.hypot(CAMERA_BACKSET - depth, CAMERA_HEIGHT));

    for (let column = 0; column < COLUMNS; column++) {
      const across = (column / (COLUMNS - 1)) * Math.PI * 2 * UNDULATION_WAVES;
      const undulation = 1 + UNDULATION_DEPTH * Math.sin(seconds * UNDULATION_SPEED + field.phase(row) + across);

      const drift = wander(seconds, field.shimmerAt(row, column));

      const sound = field.at(row, column) * undulation * carried * (1 + FLICKER * drift) * PEAK_HEIGHT;
      const height = (sound + STATIC_HEIGHT * drift) * emergence;
      const brightness = Math.min(sound / (PEAK_HEIGHT * BRIGHTNESS_SATURATION), 1);

      const point = row * COLUMNS + column;
      const edge = point * EDGES;

      linePositions[point * XYZ + Y] = height;
      curtainPositions[edge * XYZ + Y] = height;
      color.lerpColors(LINE_REST, LINE_PEAK, brightness).lerp(NOTHING, 1 - emergence * nearness);
      color.toArray(lineColors, point * RGB);

      // The trail keeps the line's shape as it falls away behind it.
      trailPositions[edge * XYZ + Y] = height;
      trailPositions[(edge + 1) * XYZ + Y] = height + sound * TRAIL_RISE;

      const glow = (TRAIL_REST + (1 - TRAIL_REST) * brightness) * emergence;
      trailGlow[edge] = glow;
      trailGlow[edge + 1] = glow;
    }
  }

  lineGeometry.attributes.position.needsUpdate = true;
  lineGeometry.attributes.color.needsUpdate = true;
  curtainGeometry.attributes.position.needsUpdate = true;
  trailGeometry.attributes.position.needsUpdate = true;
  trailGeometry.attributes.glow.needsUpdate = true;
  trailMaterial.uniforms.time.value = seconds;

  lastFrame = now;
  renderer.render(scene, camera);
}

requestAnimationFrame(frame);
