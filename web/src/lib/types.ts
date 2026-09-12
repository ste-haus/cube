// Mirrors the dashboard models in src/cube/dashboard.py. The backend serves the whole
// definition from /api/config, so nothing installation-specific is hard-coded here.

export interface ThresholdBand {
  at: number;
  color: string;
}

export interface ThresholdScale {
  bands: ThresholdBand[];
  default_color: string;
}

export interface Reading {
  entity_id: string;
  attribute: string | null;
}

export interface Extreme extends Reading {
  turning_point_attribute: string | null;
}

/** The next or last point the temperature turns round, as the sensor's attribute carries it. */
export interface TurningPoint {
  temperature: number;
  hours: number;
  upcoming: boolean;
}

export interface Indicator extends Reading {
  icon: string;
  icon_attribute: string | null;
  suffix: string;
  precision: number | null;
  scale: ThresholdScale | null;
  bearing: Reading | null;
}

export interface StatusIndicator extends Reading {
  icon: string;
  nominal_state: string;
  state_colors: Record<string, string>;
  pulsing_states: string[];
}

export interface Notice {
  entity_id: string;
  pulsing: boolean;
  conditional: boolean;
  message_attribute: string;
  icon_attribute: string;
  icon: string;
  nominal_state: string | null;
  state_colors: Record<string, string>;
  pulsing_states: string[];
}

export type Side = "left" | "right" | "extra";

export interface Calendar {
  entity_id: string;
  name: string;
  color: string;
  side: Side;
  icon: string;
  blocklist: string | null;
}

export interface Agenda {
  calendars: Calendar[];
  side_labels: Partial<Record<Side, string>>;
  empty_text: string;
  days: number;
  scroll_threshold_items: number;
  scroll_seconds_per_item: number;
  scroll_percent_per_item: number;
  base_scroll_seconds: number;
}

export interface Clock {
  date_format: string;
  time_format: string;
  easter_egg_times: string[];
  easter_egg_text: string;
}

export interface TemperatureStop {
  at: number;
  color: string;
}

export interface Weather {
  entity_id: string;
  sun_entity_id: string | null;
  high: Extreme | null;
  low: Extreme | null;
  summary_entity_id: string | null;
  summary_max_length: number;
  summary_min_scale: number;
  summary_max_scale: number;
  zone_entity_id: string | null;
  forecast_days: number;
  forecast_hours: number;
  wind_gust_threshold: number;
  temperature_gradient: TemperatureStop[];
}

/** One hour of the forecast, from the hour under way on. */
export interface ForecastHour {
  time: string;
  condition: string | null;
  temperature: number | null;
  precipitation_probability: number | null;
}

/** One day of the forecast, already settled to the local date it is for. */
export interface ForecastDay {
  date: string;
  condition: string | null;
  high: number | null;
  low: number | null;
  precipitation_probability: number | null;
}

export interface Floorplan {
  image: string;
  groups: Record<string, string[]>;
}

export interface Gauge {
  entity_id: string;
  name: string | null;
}

export interface GaugeRow {
  gauges: Gauge[];
  scale: ThresholdScale | null;
  unit: string;
}

export type StreamType = "polling" | "go2rtc";

export interface Camera {
  entity_id: string;
  title: string | null;
  stream_type: StreamType;
  polling_interval: number;
  rtsp: string | null;
  stream: string | null;
}

export interface Go2rtc {
  url: string;
}

export interface Transcript {
  entity_id: string;
  syllables_per_second: number;
}

export interface Toggle {
  entity_id: string;
  label: string;
  icon: string;
  active_color: string;
  inactive_color: string;
  visible_when: string | null;
}

export interface Visualizer {
  content_marker: string;
}

/** A grid of cameras, one inner list per row, each row read left to right. */
export interface CameraGridOptions {
  rows: Camera[][];
}

/** One camera at size, with the rest stacked in a column beside it. */
export interface CameraHeroOptions {
  hero: Camera;
  side: Camera[];
}

/** Somebody else's page, drawn edge to edge. */
export interface Frame {
  url: string;
  title: string | null;
  interactive: boolean;
}

export type DistanceUnit = "mi" | "km";

/** Recent rain, looped over a dark map centred on the weather's zone. */
export interface Radar {
  zoom: number;
  rings: number[];
  ring_unit: DistanceUnit;
  frame_seconds: number;
  pause_seconds: number;
}

export interface RadarTile {
  radar: Radar;
}

export type WeatherTile = Camera | Frame | RadarTile;

/** Tiles laid out after the weather face's own cards, filling its grid left to right. */
export interface WeatherFaceOptions {
  tiles: WeatherTile[];
}

export interface Face {
  content: string;
  label: string;
  label_strip: boolean;
  page: string | null;
  options: Record<string, unknown>;
}

export interface Profile {
  key: string;
  name: string;
  floorplan: string | null;
  media_player: string | null;
  faces: Record<string, Face>;
}

export interface Labels {
  notices: string;
  agenda: string;
  sunrise: string;
  sunset: string;
  now: string;
}

export interface Theme {
  background: string;
  foreground: string;
  muted: string;
  dim: string;
  faint: string;
  spent: string;
  accent: string;
}

/** The installation's own colours; everything the config colours by name is already resolved. */
export interface Colors {
  primary: string;
  secondary: string;
  day: string;
  night: string;
  twilight: string;
  sun: string;
  sun_below: string;
}

export interface DashboardConfig {
  profile: Profile;
  theme: Theme;
  colors: Colors;
  labels: Labels;
  clock: Clock;
  indicators: Indicator[];
  status_indicators: StatusIndicator[];
  notices: Notice[];
  agenda: Agenda;
  toggles: Toggle[];
  floorplans: Record<string, Floorplan>;
  weather: Weather | null;
  camera: Camera | null;
  go2rtc: Go2rtc | null;
  fuel: GaugeRow;
  transcript: Transcript | null;
  visualizer: Visualizer | null;
  item_count_entities: string[];
}

export interface EntityState {
  state: string | null;
  attributes: Record<string, unknown>;
  last_changed: string | null;
  last_updated: string | null;
}

export interface AgendaEvent {
  summary: string;
  location: string | null;
  start: string | null;
  end: string | null;
  all_day: boolean;
  calendar: string;
  color: string;
}
