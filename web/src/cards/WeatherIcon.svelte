<script lang="ts">
  /*
   * Animated weather glyphs, taken from the card the dashboard this replaces used. They carry
   * their own SMIL animation and so move from an <img> with no script at all.
   *
   * They are drawn dark, to be inverted by whatever shows them — which is where the grey
   * outline and the white cloud behind it come from.
   */

  const CLEAR_DAY = "clear";
  const CLEAR_NIGHT = "clear-night";
  const PARTLY_CLOUDY_DAY = "partly-cloudy";
  const PARTLY_CLOUDY_NIGHT = "partly-cloudy-night";

  /** Conditions whose glyph does not depend on whether the sun is up. */
  const CONDITIONS: Record<string, string> = {
    cloudy: "cloudy",
    exceptional: "exceptional",
    fog: "fog",
    hail: "hail",
    lightning: "lightning",
    "lightning-rainy": "lightning-rainy",
    pouring: "pouring",
    rainy: "rainy",
    snowy: "snowy",
    "snowy-rainy": "snowy-rainy",
    windy: "windy",
    // The set draws one wind glyph; the variant is the same weather with more cloud.
    "windy-variant": "windy",
  };

  /** Conditions that do, as [day, night]. */
  const DAY_NIGHT_CONDITIONS: Record<string, [string, string]> = {
    sunny: [CLEAR_DAY, CLEAR_NIGHT],
    "clear-night": [CLEAR_NIGHT, CLEAR_NIGHT],
    partlycloudy: [PARTLY_CLOUDY_DAY, PARTLY_CLOUDY_NIGHT],
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
      return daytime ? CLEAR_DAY : CLEAR_NIGHT;
    }

    const pair = DAY_NIGHT_CONDITIONS[condition];
    if (pair) {
      return daytime ? pair[0] : pair[1];
    }

    return CONDITIONS[condition] ?? (daytime ? CLEAR_DAY : CLEAR_NIGHT);
  });
</script>

<img class="weather-icon" src={SOURCES[name]} alt={condition ?? "weather"} />

<style>
  .weather-icon {
    display: block;
    width: 1em;
    height: 1em;
    /* Absorbs the transparent margin the glyph carries on its trailing edge. */
    margin-right: -0.5rem;
    filter: var(--weather-icon-filter);
  }
</style>
