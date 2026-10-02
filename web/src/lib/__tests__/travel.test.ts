import { describe, expect, it } from "vitest";

import {
  activeRoutes,
  beatPhase,
  carouselStrip,
  commuteSlowness,
  countdown,
  countdownClock,
  departureAt,
  departureTime,
  destinationFromName,
  leavesFromHome,
  localMoment,
  momentOf,
  timeAgo,
  trafficDelay,
  trafficSlowness,
  trendOf,
  samePlace,
  slowness,
  urgency,
} from "../travel";
import type { TravelTime } from "../types";

const DETAILS = {
  short_name: null,
  free_flow_entity_id: null,
  distance_entity_id: null,
  destination_entity_id: null,
  destination_attribute: null,
  calendar_entity_id: null,
  checked_entity_id: null,
  usual_entity_id: null,
};
const ALICE: TravelTime = {
  entity_id: "sensor.alice",
  name: "Alice",
  departure_entity_id: "sensor.alice_leave",
  person_entity_id: "person.alice",
  ...DETAILS,
};
const BOB: TravelTime = {
  entity_id: "sensor.bob",
  name: "Bob",
  departure_entity_id: null,
  person_entity_id: null,
  ...DETAILS,
};
const COMMUTE: TravelTime = {
  entity_id: "sensor.commute",
  name: "Commute",
  departure_entity_id: null,
  person_entity_id: null,
  ...DETAILS,
};

function reader(states: Record<string, string | null>) {
  return (entityId: string) => states[entityId] ?? null;
}

describe("activeRoutes", () => {
  it("keeps the routes reading nought or more, in the config's order", () => {
    const active = activeRoutes(
      [ALICE, BOB, COMMUTE],
      reader({
        "sensor.alice": "34",
        "sensor.bob": "-1",
        "sensor.commute": "0",
      }),
    );

    expect(active.map(({ route }) => route.name)).toEqual(["Alice", "Commute"]);
  });

  it("puts trips with a time to leave ahead of the routes that are always there", () => {
    const CAROL: TravelTime = {
      ...ALICE,
      entity_id: "sensor.carol",
      name: "Carol",
    };
    const states = {
      "sensor.alice": "34",
      "sensor.bob": "20",
      "sensor.commute": "18",
      "sensor.carol": "9",
    };

    const active = activeRoutes([BOB, ALICE, COMMUTE, CAROL], reader(states));

    expect(active.map(({ route }) => route.name)).toEqual(["Alice", "Carol", "Bob", "Commute"]);
  });

  it("counts a route it cannot read as no trip", () => {
    const active = activeRoutes([ALICE, BOB], reader({ "sensor.alice": null, "sensor.bob": "soon" }));

    expect(active).toEqual([]);
  });

  it("rounds the minutes", () => {
    const [active] = activeRoutes([ALICE], reader({ "sensor.alice": "21.6" }));

    expect(active.minutes).toBe(22);
  });
});

describe("departureAt", () => {
  it("reads a Unix timestamp", () => {
    const leave = new Date(2026, 9, 1, 17, 5);

    expect(departureAt(String(leave.getTime() / 1000))).toEqual(leave);
  });

  it("gives nothing when there is no time to leave by", () => {
    expect(departureAt("-")).toBeNull();
    expect(departureAt(null)).toBeNull();
    expect(departureAt("0")).toBeNull();
  });
});

describe("departureTime", () => {
  it("gives the time on a 24-hour clock", () => {
    expect(departureTime(new Date(2026, 9, 1, 17, 5))).toBe("17:05");
  });
});

const NOW = new Date(2026, 9, 1, 17, 0);
const inMinutes = (minutes: number) => new Date(NOW.getTime() + minutes * 60 * 1000);

describe("countdown", () => {
  it("counts up to the time to leave from below nought, in whole minutes", () => {
    expect(countdown(inMinutes(15), NOW)).toBe(-15);
    expect(countdown(inMinutes(4.5), NOW)).toBe(-5);
    expect(countdown(inMinutes(0.5), NOW)).toBe(-1);
  });

  it("gives no number once the time has come", () => {
    expect(countdown(inMinutes(0), NOW)).toBeNull();
    expect(countdown(inMinutes(-3.2), NOW)).toBeNull();
  });
});

describe("urgency", () => {
  const THRESHOLDS = { imminent_minutes: 5, soon_minutes: 15 };

  it("is calm with time in hand", () => {
    expect(urgency(inMinutes(15), NOW, THRESHOLDS)).toBeNull();
  });

  it("is soon as the time nears", () => {
    expect(urgency(inMinutes(14), NOW, THRESHOLDS)).toBe("soon");
    expect(urgency(inMinutes(5), NOW, THRESHOLDS)).toBe("soon");
  });

  it("is imminent once it is close, and once it has gone", () => {
    expect(urgency(inMinutes(4), NOW, THRESHOLDS)).toBe("imminent");
    expect(urgency(inMinutes(-10), NOW, THRESHOLDS)).toBe("imminent");
  });
});

const SLOWER = {
  slower_percent: 10,
  much_slower_percent: 20,
  traffic_slower_minutes: 8,
  traffic_slower_percent: 40,
  traffic_much_slower_minutes: 15,
  traffic_much_slower_percent: 75,
};

describe("slowness", () => {
  const THRESHOLDS = SLOWER;
  const USUAL = 30;

  it("is calm at or under ten percent over its usual time", () => {
    expect(slowness(25, USUAL, THRESHOLDS)).toBeNull();
    expect(slowness(33, USUAL, THRESHOLDS)).toBeNull();
  });

  it("is soon past ten percent over, up to twenty", () => {
    expect(slowness(34, USUAL, THRESHOLDS)).toBe("soon");
    expect(slowness(36, USUAL, THRESHOLDS)).toBe("soon");
  });

  it("is imminent past twenty percent over", () => {
    expect(slowness(37, USUAL, THRESHOLDS)).toBe("imminent");
  });

  it("says nothing without a usual time to go by", () => {
    expect(slowness(60, null, THRESHOLDS)).toBeNull();
    expect(slowness(60, 0, THRESHOLDS)).toBeNull();
  });
});

describe("trafficSlowness", () => {
  it("is calm while traffic adds what an ordinary evening does", () => {
    expect(trafficSlowness(22, 16, SLOWER)).toBeNull();
  });

  it("needs both the minutes and the percent before it is slower", () => {
    expect(trafficSlowness(25, 16, SLOWER)).toBe("soon");
    // Ten minutes is plenty, but only a fifth of an hour's drive.
    expect(trafficSlowness(70, 60, SLOWER)).toBeNull();
    // Over half again, but only five minutes of it.
    expect(trafficSlowness(14, 9, SLOWER)).toBeNull();
  });

  it("is imminent once it is over both of the much-slower pair", () => {
    expect(trafficSlowness(32, 16, SLOWER)).toBe("imminent");
    expect(trafficSlowness(30, 16, SLOWER)).toBe("soon");
  });

  it("says nothing without a free flow to go by", () => {
    expect(trafficSlowness(60, null, SLOWER)).toBeNull();
    expect(trafficSlowness(60, 0, SLOWER)).toBeNull();
  });
});

describe("commuteSlowness", () => {
  it("believes a usual time that says all is well, whatever traffic adds", () => {
    expect(commuteSlowness(32, 31, 16, SLOWER)).toBeNull();
  });

  it("goes by its usual time when it has one", () => {
    expect(commuteSlowness(36, 30, 35, SLOWER)).toBe("soon");
  });

  it("falls back on what traffic adds with no usual time", () => {
    expect(commuteSlowness(32, null, 16, SLOWER)).toBe("imminent");
    expect(commuteSlowness(32, 0, 16, SLOWER)).toBe("imminent");
  });

  it("says nothing with neither", () => {
    expect(commuteSlowness(60, null, null, SLOWER)).toBeNull();
  });
});

describe("leavesFromHome", () => {
  it("holds a trip back only while its person is away from home", () => {
    expect(leavesFromHome(ALICE, reader({ "person.alice": "home" }))).toBe(true);
    expect(leavesFromHome(ALICE, reader({ "person.alice": "not_home" }))).toBe(false);
    expect(leavesFromHome(ALICE, reader({ "person.alice": "Work" }))).toBe(false);
  });

  it("counts a person it cannot place as still at the door", () => {
    expect(leavesFromHome(ALICE, reader({}))).toBe(true);
  });

  it("always counts a trip that names nobody", () => {
    expect(leavesFromHome(BOB, reader({}))).toBe(true);
  });
});

describe("carouselStrip", () => {
  const CARDS = ["a", "b", "c"];

  it("lays out the cards showing with one either side", () => {
    expect(carouselStrip(CARDS, 0, 2)).toEqual(["c", "a", "b", "c"]);
    expect(carouselStrip(CARDS, 1, 2)).toEqual(["a", "b", "c", "a"]);
  });

  it("wraps round both ends", () => {
    expect(carouselStrip(CARDS, 2, 2)).toEqual(["b", "c", "a", "b"]);
    expect(carouselStrip(CARDS, -1, 2)).toEqual(["b", "c", "a", "b"]);
  });
});

describe("momentOf", () => {
  const AT = new Date(2026, 9, 1, 8, 30);
  const SECONDS = AT.getTime() / 1000;

  it("reads an input_datetime's timestamp ahead of its state", () => {
    expect(momentOf("garbage", SECONDS)).toEqual(AT);
  });

  it("reads a Unix timestamp state, and a local date and time", () => {
    expect(momentOf(String(SECONDS))).toEqual(AT);
    expect(momentOf("2026-10-01 08:30:00")).toEqual(AT);
  });

  it("counts a cleared stamp, and anything unreadable, as no moment", () => {
    expect(momentOf("1970-01-01 00:00:00", 28800)).toBeNull();
    expect(momentOf("1970-01-01 00:00:00")).toBeNull();
    expect(momentOf("soon")).toBeNull();
    expect(momentOf(null)).toBeNull();
  });
});

describe("localMoment", () => {
  it("reads Home Assistant's local date and time", () => {
    expect(localMoment("2026-10-02 14:05:00")).toEqual(new Date(2026, 9, 2, 14, 5));
    expect(localMoment("")).toBeNull();
  });
});

describe("trafficDelay", () => {
  it("is what traffic adds, never below nought", () => {
    expect(trafficDelay(34, 25.4)).toBe(9);
    expect(trafficDelay(20, 22)).toBe(0);
    expect(trafficDelay(20, null)).toBe(0);
  });
});

describe("timeAgo", () => {
  const ago = (seconds: number) => timeAgo(new Date(NOW.getTime() - seconds * 1000), NOW, "en");

  it("puts it in the largest whole unit that fits", () => {
    expect(ago(30)).toBe("30 seconds ago");
    expect(ago(4 * 60 + 50)).toBe("4 minutes ago");
    expect(ago(2 * 60 * 60 + 5 * 60)).toBe("2 hours ago");
    expect(ago(3 * 24 * 60 * 60)).toBe("3 days ago");
  });

  it("never says a moment is still to come", () => {
    expect(ago(-90)).toBe("0 seconds ago");
  });
});

describe("countdownClock", () => {
  const leaving = (seconds: number) => countdownClock(new Date(NOW.getTime() + seconds * 1000), NOW);

  it("reads to the second, as a clock does", () => {
    expect(leaving(11 * 60 + 42)).toBe("\u221211:42");
    expect(leaving(9)).toBe("\u22120:09");
    expect(leaving(65 * 60 + 9)).toBe("\u22121:05:09");
  });

  it("has nothing to say once the time has come", () => {
    expect(leaving(0)).toBeNull();
    expect(leaving(-30)).toBeNull();
  });
});

describe("destinationFromName", () => {
  it("reads where a route goes from a name that says where from and where to", () => {
    expect(destinationFromName("sensor.travel_time_lab_to_home")).toBe("Home");
    expect(destinationFromName("sensor.travel_time_home_to_lab")).toBe("Lab");
    expect(destinationFromName("sensor.travel_time_home_to_new_office")).toBe("New Office");
  });

  it("says nothing for a name that does not", () => {
    expect(destinationFromName("sensor.travel_time_erik")).toBeNull();
    expect(destinationFromName("sensor.travel_time_home_to_")).toBeNull();
  });
});

describe("trendOf", () => {
  const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60 * 1000).toISOString();

  it("measures against the last reading that differed from now", () => {
    const history = [
      { state: "28", last_changed: at(-40) },
      { state: "31", last_changed: at(-20) },
      { state: "34", last_changed: at(-5) },
    ];

    expect(trendOf(history, 34)).toBe(3);
  });

  it("reads a quicker route as below nought", () => {
    expect(
      trendOf(
        [
          { state: "40", last_changed: at(-30) },
          { state: "36.4", last_changed: at(-2) },
        ],
        36,
      ),
    ).toBe(-4);
  });

  it("says nothing across a gap where the route was not kept up to date", () => {
    const history = [
      { state: "40", last_changed: at(-90) },
      { state: "-1", last_changed: at(-60) },
      { state: "34", last_changed: at(-5) },
    ];

    expect(trendOf(history, 34)).toBeNull();
  });

  it("says nothing with nothing to compare", () => {
    expect(trendOf([{ state: "34", last_changed: at(-5) }], 34)).toBeNull();
  });
});

describe("samePlace", () => {
  it("matches places written alike, give or take case and spacing", () => {
    expect(samePlace("Botanica,  701 Amidon St", " botanica, 701 amidon st ")).toBe(true);
    expect(samePlace("Botanica", "Midas")).toBe(false);
    expect(samePlace(null, "Midas")).toBe(false);
  });
});

describe("beatPhase", () => {
  it("puts anything started at any moment at the page's point in the beat", () => {
    expect(beatPhase(900, 2000)).toBe("-200ms");
    expect(beatPhase(900, 2900)).toBe("-200ms");
  });
});
