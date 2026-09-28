/**
 * The corona announcement overlay: a single line wrapped round into a ring, so its two ends meet,
 * standing up in peaks the way flames do along a Rubens tube and glowing like the flame it stands
 * for, out from the ring and, more faintly, in toward its centre. At rest the ring carries static.
 * The place where its ends meet starts somewhere round the ring at random and, unless told not
 * to, turns slowly clockwise, whether or not anything is playing; see ../shared/turning.ts.
 *
 * It is shaped like the ridgeline's listening row, from the same pieces, with less of the
 * smoothing, so it reads spikier.
 */

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  Group,
  InterleavedBufferAttribute,
  Mesh,
  OrthographicCamera,
  Scene,
  ShaderMaterial,
  WebGLRenderer,
} from "three";

import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";

import { glowMaterial } from "../shared/glow";
import { listen } from "../shared/hearing";
import { shimmer, smoothNoise, wander } from "../shared/noise";
import { LINE_PEAK, LINE_REST, NOTHING } from "../shared/palette";
import { RubensTube } from "../shared/rubens";
import { turned } from "../shared/turning";
import "./style.css";

// The ring, in a view that runs from -1 to 1 top to bottom and as wide as the frame is.
const POINTS = 360;
const RING_RADIUS = 0.36;
const PEAK_HEIGHT = 0.5;

// Shaped like the ridgeline's listening row, with less smoothing: one blur pass rather than three,
// sharper crests, and static and flicker that bend twice as often along the line.
const ENVELOPE_FOCUS = 0.8;
const LOWEST_MODE = 2;
const HIGHEST_MODE = 55;
const SHARPNESS = 3;
const EMPHASIS = 2.5;
const TROUGH_DEPTH = 0.6;
const SOFTNESS = 1;
const SHIMMER_KNOTS = 48;

// Each half of the ring strays from the other, and the straying itself drifts, easing from one
// shape to the next every few seconds, since this one line is heard for as long as it plays.
const ASYMMETRY = 0.2;
const ASYMMETRY_KNOTS = 6;
const ASYMMETRY_SECONDS = 2.5;

const FLICKER = 0.12;
// The static at rest, which carries on underneath the sound.
const STATIC_HEIGHT = 0.008;

// Hearing, as the ridgeline hears.
const BAND_COUNT = 112;
const LOWEST_HZ = 150;
const HIGHEST_HZ = 4000;
const WARP = 1;
const CONTRAST = 1.75;

// How wide the line is drawn, in pixels. A plain WebGL line is one pixel whatever it is asked
// for, so the ring is drawn as wide segments instead.
const LINE_WIDTH = 2.5;
// Each segment of the ring runs from one point to the next: two points of three coordinates, or
// of three colour channels.
const SEGMENT_VALUES = 6;

// How tall the line has to stand, as a fraction of the peak, to reach its brightest.
const BRIGHTNESS_SATURATION = 0.4;

// The glow the line trails outward: how far it reaches beyond the line, and how far further it
// rises with the line's height, so a tall peak throws a tall flame.
const GLOW_REACH = 0.05;
const GLOW_RISE = 0.6;
const GLOW_FALLOFF = 1.2;
const GLOW_REST = 0.04;
const GLOW_INTENSITY = 0.7;
// The glow in toward the centre, as a fraction of the one outward in both reach and brightness.
const INNER_GLOW_SHARE = 0.5;
// Streaks round the ring: this many to a unit of arc, drifting at this speed, and this deep.
const STREAK_DENSITY = 40;
const STREAK_DRIFT = 1.7;
const STREAK_DEPTH = 0.95;

const VIEW_HALF_HEIGHT = 1;
const NEAR_PLANE = -1;
const FAR_PLANE = 1;
const MILLISECONDS = 1000;
const FULL_TURN = Math.PI * 2;
const EDGES = 2;
const XYZ = 3;
const RGB = 3;

const random = Math.random;

const tube = new RubensTube({
  points: POINTS,
  focus: ENVELOPE_FOCUS,
  lowestMode: LOWEST_MODE,
  highestMode: HIGHEST_MODE,
  sharpness: SHARPNESS,
  emphasis: EMPHASIS,
  depth: TROUGH_DEPTH,
  softness: SOFTNESS,
});
const phases = shimmer(POINTS, SHIMMER_KNOTS, random);
const silence = new Float32Array(POINTS);

/** One side's straying, easing from the shape it had to a fresh one every ASYMMETRY_SECONDS. */
class Drift {
  private from: Float32Array;
  private to: Float32Array;
  private since: number;

  constructor(private readonly length: number) {
    this.from = this.draw();
    this.to = this.draw();
    this.since = performance.now();
  }

  at(position: number, now: number): number {
    let progress = (now - this.since) / (ASYMMETRY_SECONDS * MILLISECONDS);
    if (progress >= 1) {
      this.from = this.to;
      this.to = this.draw();
      this.since = now;
      progress = 0;
    }

    const eased = (1 - Math.cos(progress * Math.PI)) / 2;
    const index = Math.round(position * (this.length - 1));

    return this.from[index] + (this.to[index] - this.from[index]) * eased;
  }

  private draw(): Float32Array {
    return smoothNoise(this.length, ASYMMETRY_KNOTS, random);
  }
}

const halfLength = Math.floor(POINTS / 2) + 1;
const leftDrift = new Drift(halfLength);
const rightDrift = new Drift(halfLength);

// Scene.
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setClearColor(NOTHING);
document.body.appendChild(renderer.domElement);

const scene = new Scene();
const camera = new OrthographicCamera(-1, 1, VIEW_HALF_HEIGHT, -VIEW_HALF_HEIGHT, NEAR_PLANE, FAR_PLANE);

const ring = new Group();
scene.add(ring);

// Round from the top, clockwise, so the ends meet at the top before the ring is turned.
const directions = Array.from({ length: POINTS }, (_, point) => {
  const angle = (point / POINTS) * FULL_TURN;

  return [Math.sin(angle), Math.cos(angle)];
});

// The line, a point at a time, laid out each frame as the segments that join each point to the
// next, the last to the first so the ring closes.
const linePositions = new Float32Array(POINTS * XYZ);
const lineColors = new Float32Array(POINTS * RGB);
const segmentPositions = new Float32Array(POINTS * SEGMENT_VALUES);
const segmentColors = new Float32Array(POINTS * SEGMENT_VALUES);

const lineGeometry = new LineSegmentsGeometry();
lineGeometry.setPositions(segmentPositions);
lineGeometry.setColors(segmentColors);
// Written in place each frame, rather than handed over afresh, which would build new buffers.
const positionBuffer = (lineGeometry.attributes.instanceStart as InterleavedBufferAttribute).data;
const colorBuffer = (lineGeometry.attributes.instanceColorStart as InterleavedBufferAttribute).data;

const lineMaterial = new LineMaterial({
  vertexColors: true,
  linewidth: LINE_WIDTH,
  blending: AdditiveBlending,
  transparent: true,
  depthWrite: false,
});
const line = new LineSegments2(lineGeometry, lineMaterial);
// Its bounds were taken while every point sat at the centre, and the ring grows past them.
line.frustumCulled = false;
ring.add(line);

/** Lay each point and the next out as a segment, for the positions or the colours. */
function segment(points: Float32Array, segments: Float32Array): void {
  for (let point = 0; point < POINTS; point++) {
    const next = (point + 1) % POINTS;
    segments.set(points.subarray(point * XYZ, point * XYZ + XYZ), point * SEGMENT_VALUES);
    segments.set(points.subarray(next * XYZ, next * XYZ + XYZ), point * SEGMENT_VALUES + XYZ);
  }
}

// Ribbons from the line outward and inward, closed round the ring; see ../shared/glow.ts. Both
// run from the line at 0 to their far edge at 1, so they share everything but where they reach.
const glowPositions = new Float32Array(POINTS * EDGES * XYZ);
const innerGlowPositions = new Float32Array(POINTS * EDGES * XYZ);
const glowBehind = new Float32Array(POINTS * EDGES);
const glowStrength = new Float32Array(POINTS * EDGES);
const glowAcross = new Float32Array(POINTS * EDGES);
const glowIndex: number[] = [];

const arc = (FULL_TURN * RING_RADIUS) / POINTS;
for (let point = 0; point < POINTS; point++) {
  const edge = point * EDGES;
  glowBehind.set([0, 1], edge);
  glowAcross.set([point * arc, point * arc], edge);

  const next = ((point + 1) % POINTS) * EDGES;
  glowIndex.push(edge, edge + 1, next, next, edge + 1, next + 1);
}

const behind = new BufferAttribute(glowBehind, 1);
const strength = new BufferAttribute(glowStrength, 1);
const across = new BufferAttribute(glowAcross, 1);

function ribbon(positions: Float32Array, intensity: number): { geometry: BufferGeometry; material: ShaderMaterial } {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, XYZ));
  geometry.setAttribute("behind", behind);
  geometry.setAttribute("glow", strength);
  geometry.setAttribute("across", across);
  geometry.setIndex(glowIndex);

  const material = glowMaterial({
    falloff: GLOW_FALLOFF,
    intensity,
    streakDensity: STREAK_DENSITY,
    streakDrift: STREAK_DRIFT,
    streakDepth: STREAK_DEPTH,
  });
  ring.add(new Mesh(geometry, material));

  return { geometry, material };
}

const outer = ribbon(glowPositions, GLOW_INTENSITY);
const inner = ribbon(innerGlowPositions, GLOW_INTENSITY * INNER_GLOW_SHARE);

function resize(): void {
  const aspect = window.innerWidth / window.innerHeight;

  renderer.setSize(window.innerWidth, window.innerHeight);
  lineMaterial.resolution.set(window.innerWidth, window.innerHeight);
  camera.left = -VIEW_HALF_HEIGHT * aspect;
  camera.right = VIEW_HALF_HEIGHT * aspect;
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

function frame(now: number): void {
  requestAnimationFrame(frame);

  const profile = ear ? tube.shape(ear.hear(now)) : silence;
  const seconds = now / MILLISECONDS;

  ring.rotation.z = turned(seconds);

  for (let point = 0; point < POINTS; point++) {
    const distance = tube.distance(point);
    const side = tube.leftOfMiddle(point) ? leftDrift : rightDrift;
    const skew = 1 + ASYMMETRY * distance * side.at(distance, now);
    const drift = wander(seconds, phases[point]);

    const sound = Math.max(profile[point] * skew, 0) * (1 + FLICKER * drift) * PEAK_HEIGHT;
    const radius = RING_RADIUS + sound + STATIC_HEIGHT * drift;
    const brightness = Math.min(sound / (PEAK_HEIGHT * BRIGHTNESS_SATURATION), 1);
    const [x, y] = directions[point];

    linePositions.set([x * radius, y * radius, 0], point * XYZ);
    color.lerpColors(LINE_REST, LINE_PEAK, brightness).toArray(lineColors, point * RGB);

    const reach = GLOW_REACH + sound * GLOW_RISE;
    const outward = radius + reach;
    const inward = radius - reach * INNER_GLOW_SHARE;
    const edge = point * EDGES;
    glowPositions.set([x * radius, y * radius, 0, x * outward, y * outward, 0], edge * XYZ);
    innerGlowPositions.set([x * radius, y * radius, 0, x * inward, y * inward, 0], edge * XYZ);

    const lit = GLOW_REST + (1 - GLOW_REST) * brightness;
    glowStrength[edge] = lit;
    glowStrength[edge + 1] = lit;
  }

  segment(linePositions, segmentPositions);
  segment(lineColors, segmentColors);
  positionBuffer.set(segmentPositions, 0);
  colorBuffer.set(segmentColors, 0);
  positionBuffer.needsUpdate = true;
  colorBuffer.needsUpdate = true;
  for (const { geometry, material } of [outer, inner]) {
    geometry.attributes.position.needsUpdate = true;
    material.uniforms.time.value = seconds;
  }
  strength.needsUpdate = true;

  renderer.render(scene, camera);
}

requestAnimationFrame(frame);
