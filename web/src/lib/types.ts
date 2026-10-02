// Mirrors the dashboard models in src/cube/dashboard.py. The backend serves the whole
// definition from /api/config, so nothing installation-specific is hard-coded here.

import type { FaceName } from "./cube.svelte";

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
  /** What the brightness bar in a held light's colour window is filled with. */
  fill: SliderFill;
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
  content_marker: string | null;
}

export interface Toggle {
  entity_id: string;
  label: string;
  icon: string;
  /** Unset, the primary colour. */
  active_color: string | null;
  inactive_color: string;
  visible_when: string | null;
  hold_seconds: number | null;
}

export type VisualizerStyle = "bars" | "ridgeline" | "corona" | "halo";

export interface Visualizer {
  content_marker: string;
  style: VisualizerStyle;
  demo: boolean;
  demo_clip: string | null;
  reference_color: string | null;
  rotate: boolean;
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

export type WifiSecurity = "WPA" | "WEP" | "nopass";

/** A network a guest can join, read from the entities holding its name and password. */
export interface Wifi {
  ssid_entity_id: string;
  password_entity_id: string;
  security: WifiSecurity;
  hidden: boolean;
  /** A page drawing the code, with `{data}` and `{size}` where the network and its size go. */
  qr_url: string | null;
}

/** The room's light, drawn large: a bulb that switches it inside an arc that dims it. */
export interface Light {
  entity_id: string;
  icon: string;
  off_icon: string;
  /** What the brightness bar in its colour window is filled with. */
  fill: SliderFill;
}

/** What every light the panel can colour shares. */
export interface LightDefaults {
  /** What the middle of a light's colour wheel sets it to, as a CIE xy point. */
  default_xy: [number, number];
}

/** What a bar's fill is drawn in: grey, or the light's own colour, as strong as it is bright. */
export type SliderFill = "neutral" | "light";

/** A light or a cover, dragged along to set it and tapped to switch it. */
export interface Slider {
  entity_id: string;
  label: string;
  icon: string;
  /** Where a tap opens it to, and shuts it from; null, a tap toggles it. */
  toggle_position: number | null;
  fill: SliderFill;
}

/** A switch that arms the alarm, and the `input_datetime` holding when it goes off. */
export interface Alarm {
  enabled_entity_id: string;
  time_entity_id: string;
  minute_step: number;
}

/** A guest room's face: the network, the room's controls, and the alarm, each optional. */
export interface GuestFaceOptions {
  wifi: Wifi | null;
  light: Light | null;
  sliders: Slider[];
  toggles: Toggle[];
  alarm: Alarm | null;
}

/** A route's minutes, read below nought while nobody is keeping the route up to date. */
export interface TravelTime {
  entity_id: string;
  name: string;
  /** A sensor holding when to leave, as a Unix timestamp, for a route tied to a particular trip. */
  departure_entity_id: string | null;
  /** Who takes the trip; while they are not home, it is not drawn as due. */
  person_entity_id: string | null;
  /** The rest are details of the route, each left unshown when unset. */
  free_flow_entity_id: string | null;
  distance_entity_id: string | null;
  destination_entity_id: string | null;
  destination_attribute: string | null;
  calendar_entity_id: string | null;
  checked_entity_id: string | null;
}

export type MapsLink = "apple" | "google";

export interface DepartureFaceOptions {
  map: Camera;
  travel_times: TravelTime[];
  /** Minutes before a trip's time to leave that it is imminent, and that it is soon. */
  imminent_minutes: number;
  soon_minutes: number;
  /** What a trip shows in place of its countdown once its time to leave has come. */
  leave_now_icon: string;
  /** What a trip shows instead, in grey, once its time has come and its person has gone. */
  departed_icon: string;
  /** An event a route's window fires to send the route to its person's phone; null, no button. */
  send_event: string | null;
  /** Which maps a route sent to a phone opens in, carried with the event. */
  maps: MapsLink;
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
  default_face: FaceName;
  face_entity: string | null;
  media_player: string | null;
  faces: Record<string, Face>;
}

export interface Labels {
  notices: string;
  agenda: string;
  sunrise: string;
  sunset: string;
  now: string;
  wifi: string;
  wifi_network: string;
  wifi_password: string;
  alarm: string;
  light_colour: string;
  light_brightness: string;
  master_warning: string;
  master_caution: string;
  alert_cleared: string;
  travel: string;
  forecast: string;
  travel_idle: string;
  travel_more: string;
  travel_drive: string;
  travel_in_traffic: string;
  travel_distance: string;
  travel_destination: string;
  travel_checked: string;
  travel_checked_note: string;
  travel_all_day: string;
  travel_countdown: string;
  travel_away: string;
  travel_send: string;
  travel_sent: string;
  travel_send_failed: string;
  leave_by: string;
  minutes: string;
  leave_now: string;
  departed: string;
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
  light: LightDefaults;
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
  mcw: Mcw | null;
  events: string[];
  item_count_entities: string[];
}

/** The two alert levels with a master light of their own, most urgent first. */
export type AlertTier = "warning" | "caution";

export interface Mcw {
  warning_entity_id: string;
  caution_entity_id: string;
  clear_event: string;
  hold_seconds: number;
  warning_color: string;
  caution_color: string;
}

export interface EntityState {
  state: string | null;
  attributes: Record<string, unknown>;
  last_changed: string | null;
  last_updated: string | null;
}

/** One recorded state of an entity, and when it began. */
export interface HistoryState {
  state: string | null;
  last_changed: string | null;
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
