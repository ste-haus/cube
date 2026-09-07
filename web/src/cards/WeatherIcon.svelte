<script lang="ts">
  import Skycons from "../vendor/skycons";

  /* Animated weather glyphs, drawn on a canvas the way the panel that predates Lovelace drew
   * them. Home Assistant's conditions are mapped onto the set Skycons knows. */

  const CLEAR_DAY = "clear-day";
  const CLEAR_NIGHT = "clear-night";
  const PARTLY_CLOUDY_DAY = "partly-cloudy-day";
  const PARTLY_CLOUDY_NIGHT = "partly-cloudy-night";
  const CLOUDY = "cloudy";
  const RAIN = "rain";
  const SLEET = "sleet";
  const SNOW = "snow";
  const WIND = "wind";
  const FOG = "fog";

  const CONDITIONS: Record<string, string> = {
    "clear-night": CLEAR_NIGHT,
    cloudy: CLOUDY,
    exceptional: CLOUDY,
    fog: FOG,
    hail: SLEET,
    lightning: RAIN,
    "lightning-rainy": RAIN,
    pouring: RAIN,
    rainy: RAIN,
    snowy: SNOW,
    "snowy-rainy": SLEET,
    sunny: CLEAR_DAY,
    windy: WIND,
    "windy-variant": WIND,
  };

  /** The one condition that needs to know whether the sun is up. */
  const PARTLY_CLOUDY = "partlycloudy";

  const CANVAS_SIZE = 128;

  let {
    condition,
    daytime = true,
    color = "#dddddd",
  }: { condition: string | null; daytime?: boolean; color?: string } = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);

  const icon = $derived.by(() => {
    if (condition === PARTLY_CLOUDY) {
      return daytime ? PARTLY_CLOUDY_DAY : PARTLY_CLOUDY_NIGHT;
    }

    return (condition && CONDITIONS[condition]) ?? (daytime ? CLEAR_DAY : CLEAR_NIGHT);
  });

  $effect(() => {
    const element = canvas;
    if (!element) {
      return;
    }

    const skycons = new Skycons({ color });
    skycons.add(element, icon);
    skycons.play();

    return () => skycons.remove(element);
  });
</script>

<canvas class="weather-icon" bind:this={canvas} width={CANVAS_SIZE} height={CANVAS_SIZE}></canvas>

<style>
  .weather-icon {
    display: block;
    width: 1em;
    height: 1em;
  }
</style>
