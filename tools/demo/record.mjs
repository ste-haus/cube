// Drive the panel in headless Chrome and record a screencast of drag-to-rotate. Started by run.sh.
// Usage: node record.mjs <devtools-port> <out-dir> <still|record> [clock-offset-seconds]
import { mkdirSync, writeFileSync } from "node:fs";

const [port, outDir, mode, offsetArg] = process.argv.slice(2);
const OFFSET_MS = Number(offsetArg ?? 0) * 1000;
const TIMEZONE = "America/Chicago";
const URL_ = process.env.PANEL_URL ?? "http://127.0.0.1:4097/";
const W = 2000;
const H = 1200;

mkdirSync(outDir, { recursive: true });

const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const page = targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));

let id = 0;
const pending = new Map();
const listeners = [];
ws.addEventListener("message", (e) => {
  const msg = JSON.parse(e.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  } else if (msg.method) {
    listeners.forEach((l) => l(msg));
  }
});
const send = (method, params = {}) =>
  new Promise((r) => {
    const n = ++id;
    pending.set(n, r);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A cursor drawn into the page, since a screencast never shows the real one.
const CURSOR = `
addEventListener("DOMContentLoaded", () => {
  const c = document.createElement("div");
  c.innerHTML = '<svg width="56" height="56" viewBox="0 0 24 24"><path d="M4 2 L4 19 L8.5 15 L11.5 22 L14.5 20.8 L11.6 14 L17.5 14 Z" fill="#fff" stroke="#000" stroke-width="1.3" stroke-linejoin="round"/></svg>';
  Object.assign(c.style, { position: "fixed", left: "0", top: "0", zIndex: 2147483647, pointerEvents: "none", transform: "translate(-9999px,-9999px)" });
  const ring = document.createElement("div");
  Object.assign(ring.style, { position: "fixed", left: "0", top: "0", width: "84px", height: "84px", margin: "-42px 0 0 -42px", borderRadius: "50%",
    background: "rgba(255,255,255,0.28)", border: "3px solid rgba(255,255,255,0.85)", zIndex: 2147483646, pointerEvents: "none", opacity: "0",
    transition: "opacity 120ms", transform: "translate(-9999px,-9999px)" });
  document.body.append(ring, c);
  const at = (e) => { const t = "translate(" + e.clientX + "px," + e.clientY + "px)"; c.style.transform = t; ring.style.transform = t; };
  addEventListener("pointermove", at, true);
  addEventListener("pointerdown", (e) => { at(e); ring.style.opacity = "1"; }, true);
  addEventListener("pointerup", (e) => { at(e); ring.style.opacity = "0"; }, true);
});`;

await send("Page.enable");
await send("Page.addScriptToEvaluateOnNewDocument", { source: CURSOR });
// The page's clock, moved to the afternoon; timers and animations keep real time.
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `(() => {
    const Real = Date;
    const offset = ${OFFSET_MS};
    class Shifted extends Real {
      constructor(...args) { args.length ? super(...args) : super(Real.now() + offset); }
      static now() { return Real.now() + offset; }
    }
    globalThis.Date = Shifted;
  })();`,
});
await send("Emulation.setTimezoneOverride", { timezoneId: TIMEZONE });
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send("Page.navigate", { url: URL_ });
await sleep(6000);

const mouse = (type, x, y, pressed) =>
  send("Input.dispatchMouseEvent", { type, x, y, button: pressed || type !== "mouseMoved" ? "left" : "none", buttons: pressed ? 1 : 0, clickCount: type === "mouseMoved" ? 0 : 1 });

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

async function glide(x0, y0, x1, y1, ms, pressed) {
  const steps = Math.round(ms / 16);
  for (let i = 1; i <= steps; i++) {
    const t = ease(i / steps);
    await mouse("mouseMoved", x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, pressed);
    await sleep(16);
  }
}

let pos = [W * 0.62, H * 0.55];
async function drag(dx, dy) {
  const [sx, sy] = [W / 2 - dx / 2, H / 2 - dy / 2];
  await glide(pos[0], pos[1], sx, sy, 500, false);
  await sleep(150);
  await mouse("mousePressed", sx, sy, true);
  await sleep(180);
  await glide(sx, sy, sx + dx, sy + dy, 450, true);
  await mouse("mouseReleased", sx + dx, sy + dy, false);
  pos = [sx + dx, sy + dy];
}

if (mode === "still") {
  const snap = async (name) => {
    const shot = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(`${outDir}/${name}.png`, Buffer.from(shot.result.data, "base64"));
  };
  await snap("front");
  await drag(0, 420);
  await sleep(2500);
  await snap("weather");
  await drag(-640, 0);
  await sleep(2500);
  await snap("cameras");
  process.exit(0);
}

// Park the cursor on the panel before recording starts.
await mouse("mouseMoved", pos[0], pos[1], false);
await sleep(300);

const frames = [];
listeners.push((msg) => {
  if (msg.method !== "Page.screencastFrame") return;
  const { data, metadata, sessionId } = msg.params;
  const name = `f${String(frames.length).padStart(5, "0")}.jpg`;
  writeFileSync(`${outDir}/${name}`, Buffer.from(data, "base64"));
  frames.push({ name, t: metadata.timestamp });
  send("Page.screencastFrameAck", { sessionId });
});
await send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 1 });

// Long enough on the front for a light or two to change.
await sleep(4500);
await drag(0, 420); // down: front -> up (weather)
await sleep(3200);
await drag(-640, 0); // left: up -> right
await sleep(3000);
await drag(640, 0); // right: right -> front
await sleep(3500);

await send("Page.stopScreencast");
await sleep(300);

// ffmpeg concat list with each frame held until the next one arrived.
let list = "";
frames.forEach((f, i) => {
  const next = frames[i + 1]?.t ?? f.t + 0.1;
  list += `file '${f.name}'\nduration ${(next - f.t).toFixed(4)}\n`;
});
list += `file '${frames.at(-1).name}'\n`;
writeFileSync(`${outDir}/frames.txt`, list);
console.log(`${frames.length} frames over ${(frames.at(-1).t - frames[0].t).toFixed(1)}s`);
process.exit(0);
