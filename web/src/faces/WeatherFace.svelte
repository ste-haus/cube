<script lang="ts">
  import Camera from "../cards/Camera.svelte";
  import Comfort from "../cards/Comfort.svelte";
  import Daylight from "../cards/Daylight.svelte";
  import Forecast from "../cards/Forecast.svelte";
  import Frame from "../cards/Frame.svelte";
  import Horizon from "../cards/Horizon.svelte";
  import Radar from "../cards/Radar.svelte";
  import TemperatureRange from "../cards/TemperatureRange.svelte";
  import Weather from "../cards/Weather.svelte";
  import Wind from "../cards/Wind.svelte";
  import { faceVisibility } from "../lib/cube.svelte";
  import { forecast } from "../lib/forecast.svelte";
  import type {
    Camera as CameraConfig,
    DashboardConfig,
    Frame as FrameConfig,
    RadarTile,
    Weather as WeatherConfig,
    WeatherFaceOptions,
    WeatherTile,
  } from "../lib/types";

  /*
   * The weather at length, in two columns each as wide as the dashboard's middle one, centred.
   *
   * The right column starts as far down as the dashboard's own, so the sky now sits at the same
   * height on either face, and spaces its rows wider: the wind, the sky now, and how it feels side by
   * side, today's range and the daylight bar one over the other, the sun's path, and the forecast in
   * what is left. The high and low the dashboard gives beside the sky are left to the range bar
   * here, and its forecast in words to the forecast itself.
   *
   * The left is the radar, with the cameras and any pages drawn in frames in a row beneath it, in
   * the order the config gives them. Where a tile goes follows from what it is, so the config lists
   * tiles and nothing more.
   */

  const FRAME_KEY = "url";
  const RADAR_KEY = "radar";

  let {
    config,
    weather,
    options,
  }: { config: DashboardConfig; weather: WeatherConfig; options: WeatherFaceOptions } = $props();

  function isFrame(tile: WeatherTile): tile is FrameConfig {
    return FRAME_KEY in tile;
  }

  function isRadar(tile: WeatherTile): tile is RadarTile {
    return RADAR_KEY in tile;
  }

  function isPicture(tile: WeatherTile): tile is CameraConfig | FrameConfig {
    return !isRadar(tile);
  }

  const tiles = $derived(options.tiles ?? []);
  const radars = $derived(tiles.filter(isRadar));
  const pictures = $derived(tiles.filter(isPicture));

  const visibility = faceVisibility();

  /* The forecast is fetched per panel, so only while this face is being looked at. */
  $effect(() => {
    if (!visibility.showing) {
      return;
    }

    forecast.start();

    return () => forecast.stop();
  });
</script>

<div class="weather-face">
  <div class="weather-face__column weather-face__main">
    {#each radars as tile, position (position)}
      <div class="weather-face__radar">
        <Radar radar={tile.radar} {weather} />
      </div>
    {/each}

    {#if pictures.length > 0}
      <div class="weather-face__pictures">
        {#each pictures as tile, position (position)}
          {#if isFrame(tile)}
            <div class="weather-face__frame">
              <!-- The frame draws nothing of its own, so its caption is the face's to give. -->
              {#if tile.title}<h2 class="panel-title panel-title--right">{tile.title}</h2>{/if}
              <div class="weather-face__page">
                <Frame frame={tile} />
              </div>
            </div>
          {:else}
            <Camera camera={tile} />
          {/if}
        {/each}
      </div>
    {/if}
  </div>

  <div class="weather-face__column weather-face__rail">
    <div class="weather-face__now">
      <Wind {weather} />
      <Weather {weather} />
      <Comfort {weather} />
    </div>

    <div class="weather-face__bars">
      <TemperatureRange {weather} days={forecast.days} />
      <Daylight {weather} clock={config.clock} />
    </div>

    <!-- The daylight bar above the path carries the sunrise and sunset times, so the path drops its
         own. -->
    <Horizon {weather} clock={config.clock} labels={config.labels} labelled={false} />

    <Forecast {weather} labels={config.labels} days={forecast.days} hours={forecast.hours} />
  </div>
</div>
