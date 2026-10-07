/*
 * Live video from go2rtc, played through Media Source Extensions over go2rtc's websocket.
 *
 * MSE rather than WebRTC because it is a plain websocket to go2rtc's own port: nothing to
 * negotiate, no ICE candidates to get right on a docker network, and it reaches a tablet the
 * same way the page itself did. The video arrives as H.264 the tablet decodes in hardware,
 * which is the point — it costs the tablet less than a JPEG a second decoded in software.
 */

import { getContext, setContext } from "svelte";

const GO2RTC_CONTEXT = Symbol("go2rtc");

/*
 * What the panel will take, offered in order of preference. Video only: the panel is muted, so
 * asking for audio would spend the tablet's bandwidth on nothing.
 */
const VIDEO_CODECS = [
  "avc1.640029", // H.264 High 4.1
  "avc1.64002A", // H.264 High 4.2
  "avc1.640033", // H.264 High 5.1
  "hvc1.1.6.L153.B0", // H.265 Main 5.1
];

const MSE_MESSAGE = "mse";
const ERROR_MESSAGE = "error";
const WEBSOCKET_PATH = "api/ws";
const SOURCE_PARAMETER = "src";
const SECURE_PAGE = "https:";
const SECURE_SOCKET = "wss:";
const PLAIN_SOCKET = "ws:";

/** How far behind the newest buffered frame playback may drift before it is pulled forward. */
export const MAX_LAG_SECONDS = 1.5;

/** Where a pull lands: just short of the newest frame, so there is something to play into. */
export const LIVE_OFFSET_SECONDS = 0.3;

/** How much already-played video is kept before it is released. */
const KEEP_SECONDS = 10;

/** How soon after the last attempt a stream may be tried again. */
const RECONNECT_MS = 5000;

/*
 * How long a stream may go without a fragment, or a picture with video to play without playing
 * it, before it is presumed dead. A camera that drops off the network does not always close the
 * socket or say so; go2rtc can sit on it waiting, and the tile would wait with it. At fifteen
 * frames a second a live stream is never quiet for anything like this long.
 */
export const STALL_MS = 10000;
const STALL_CHECK_MS = 2000;

/** Where a live camera streams from, published by the cube so a card need not be handed it. */
export interface Go2rtcServer {
  readonly url: string | null;
}

const NO_SERVER: Go2rtcServer = { url: null };

export function provideGo2rtc(server: Go2rtcServer): void {
  setContext(GO2RTC_CONTEXT, server);
}

export function go2rtcServer(): Go2rtcServer {
  return getContext<Go2rtcServer | undefined>(GO2RTC_CONTEXT) ?? NO_SERVER;
}

/** The codecs go2rtc is told it may send, as the comma-separated list its protocol expects. */
export function offeredCodecs(isSupported: (type: string) => boolean): string {
  return VIDEO_CODECS.filter((codec) => isSupported(`video/mp4; codecs="${codec}"`)).join(",");
}

/**
 * The websocket a stream is played over.
 *
 * Built against `url` as a base, so go2rtc behind a path — Frigate's proxy of it, say — works
 * the same as go2rtc on a port of its own. A page served securely has to use a secure socket,
 * so the scheme follows the server's.
 */
export function streamSocketUrl(server: string, stream: string): string {
  const url = new URL(WEBSOCKET_PATH, server.endsWith("/") ? server : `${server}/`);

  url.protocol = url.protocol === SECURE_PAGE ? SECURE_SOCKET : PLAIN_SOCKET;
  url.searchParams.set(SOURCE_PARAMETER, stream);

  return url.toString();
}

/**
 * Where playback should jump to, or null when it is near enough to live to leave alone.
 *
 * A video element plays what it has at its own pace and never catches up on its own, so a
 * stream left running drifts further behind the camera with every stall. On a doorbell that is
 * the difference between seeing who is there and seeing who was.
 */
export function catchUp(currentTime: number, bufferedEnd: number): number | null {
  return bufferedEnd - currentTime > MAX_LAG_SECONDS ? bufferedEnd - LIVE_OFFSET_SECONDS : null;
}

/** What the watchdog should do about a picture: leave it, ask it to play, or start it over. */
export type Playback = "fine" | "resume" | "stuck";

/**
 * Whether a picture is playing the video it has been given.
 *
 * Fragments arriving say nothing about whether they are being shown. The browser pauses a video
 * on its own — a page hidden behind the kiosk's screensaver or with the screen off, a `play()` it
 * would not honour while the page was hidden — and nothing un-pauses it, so the tile holds one
 * frame while the stream behind it runs on. A picture that is paused is asked to play; one that
 * has gone the stall time without moving forward, paused or not, is started over. With nothing
 * buffered there is nothing it could be playing, and that is the fragment watchdog's business.
 */
export function judgePlayback(paused: boolean, buffered: boolean, stillForMs: number): Playback {
  if (!buffered) {
    return "fine";
  }

  if (stillForMs > STALL_MS) {
    return "stuck";
  }

  return paused ? "resume" : "fine";
}

/**
 * Plays a go2rtc stream into a video element until the function it returns is called.
 *
 * Stopping closes the socket and releases the decoder, rather than pausing, so a stream nobody
 * is watching costs neither the tablet nor go2rtc anything.
 *
 * Anything that goes wrong closes the socket, and the socket closing is the one place a
 * reconnect is scheduled, so a source go2rtc cannot start, a decoder that gives up, a stream
 * that goes quiet and a network that drops all recover the same way. go2rtc reports a failed
 * source as a message and leaves the socket open, and a source that hangs it reports not at all,
 * so waiting for the close alone would leave that camera dark for good.
 */
export function playStream(video: HTMLVideoElement, server: string, stream: string): () => void {
  let stopped = false;
  let socket: WebSocket | null = null;
  let retry: number | null = null;
  let attemptedAt = 0;
  let heardAt = 0;
  let advancedAt = 0;
  let playedTo = 0;

  /* Closing the socket is what schedules the reconnect, so with no socket open — the source never
   * opened, or the last one is already closed — there is nothing to close and it is asked for
   * directly. */
  function restart(): void {
    if (socket !== null && socket.readyState <= WebSocket.OPEN) {
      socket.close();
    } else {
      reconnectLater();
    }
  }

  /* Back to live before playing, so a picture that was paused shows the camera now rather than
   * playing out what it missed. */
  function resume(): void {
    const ranges = video.buffered;

    if (ranges.length > 0) {
      const target = catchUp(video.currentTime, ranges.end(ranges.length - 1));
      if (target !== null) {
        video.currentTime = target;
      }
    }

    video.play().catch(() => {
      // Asked again at the next check, and started over if it never does.
    });
  }

  /* Only time the picture spends playing counts as moving: a seek while paused moves
   * `currentTime` too, and would hide a picture that is going nowhere. */
  function checkPlayback(now: number): void {
    const buffered = video.buffered.length > 0;

    if (!buffered || (!video.paused && video.currentTime !== playedTo)) {
      advancedAt = now;
    }

    playedTo = video.currentTime;

    const verdict = judgePlayback(video.paused, buffered, now - advancedAt);

    if (verdict === "stuck") {
      advancedAt = now;
      restart();
    } else if (verdict === "resume") {
      resume();
    }
  }

  /* A page coming back from behind the screensaver plays again at once rather than at the next
   * check, and the time it spent hidden does not count against it. */
  function returned(): void {
    if (document.hidden) {
      return;
    }

    advancedAt = Date.now();

    if (video.paused) {
      resume();
    }
  }

  /* No sooner than the interval after the last attempt, so a source that is down is asked
   * again at a walking pace rather than in a loop that keeps go2rtc restarting it. */
  function reconnectLater(): void {
    if (stopped || retry !== null) {
      return;
    }

    const wait = Math.max(RECONNECT_MS - (Date.now() - attemptedAt), 0);

    retry = window.setTimeout(() => {
      retry = null;
      connect();
    }, wait);
  }

  function connect(): void {
    attemptedAt = Date.now();
    heardAt = attemptedAt;
    advancedAt = attemptedAt;

    const source = new MediaSource();
    const queue: ArrayBuffer[] = [];
    let buffer: SourceBuffer | null = null;

    const objectUrl = URL.createObjectURL(source);
    video.src = objectUrl;

    /* A SourceBuffer takes one change at a time, so everything goes through here once the last
     * has finished: the next fragment if one is waiting, and housekeeping when none is. */
    function pump(): void {
      if (!buffer || buffer.updating) {
        return;
      }

      const next = queue.shift();
      if (next) {
        try {
          buffer.appendBuffer(next);
        } catch {
          restart();
        }

        return;
      }

      if (buffer.buffered.length === 0) {
        return;
      }

      const start = buffer.buffered.start(0);
      const end = buffer.buffered.end(buffer.buffered.length - 1);

      const target = catchUp(video.currentTime, end);
      if (target !== null) {
        video.currentTime = target;
      }

      if (video.currentTime - start > KEEP_SECONDS) {
        buffer.remove(start, video.currentTime - KEEP_SECONDS);
      }
    }

    source.addEventListener(
      "sourceopen",
      () => {
        URL.revokeObjectURL(objectUrl);

        if (stopped) {
          return;
        }

        const current = new WebSocket(streamSocketUrl(server, stream));
        current.binaryType = "arraybuffer";
        socket = current;

        current.addEventListener("open", () => {
          const codecs = offeredCodecs((type) => MediaSource.isTypeSupported(type));
          current.send(JSON.stringify({ type: MSE_MESSAGE, value: codecs }));
        });

        current.addEventListener("message", (event) => {
          if (typeof event.data === "string") {
            const message = JSON.parse(event.data);

            if (message.type === ERROR_MESSAGE) {
              current.close();
            } else if (message.type === MSE_MESSAGE && buffer === null) {
              try {
                buffer = source.addSourceBuffer(message.value);
                buffer.mode = "segments";
                buffer.addEventListener("updateend", pump);
              } catch {
                current.close();
              }
            }

            return;
          }

          heardAt = Date.now();
          queue.push(event.data);
          pump();
        });

        current.addEventListener("close", reconnectLater);
      },
      { once: true },
    );

    video.play().catch(() => {
      // Muted, so autoplay is allowed; a refusal only means the first frame waits to be asked.
    });
  }

  /* A hidden page is not judged on its picture: the browser will not play it there, and starting
   * it over would only fail the same way. */
  const watchdog = window.setInterval(() => {
    const now = Date.now();

    if (now - heardAt > STALL_MS) {
      restart();
    } else if (!document.hidden) {
      checkPlayback(now);
    }
  }, STALL_CHECK_MS);

  video.addEventListener("error", restart);
  document.addEventListener("visibilitychange", returned);
  connect();

  return () => {
    stopped = true;
    window.clearInterval(watchdog);
    video.removeEventListener("error", restart);
    document.removeEventListener("visibilitychange", returned);

    if (retry !== null) {
      window.clearTimeout(retry);
    }

    socket?.close();
    video.removeAttribute("src");
    video.load();
  };
}
