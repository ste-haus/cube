import { describe, expect, it } from "vitest";

import {
  announcing,
  PENDING,
  phaseOnArrival,
  PLAYING,
  READING,
  startedAnnouncing,
  type Playback,
} from "../transcript";

const IDLE = "idle";
const BUFFERING = "buffering";
const SPEAKER = "media_player.kitchen";
const MARKER = "chime_tts";
const MUSIC = "http://ha.local/music.mp3";
const OTHER_MUSIC = "http://ha.local/more-music.mp3";
const ANNOUNCEMENT = "http://ha.local/local/chime_tts/one.mp3";
const NEXT_ANNOUNCEMENT = "http://ha.local/local/chime_tts/two.mp3";

const at = (state: string | null, content: string | null = null): Playback => ({ state, content });

describe("announcing", () => {
  it("is playing content carrying the marker", () => {
    expect(announcing(at(PLAYING, ANNOUNCEMENT), MARKER)).toBe(true);
  });

  it("is not playing anything else", () => {
    expect(announcing(at(PLAYING, MUSIC), MARKER)).toBe(false);
  });

  it("is not a marked announcement that is not playing", () => {
    expect(announcing(at(IDLE, ANNOUNCEMENT), MARKER)).toBe(false);
  });

  it("is anything playing without a marker", () => {
    expect(announcing(at(PLAYING, MUSIC), null)).toBe(true);
  });
});

describe("startedAnnouncing", () => {
  it("counts idle to announcing", () => {
    expect(startedAnnouncing(at(IDLE), at(PLAYING, ANNOUNCEMENT), MARKER)).toBe(true);
  });

  it("counts buffering to announcing", () => {
    expect(startedAnnouncing(at(BUFFERING, ANNOUNCEMENT), at(PLAYING, ANNOUNCEMENT), MARKER)).toBe(true);
  });

  it("counts a speaker coming back from unavailable already announcing", () => {
    expect(startedAnnouncing(at(null), at(PLAYING, ANNOUNCEMENT), MARKER)).toBe(true);
  });

  it("counts an announcement over music", () => {
    expect(startedAnnouncing(at(PLAYING, MUSIC), at(PLAYING, ANNOUNCEMENT), MARKER)).toBe(true);
  });

  it("counts one announcement following another", () => {
    expect(startedAnnouncing(at(PLAYING, ANNOUNCEMENT), at(PLAYING, NEXT_ANNOUNCEMENT), MARKER)).toBe(true);
  });

  it("does not count music starting", () => {
    expect(startedAnnouncing(at(IDLE), at(PLAYING, MUSIC), MARKER)).toBe(false);
  });

  it("does not count one song following another", () => {
    expect(startedAnnouncing(at(PLAYING, MUSIC), at(PLAYING, OTHER_MUSIC), MARKER)).toBe(false);
  });

  it("does not count the same announcement carrying on", () => {
    expect(startedAnnouncing(at(PLAYING, ANNOUNCEMENT), at(PLAYING, ANNOUNCEMENT), MARKER)).toBe(false);
  });

  it("does not count stopping", () => {
    expect(startedAnnouncing(at(PLAYING, ANNOUNCEMENT), at(IDLE), MARKER)).toBe(false);
  });

  it("counts music starting without a marker", () => {
    expect(startedAnnouncing(at(IDLE), at(PLAYING, MUSIC), null)).toBe(true);
  });
});

describe("phaseOnArrival", () => {
  it("waits for a speaker that is not playing", () => {
    expect(phaseOnArrival(SPEAKER, at(IDLE), MARKER)).toBe(PENDING);
  });

  it("waits for a speaker playing music", () => {
    expect(phaseOnArrival(SPEAKER, at(PLAYING, MUSIC), MARKER)).toBe(PENDING);
  });

  it("reads at once when the speaker is already announcing", () => {
    expect(phaseOnArrival(SPEAKER, at(PLAYING, ANNOUNCEMENT), MARKER)).toBe(READING);
  });

  it("reads at once over music without a marker", () => {
    expect(phaseOnArrival(SPEAKER, at(PLAYING, MUSIC), null)).toBe(READING);
  });

  it("reads at once with no speaker to wait for", () => {
    expect(phaseOnArrival(null, at(null), MARKER)).toBe(READING);
  });
});
