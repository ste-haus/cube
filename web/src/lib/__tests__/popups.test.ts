import { describe, expect, it } from "vitest";

import { dismissedAfterClose, popupToShow, stillDismissed, waitingLabel } from "../popups";
import type { Popup } from "../types";

const PORCH = "binary_sensor.porch_activity";
const DRIVEWAY = "binary_sensor.driveway_activity";
const CAMERA = "camera.porch";
const POLLING_INTERVAL = 1;
const RATIO = 16 / 9;

function popup(entityId: string): Popup {
  return {
    entity_id: entityId,
    camera: {
      entity_id: CAMERA,
      title: null,
      stream_type: "polling",
      polling_interval: POLLING_INTERVAL,
      stream: null,
    },
    ratio: RATIO,
  };
}

const POPUPS = [popup(PORCH), popup(DRIVEWAY)];
const NONE = new Set<string>();

function on(...entityIds: string[]) {
  return (entityId: string) => entityIds.includes(entityId);
}

describe("which popup is up", () => {
  it("is none while every sensor is off", () => {
    expect(popupToShow(POPUPS, on(), NONE)).toBeNull();
  });

  it("is the one whose sensor is on", () => {
    expect(popupToShow(POPUPS, on(DRIVEWAY), NONE)?.entity_id).toBe(DRIVEWAY);
  });

  it("is the first the config lists when more than one is on", () => {
    expect(popupToShow(POPUPS, on(DRIVEWAY, PORCH), NONE)?.entity_id).toBe(PORCH);
  });

  it("passes over one that has been put away", () => {
    expect(popupToShow(POPUPS, on(DRIVEWAY, PORCH), new Set([PORCH]))?.entity_id).toBe(DRIVEWAY);
    expect(popupToShow(POPUPS, on(PORCH), new Set([PORCH]))).toBeNull();
  });
});

describe("what stays put away", () => {
  it("keeps a popup away while its sensor is still on", () => {
    expect(stillDismissed(new Set([PORCH]), on(PORCH))).toEqual(new Set([PORCH]));
  });

  it("forgets a popup once its sensor has gone off", () => {
    expect(stillDismissed(new Set([PORCH, DRIVEWAY]), on(DRIVEWAY))).toEqual(new Set([DRIVEWAY]));
  });
});

describe("what is put away when a window closes", () => {
  const PORCH_POPUP = POPUPS[0];

  it("puts away one tapped off while its sensor is on", () => {
    expect(dismissedAfterClose(NONE, PORCH_POPUP, false, on(PORCH))).toEqual(new Set([PORCH]));
  });

  it("puts away nothing tapped off once its sensor has gone off", () => {
    expect(dismissedAfterClose(NONE, PORCH_POPUP, false, on())).toEqual(NONE);
  });

  it("brings back one whose sensor came on again while it folded away", () => {
    const dismissed = dismissedAfterClose(NONE, PORCH_POPUP, true, on(PORCH));

    expect(popupToShow(POPUPS, on(PORCH), dismissed)?.entity_id).toBe(PORCH);
  });

  it("brings back one folded away for a popup listed before it, once that one has gone", () => {
    const later = popup(DRIVEWAY);
    const dismissed = dismissedAfterClose(NONE, later, true, on(PORCH, DRIVEWAY));

    expect(popupToShow(POPUPS, on(PORCH, DRIVEWAY), dismissed)?.entity_id).toBe(PORCH);
    expect(popupToShow(POPUPS, on(DRIVEWAY), dismissed)?.entity_id).toBe(DRIVEWAY);
  });
});

describe("waitingLabel", () => {
  const since = new Date("2026-10-06T17:00:00Z");
  const after = (seconds: number) => new Date(since.getTime() + seconds * 1000);

  it("counts minutes and seconds while it is under the hour", () => {
    expect(waitingLabel(since, after(42))).toBe("+0:42");
    expect(waitingLabel(since, after(12 * 60 + 5))).toBe("+12:05");
  });

  it("adds the hours once it runs past one", () => {
    expect(waitingLabel(since, after(3600 + 2 * 60 + 3))).toBe("+1:02:03");
  });

  it("never counts below nought, for a clock a little behind Home Assistant's", () => {
    expect(waitingLabel(since, after(-3))).toBe("+0:00");
  });
});
