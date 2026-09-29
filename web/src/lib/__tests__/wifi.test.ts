import { describe, expect, it } from "vitest";

import { codeUrl, wifiPayload } from "../wifi";

describe("wifiPayload", () => {
  it("says what a phone needs to join", () => {
    expect(wifiPayload({ ssid: "Guest", password: "hunter2", security: "WPA", hidden: false })).toBe(
      "WIFI:T:WPA;S:Guest;P:hunter2;;",
    );
  });

  it("says when the network hides its name", () => {
    expect(wifiPayload({ ssid: "Guest", password: "hunter2", security: "WPA", hidden: true })).toBe(
      "WIFI:T:WPA;S:Guest;P:hunter2;H:true;;",
    );
  });

  it("escapes what would otherwise end a field", () => {
    expect(wifiPayload({ ssid: 'a;b,c"d', password: String.raw`e:f\g`, security: "WPA", hidden: false })).toBe(
      String.raw`WIFI:T:WPA;S:a\;b\,c\"d;P:e\:f\\g;;`,
    );
  });

  it("gives an open network no password", () => {
    expect(wifiPayload({ ssid: "Open", password: "", security: "nopass", hidden: false })).toBe("WIFI:T:nopass;S:Open;;");
  });
});

describe("codeUrl", () => {
  it("puts the network and the size into the page's address, escaped", () => {
    expect(codeUrl("https://qr.example/?data={data}&size={size}", "WIFI:S:a b;;", 299.6)).toBe(
      "https://qr.example/?data=WIFI%3AS%3Aa%20b%3B%3B&size=300",
    );
  });
});
