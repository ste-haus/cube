<script lang="ts">
  /*
   * Animated weather glyphs — the amCharts set the dashboard this replaces used, which carry
   * their own CSS keyframes and so animate from an <img> without any script.
   *
   * Home Assistant's conditions are mapped onto that set the way the card did it.
   */

  const DAY = "day";
  const NIGHT = "night";
  const CLOUDY = "cloudy";
  const CLOUDY_DAY = "cloudy-day-3";
  const CLOUDY_NIGHT = "cloudy-night-3";
  const RAIN = "rainy-5";
  const POURING = "rainy-6";
  const SLEET = "rainy-7";
  const SNOW = "snowy-6";
  const THUNDER = "thunder";

  /** Conditions whose glyph does not depend on whether the sun is up. */
  const CONDITIONS: Record<string, string> = {
    cloudy: CLOUDY,
    fog: CLOUDY,
    hail: SLEET,
    lightning: THUNDER,
    "lightning-rainy": THUNDER,
    pouring: POURING,
    rainy: RAIN,
    snowy: SNOW,
    "snowy-rainy": SLEET,
    windy: CLOUDY,
  };

  /** Conditions that do, as [day, night]. */
  const DAY_NIGHT_CONDITIONS: Record<string, [string, string]> = {
    sunny: [DAY, NIGHT],
    "clear-night": [NIGHT, NIGHT],
    partlycloudy: [CLOUDY_DAY, CLOUDY_NIGHT],
    "windy-variant": [CLOUDY_DAY, CLOUDY_NIGHT],
    exceptional: [DAY, NIGHT],
  };

  const SOURCES: Record<string, string> = Object.fromEntries(
    Object.entries(
      import.meta.glob("../icons/weather/*.svg", { eager: true, query: "?url", import: "default" }),
    ).map(([path, url]) => [path.split("/").pop()!.replace(".svg", ""), url as string]),
  );

  let {
    condition,
    daytime = true,
  }: { condition: string | null; daytime?: boolean } = $props();

  const name = $derived.by(() => {
    if (!condition) {
      return daytime ? DAY : NIGHT;
    }

    const pair = DAY_NIGHT_CONDITIONS[condition];
    if (pair) {
      return daytime ? pair[0] : pair[1];
    }

    return CONDITIONS[condition] ?? (daytime ? DAY : NIGHT);
  });
</script>

<img class="weather-icon" src={SOURCES[name]} alt={condition ?? "weather"} />

<style>
  .weather-icon {
    display: block;
    width: 1em;
    height: 1em;
    /* The set ships in colour; the panel wants it in the same grey as everything else. */
    filter: var(--weather-icon-filter);
  }
</style>
