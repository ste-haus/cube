import { afterEach, describe, expect, it } from "vitest";

import { ha } from "../state.svelte";
import type { EntityState } from "../types";

const PORCH = "binary_sensor.porch";
const CHANGED_SECONDS = 1791335835.5;

function entity(lastChanged: number | null): EntityState {
  return { state: "on", attributes: {}, last_changed: lastChanged, last_updated: lastChanged };
}

afterEach(() => {
  ha.entities = {};
});

describe("changedAt", () => {
  it("reads Home Assistant's seconds since the epoch", () => {
    ha.entities = { [PORCH]: entity(CHANGED_SECONDS) };

    expect(ha.changedAt(PORCH)?.toISOString()).toBe("2026-10-07T01:17:15.500Z");
  });

  it("is null for an entity it has not heard of, or one that does not say", () => {
    ha.entities = { [PORCH]: entity(null) };

    expect(ha.changedAt(PORCH)).toBeNull();
    expect(ha.changedAt("binary_sensor.elsewhere")).toBeNull();
  });
});
