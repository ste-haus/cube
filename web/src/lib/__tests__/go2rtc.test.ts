import { describe, expect, it } from "vitest";

import { LIVE_OFFSET_SECONDS, MAX_LAG_SECONDS, catchUp, offeredCodecs, streamSocketUrl } from "../go2rtc";

describe("offeredCodecs", () => {
  it("offers only what the tablet says it can play", () => {
    const h264Only = (type: string) => type.includes("avc1");

    expect(offeredCodecs(h264Only).split(",").every((codec) => codec.startsWith("avc1"))).toBe(true);
  });

  it("offers nothing when the tablet can play nothing", () => {
    expect(offeredCodecs(() => false)).toBe("");
  });

  it("never asks for audio, since the panel is muted", () => {
    expect(offeredCodecs(() => true)).not.toMatch(/mp4a|opus|flac/);
  });
});

describe("streamSocketUrl", () => {
  it("opens a plain socket to a plain server", () => {
    expect(streamSocketUrl("http://go2rtc.example:1984", "frontdoor")).toBe(
      "ws://go2rtc.example:1984/api/ws?src=frontdoor",
    );
  });

  it("opens a secure socket to a secure server, since a secure page may open no other", () => {
    expect(streamSocketUrl("https://go2rtc.example", "frontdoor")).toBe(
      "wss://go2rtc.example/api/ws?src=frontdoor",
    );
  });

  it("keeps a path go2rtc is served under, as behind Frigate's proxy", () => {
    expect(streamSocketUrl("http://frigate.example:5000/live/mse", "frontdoor")).toBe(
      "ws://frigate.example:5000/live/mse/api/ws?src=frontdoor",
    );
  });

  it("does not care whether the base ends in a slash", () => {
    expect(streamSocketUrl("http://go2rtc.example:1984/", "frontdoor")).toBe(
      streamSocketUrl("http://go2rtc.example:1984", "frontdoor"),
    );
  });

  it("carries a stream name that needs escaping", () => {
    expect(streamSocketUrl("http://go2rtc.example:1984", "front door&x=1")).toBe(
      "ws://go2rtc.example:1984/api/ws?src=front+door%26x%3D1",
    );
  });
});

describe("catchUp", () => {
  it("leaves playback alone while it is near live", () => {
    expect(catchUp(10, 10 + MAX_LAG_SECONDS)).toBeNull();
  });

  it("pulls playback forward once it has fallen behind", () => {
    const end = 20;

    expect(catchUp(10, end)).toBeCloseTo(end - LIVE_OFFSET_SECONDS);
  });

  it("lands short of the newest frame, so there is something left to play", () => {
    const end = 20;
    const target = catchUp(0, end);

    expect(target).not.toBeNull();
    expect(target as number).toBeLessThan(end);
  });
});
