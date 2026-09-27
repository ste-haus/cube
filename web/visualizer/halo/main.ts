/**
 * The halo announcement overlay: a few ribbons wound into a ring, each woven from dozens of fine
 * strands laid side by side, like silk. Each ribbon twists as it goes round, and where it turns
 * edge on its strands crowd together into a bright fold. The ribbons wander from the ring and
 * from each other, and sparks ride along them, twinkling.
 *
 * The sound is laid round the ring, mirrored side to side and bent a little out of true, and
 * where it is loud the ring swells outward, the ribbons open wide and brighten, and the sparks are
 * thrown clear. How loud it is overall hurries the twisting along. At rest the ribbons lie narrow
 * and dim and only drift.
 *
 * Every strand is worked out on the graphics card from where along the ring it is, where across
 * its ribbon, and which ribbon, so a frame costs the page no more than handing over the sound.
 */

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DataTexture,
  LinearFilter,
  LineSegments,
  OrthographicCamera,
  Points,
  RedFormat,
  RepeatWrapping,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector4,
  WebGLRenderer,
} from "three";

import { listen } from "../shared/hearing";
import { blur } from "../shared/noise";
import { GLOW_BODY, LINE_PEAK, NOTHING } from "../shared/palette";
import "./style.css";

// The ring, in a view that runs from -1 to 1 top to bottom and as wide as the frame is.
const RIBBONS = 5;
const STRANDS = 40;
const POINTS = 256;
const RING_RADIUS = 0.52;

// How each ribbon wanders from the ring: three waves round it, with this many crests each, and
// how far it strays, and how far the ribbons sit from one another.
const WANDER_CRESTS = [2, 3, 5];
const WANDER_REACH = 0.045;
const RIBBON_SPREAD = 0.035;
// How slowly the wandering and the ribbons' widths move, in radians a second at most.
const DRIFT_SPEED = 0.35;

// How wide a ribbon lies at rest and how much wider the sound opens it, and the waves its width
// swells and narrows along as it goes round.
const WIDTH_REST = 0.09;
const WIDTH_SOUND = 0.18;
const WIDTH_CRESTS = 3;
const WIDTH_SWING = 0.45;
// How many times at most a ribbon turns over on its way round, and how far the twist is bent
// out of even about that.
const MOST_TURNS = 3;
const TWIST_CRESTS = 2;
const TWIST_BEND = 1.6;
// The strands are not quite parallel: they fan apart and close up along the ribbon, by this much.
const FAN = 0.015;
const FAN_CRESTS = 4;

// How far the ring swells outward where the sound is loudest.
const SWELL = 0.1;

// How bright a strand is at rest and how much the sound adds, and how much brighter the
// outermost strands of each ribbon are than the rest, which gives a ribbon its edges.
const STRAND_REST = 0.14;
const STRAND_SOUND = 0.3;
const EDGE_LIFT = 1.5;
const EDGE_SHARPNESS = 10;
// Strands are the reference colour, whitening toward the peak colour only between these levels.
const WHITENING_FROM = 0.35;
const WHITENING_TO = 1;

// The sparks.
const SPARKS = 280;
const SPARK_SCATTER = 0.07;
const SPARK_STRAY = 0.22;
const STRAY_SHARE = 0.12;
const SPARK_ORBIT = 0.05;
const SPARK_SIZE = 3;
const SPARK_SIZE_SPREAD = 3.5;
const SPARK_REST = 0.8;
const SPARK_SOUND = 1.6;
const SPARK_THROW = 1.8;
const TWINKLE_RATE = 1.4;
const TWINKLE_SHARPNESS = 3;
const SPARK_FALLOFF = 4;

// The sound, laid round the ring on a strip this many texels long: the low bands at the sides,
// the high ones at the top and bottom, mirrored side to side about an axis that sways a little.
const SOUND_TEXELS = 256;
const SOUND_BLUR_PASSES = 64;
const AXIS_SWAY = 0.035;
const AXIS_SWAY_SPEED = 0.13;
// Each side's share of the bands stretches and shrinks against the other's, so the halves stray.
const SIDE_STRETCH = 0.18;
const SIDE_STRETCH_SPEED = 0.21;
// How much how loud it is overall hurries the twisting along.
const FLOW_SOUND = 2.5;

// Hearing, a little broader and softer than the ridgeline, since the silk should billow rather
// than spike.
const BAND_COUNT = 64;
const LOWEST_HZ = 120;
const HIGHEST_HZ = 4000;
const WARP = 1.4;
const CONTRAST = 1.5;

const VIEW_HALF_HEIGHT = 1;
const NEAR_PLANE = -1;
const FAR_PLANE = 1;
const MILLISECONDS = 1000;
const FULL_TURN = Math.PI * 2;
const BYTE_MAX = 255;
const HALF = 0.5;
const SEGMENT_ENDS = 2;

const random = Math.random;

// Each ribbon's own character: where its waves start and how fast they move, and its shape.
function draws(count: number, scale: number, signed: boolean): Vector4 {
  const value = () => (signed ? random() * 2 - 1 : random()) * scale;

  return new Vector4(...Array.from({ length: count }, value));
}

const phases = Array.from({ length: RIBBONS }, () => draws(4, FULL_TURN, false));
const speeds = Array.from({ length: RIBBONS }, () => draws(4, DRIFT_SPEED, true));
// x: how many times it turns over; y: how far it wanders; z: how wide it runs; w: where it sits.
const shapes = Array.from(
  { length: RIBBONS },
  (_, ribbon) =>
    new Vector4(
      1 + Math.floor(random() * MOST_TURNS),
      HALF + random(),
      HALF + random(),
      (ribbon / Math.max(RIBBONS - 1, 1) - HALF) * RIBBON_SPREAD * 2,
    ),
);

// The sound round the ring, for the card to read.
const heardRing = new Float32Array(SOUND_TEXELS);
const blurScratch = new Float32Array(SOUND_TEXELS);
const soundBytes = new Uint8Array(SOUND_TEXELS);
const sound = new DataTexture(soundBytes, SOUND_TEXELS, 1, RedFormat, UnsignedByteType);
sound.wrapS = RepeatWrapping;
sound.magFilter = LinearFilter;
sound.minFilter = LinearFilter;
sound.needsUpdate = true;

// What the strands and the sparks share: where a ribbon lies at a point round the ring.
const float = (value: number) => value.toFixed(4);
const RING = /* glsl */ `
  const int RIBBONS = ${RIBBONS};
  const float TAU = ${float(FULL_TURN)};
  const float RING_RADIUS = ${float(RING_RADIUS)};
  const float WANDER_REACH = ${float(WANDER_REACH)};
  const vec3 WANDER_CRESTS = vec3(${WANDER_CRESTS.map(float).join(", ")});
  // The three waves' shares of the wandering, largest first.
  const vec3 WANDER_SHARES = vec3(0.5, 0.3, 0.2);
  const float SWELL = ${float(SWELL)};

  uniform float time;
  uniform float flow;
  uniform sampler2D sound;
  uniform vec4 phases[RIBBONS];
  uniform vec4 speeds[RIBBONS];
  uniform vec4 shapes[RIBBONS];

  float heard(float around) {
    return texture2D(sound, vec2(around, 0.5)).r;
  }

  // How far from the ring a ribbon's middle lies at an angle, before the sound swells it.
  float wandering(float angle, int ribbon) {
    vec4 phase = phases[ribbon];
    vec4 speed = speeds[ribbon];
    vec3 waves = sin(WANDER_CRESTS * angle + phase.xyz + speed.xyz * time);

    return RING_RADIUS + shapes[ribbon].w + WANDER_REACH * shapes[ribbon].y * dot(waves, WANDER_SHARES);
  }
`;

// The strands: one segment from each point to the next, round each strand of each ribbon.
const strandCount = RIBBONS * STRANDS;
const around = new Float32Array(strandCount * POINTS);
const across = new Float32Array(strandCount * POINTS);
const ribbonOf = new Float32Array(strandCount * POINTS);
const segments = new Uint32Array(strandCount * POINTS * SEGMENT_ENDS);

for (let strand = 0; strand < strandCount; strand++) {
  const first = strand * POINTS;
  for (let point = 0; point < POINTS; point++) {
    const vertex = first + point;
    around[vertex] = point / POINTS;
    across[vertex] = (strand % STRANDS) / (STRANDS - 1);
    ribbonOf[vertex] = Math.floor(strand / STRANDS);
    segments.set([vertex, first + ((point + 1) % POINTS)], vertex * SEGMENT_ENDS);
  }
}

const strandGeometry = new BufferGeometry();
// The positions are all worked out on the card; this is only there to count the vertices by.
strandGeometry.setAttribute("position", new BufferAttribute(new Float32Array(strandCount * POINTS * 3), 3));
strandGeometry.setAttribute("around", new BufferAttribute(around, 1));
strandGeometry.setAttribute("across", new BufferAttribute(across, 1));
strandGeometry.setAttribute("ribbon", new BufferAttribute(ribbonOf, 1));
strandGeometry.setIndex(new BufferAttribute(segments, 1));

const shared = {
  time: { value: 0 },
  flow: { value: 0 },
  sound: { value: sound },
  phases: { value: phases },
  speeds: { value: speeds },
  shapes: { value: shapes },
  peak: { value: LINE_PEAK },
  body: { value: GLOW_BODY },
};

const strandMaterial = new ShaderMaterial({
  uniforms: shared,
  vertexShader: /* glsl */ `
    ${RING}
    const float WIDTH_REST = ${float(WIDTH_REST)};
    const float WIDTH_SOUND = ${float(WIDTH_SOUND)};
    const float WIDTH_CRESTS = ${float(WIDTH_CRESTS)};
    const float WIDTH_SWING = ${float(WIDTH_SWING)};
    const float TWIST_CRESTS = ${float(TWIST_CRESTS)};
    const float TWIST_BEND = ${float(TWIST_BEND)};
    const float FAN = ${float(FAN)};
    const float FAN_CRESTS = ${float(FAN_CRESTS)};
    const float STRAND_REST = ${float(STRAND_REST)};
    const float STRAND_SOUND = ${float(STRAND_SOUND)};
    const float EDGE_LIFT = ${float(EDGE_LIFT)};
    const float EDGE_SHARPNESS = ${float(EDGE_SHARPNESS)};

    attribute float around;
    attribute float across;
    attribute float ribbon;
    varying float vLight;
    varying float vLoud;

    void main() {
      int which = int(ribbon + 0.5);
      vec4 phase = phases[which];
      vec4 speed = speeds[which];
      vec4 shape = shapes[which];

      float angle = around * TAU;
      float loud = heard(around);
      float offCentre = across - 0.5;

      float width = (WIDTH_REST + WIDTH_SOUND * loud) * shape.z
        * (1.0 + WIDTH_SWING * sin(WIDTH_CRESTS * angle + phase.w + speed.w * time));
      // Whole turns only, so the ribbon meets itself when it comes round.
      float twist = shape.x * angle + TWIST_BEND * sin(TWIST_CRESTS * angle + phase.x + flow * speed.y) + flow * speed.z;
      float fan = FAN * offCentre * sin(FAN_CRESTS * angle + phase.y + speed.x * time);

      float radius = wandering(angle, which) + loud * SWELL + offCentre * width * cos(twist) + fan;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(sin(angle) * radius, cos(angle) * radius, 0.0, 1.0);

      float edge = pow(abs(offCentre) * 2.0, EDGE_SHARPNESS);
      vLight = (STRAND_REST + STRAND_SOUND * loud) * (1.0 + EDGE_LIFT * edge);
      vLoud = loud;
    }
  `,
  fragmentShader: /* glsl */ `
    const float WHITENING_FROM = ${float(WHITENING_FROM)};
    const float WHITENING_TO = ${float(WHITENING_TO)};

    uniform vec3 body;
    uniform vec3 peak;
    varying float vLight;
    varying float vLoud;

    void main() {
      vec3 colour = mix(body, peak, smoothstep(WHITENING_FROM, WHITENING_TO, vLoud));
      gl_FragColor = vec4(colour * vLight, 1.0);
    }
  `,
  blending: AdditiveBlending,
  transparent: true,
  depthTest: false,
  depthWrite: false,
});

// The sparks: most close about a ribbon, a few strayed further out or in.
const sparkAngle = new Float32Array(SPARKS);
const sparkOffset = new Float32Array(SPARKS);
const sparkOrbit = new Float32Array(SPARKS);
const sparkPhase = new Float32Array(SPARKS);
const sparkSize = new Float32Array(SPARKS);
const sparkRibbon = new Float32Array(SPARKS);

for (let spark = 0; spark < SPARKS; spark++) {
  const reach = random() < STRAY_SHARE ? SPARK_STRAY : SPARK_SCATTER;
  sparkAngle[spark] = random() * FULL_TURN;
  sparkOffset[spark] = (random() * 2 - 1) * reach;
  sparkOrbit[spark] = (random() * 2 - 1) * SPARK_ORBIT;
  sparkPhase[spark] = random() * FULL_TURN;
  sparkSize[spark] = SPARK_SIZE + random() ** 2 * SPARK_SIZE_SPREAD;
  sparkRibbon[spark] = Math.floor(random() * RIBBONS);
}

const sparkGeometry = new BufferGeometry();
sparkGeometry.setAttribute("position", new BufferAttribute(new Float32Array(SPARKS * 3), 3));
sparkGeometry.setAttribute("angle", new BufferAttribute(sparkAngle, 1));
sparkGeometry.setAttribute("offset", new BufferAttribute(sparkOffset, 1));
sparkGeometry.setAttribute("orbit", new BufferAttribute(sparkOrbit, 1));
sparkGeometry.setAttribute("phase", new BufferAttribute(sparkPhase, 1));
sparkGeometry.setAttribute("size", new BufferAttribute(sparkSize, 1));
sparkGeometry.setAttribute("ribbon", new BufferAttribute(sparkRibbon, 1));

const sparkMaterial = new ShaderMaterial({
  uniforms: { ...shared, pixelRatio: { value: window.devicePixelRatio } },
  vertexShader: /* glsl */ `
    ${RING}
    const float SPARK_REST = ${float(SPARK_REST)};
    const float SPARK_SOUND = ${float(SPARK_SOUND)};
    const float SPARK_THROW = ${float(SPARK_THROW)};
    const float TWINKLE_RATE = ${float(TWINKLE_RATE)};
    const float TWINKLE_SHARPNESS = ${float(TWINKLE_SHARPNESS)};
    // Each spark twinkles at its own pace, between half and one and a half times the rate.
    const float PACE_SPREAD = 7.13;

    uniform float pixelRatio;
    attribute float angle;
    attribute float offset;
    attribute float orbit;
    attribute float phase;
    attribute float size;
    attribute float ribbon;
    varying float vLight;

    void main() {
      float at = angle + orbit * time;
      float loud = heard(fract(at / TAU));
      float radius = wandering(at, int(ribbon + 0.5)) + loud * SWELL + offset * (1.0 + loud * SPARK_THROW);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(sin(at) * radius, cos(at) * radius, 0.0, 1.0);

      float pace = 0.5 + fract(phase * PACE_SPREAD);
      float twinkle = pow(0.5 + 0.5 * sin(time * TWINKLE_RATE * pace + phase), TWINKLE_SHARPNESS);
      vLight = twinkle * (SPARK_REST + SPARK_SOUND * loud);
      gl_PointSize = size * pixelRatio * (1.0 + loud);
    }
  `,
  fragmentShader: /* glsl */ `
    const float SPARK_FALLOFF = ${float(SPARK_FALLOFF)};

    uniform vec3 peak;
    uniform vec3 body;
    varying float vLight;

    void main() {
      float distance = length(gl_PointCoord - 0.5) * 2.0;
      if (distance > 1.0) {
        discard;
      }

      float glow = exp(-distance * distance * SPARK_FALLOFF);
      gl_FragColor = vec4(mix(body, peak, glow) * glow * vLight, 1.0);
    }
  `,
  blending: AdditiveBlending,
  transparent: true,
  depthTest: false,
  depthWrite: false,
});

// Scene. Everything is placed on the card, so nothing is where its bounds say it is.
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setClearColor(NOTHING);
document.body.appendChild(renderer.domElement);

const scene = new Scene();
const camera = new OrthographicCamera(-1, 1, VIEW_HALF_HEIGHT, -VIEW_HALF_HEIGHT, NEAR_PLANE, FAR_PLANE);

const strands = new LineSegments(strandGeometry, strandMaterial);
const sparks = new Points(sparkGeometry, sparkMaterial);
for (const drawn of [strands, sparks]) {
  drawn.frustumCulled = false;
  scene.add(drawn);
}

function resize(): void {
  const aspect = window.innerWidth / window.innerHeight;

  renderer.setSize(window.innerWidth, window.innerHeight);
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

/** Lay the bands round the ring, and say how loud it is overall. */
function layRound(bands: Float32Array, seconds: number): number {
  const axis = AXIS_SWAY * Math.sin(seconds * AXIS_SWAY_SPEED * FULL_TURN);
  const stretch = SIDE_STRETCH * Math.sin(seconds * SIDE_STRETCH_SPEED * FULL_TURN);
  const last = bands.length - 1;

  for (let texel = 0; texel < SOUND_TEXELS; texel++) {
    const turned = (((texel / SOUND_TEXELS - axis) % 1) + 1) % 1;
    const right = turned < HALF;
    // From the top at 0, round either side, to the bottom at 1.
    const down = (right ? turned : 1 - turned) * 2;
    // Low bands at the sides, high at the top and bottom.
    const fromSide = Math.abs(down * 2 - 1);
    const reach = fromSide * (1 + (right ? stretch : -stretch));

    heardRing[texel] = bands[Math.min(Math.round(reach * last), last)];
  }

  for (let pass = 0; pass < SOUND_BLUR_PASSES; pass++) {
    blur(heardRing, 1, blurScratch, true);
  }

  let total = 0;
  for (let texel = 0; texel < SOUND_TEXELS; texel++) {
    total += heardRing[texel];
    soundBytes[texel] = Math.round(Math.min(heardRing[texel], 1) * BYTE_MAX);
  }
  sound.needsUpdate = true;

  return total / SOUND_TEXELS;
}

// Drawing.
let flow = 0;
let last = performance.now();

function frame(now: number): void {
  requestAnimationFrame(frame);

  const seconds = now / MILLISECONDS;
  const elapsed = (now - last) / MILLISECONDS;
  last = now;

  const level = ear ? layRound(ear.hear(now), seconds) : 0;
  flow += elapsed * (1 + FLOW_SOUND * level);

  shared.time.value = seconds;
  shared.flow.value = flow;
  sparkMaterial.uniforms.pixelRatio.value = renderer.getPixelRatio();

  renderer.render(scene, camera);
}

requestAnimationFrame(frame);
