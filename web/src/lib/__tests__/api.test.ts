import { afterEach, describe, expect, it, vi } from "vitest";

import { currentProfile, faceUrl } from "../api";

/** One bundle serves every panel, so the only thing telling them apart is their own URL. */
function servedAt(search: string): void {
  vi.stubGlobal("window", { location: { search } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("currentProfile", () => {
  it("reads the profile a panel asks for", () => {
    servedAt("?profile=lr");

    expect(currentProfile()).toBe("lr");
  });

  it("finds it alongside other parameters", () => {
    servedAt("?kiosk=1&profile=pb");

    expect(currentProfile()).toBe("pb");
  });

  it("has none when the panel names none", () => {
    servedAt("");

    expect(currentProfile()).toBeNull();
  });

  it("treats an empty value as naming none, rather than as an empty key", () => {
    servedAt("?profile=");

    expect(currentProfile()).toBeNull();
  });
});

describe("faceUrl", () => {
  it("addresses a page in the resources directory", () => {
    expect(faceUrl("bedroom")).toBe("/faces/bedroom/");
  });

  it("escapes a name rather than letting it shape the path", () => {
    expect(faceUrl("../secret")).toBe("/faces/..%2Fsecret/");
  });
});
