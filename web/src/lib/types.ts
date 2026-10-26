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
  /** What a tap on the notice opens, if anything. */
  window: NoticeWindow | null;
}

/** A notice's window listing traffic incidents. */
export interface IncidentsNoticeWindow {
  type: "incidents";
  entity_id: string;
}

/** What a tapped notice may open, told apart by `type`. */
export type NoticeWindow = IncidentsNoticeWindow;

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

/** Room kept clear above and below a floorplan level, in percent of the screen's height. */
export interface FloorplanPadding {
  top: number;
  bottom: number;
}

export interface Floorplan {
  image: string;
  groups: Record<string, string[]>;
  /** What the brightness bar in a held light's colour window is filled with. */
  fill: SliderFill;
  padding: FloorplanPadding;
  /** What this level's bin sensors call each state the bundled stylesheet draws, where it differs. */
  bin_states: BinStates;
}

export type BinStates = Record<"home" | "away" | "take_out" | "picked_up", string | null>;

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
  stream: string | null;
}

/** One of a list of maps, the dashboard's or a departure face's: shown while `visible_when` is on; the last, with none, otherwise. */
export interface MapCamera extends Camera {
  visible_when: string | null;
}

/** A camera that comes up over whatever face is showing, while its sensor is on. */
export interface Popup {
  entity_id: string;
  camera: Camera;
  ratio: number;
}

export interface Go2rtc {
  url: string;
}

export interface Transcript {
  entity_id: string;
  syllables_per_second: number;
  content_marker: string | null;
}

export type ThermostatSide = "left" | "right" | "bottom";

export interface Thermostat {
  entity_id: string;
  side: ThermostatSide;
  /**
   * Below the top of the screen's lower third, in percent of its height, negative above; on the
   * bottom, right of the middle, in percent of its width, negative left.
   */
  offset: number;
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
  /** What the card calls the route, where `name` is too long for it; its window still says `name`. */
  short_name: string | null;
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
  /** What a route with no departure sensor usually takes around now, to say when it is slower. */
  usual_entity_id: string | null;
}

export type MapsLink = "apple" | "google";

export interface DepartureFaceOptions {
  map: MapCamera[];
  travel_times: TravelTime[];
  /** Minutes before a trip's time to leave that it is imminent, and that it is soon. */
  imminent_minutes: number;
  soon_minutes: number;
  /** How far over its usual time, in percent, a route that is always there is slower, and much slower. */
  slower_percent: number;
  much_slower_percent: number;
  /** With no usual time, what traffic has to add over free flow, in both minutes and percent. */
  traffic_slower_minutes: number;
  traffic_slower_percent: number;
  traffic_much_slower_minutes: number;
  traffic_much_slower_percent: number;
  /** What a trip shows in place of its countdown once its time to leave has come. */
  leave_now_icon: string;
  /** What a trip shows instead, in grey, once its time has come and its person has gone. */
  departed_icon: string;
  /** An event a route's window fires to send the route to its person's phone; null, no button. */
  send_event: string | null;
  /** Which maps a route sent to a phone opens in, carried with the event. */
  maps: MapsLink;
  /** A sensor whose `incidents` attribute lists the traffic incidents to raise a banner for. */
  incidents_entity_id: string | null;
}

/** A stop on the network map; one with branches is an interchange, and an inline stop is drawn across the line. */
export interface NetworkStop {
  name: string;
  /** Named by this entity's state, `name` until it has one. */
  name_entity_id: string | null;
  entity_id: string | null;
  up_states: string[];
  latency_entity_id: string | null;
  inline: boolean;
  branches: NetworkStop[];
}

export interface NetworkMap {
  /** Places outside the house, each rising off the head of the line on a rail of its own. */
  upstream: NetworkStop[];
  /** Down from the head, the first stop being where the house meets the internet. */
  line: NetworkStop[];
}

export interface NetworkWan {
  entity_id: string;
  up_states: string[];
  address_entity_id: string | null;
  download_entity_id: string | null;
  upload_entity_id: string | null;
  /** Milliseconds to the internet. */
  latency_entity_id: string | null;
  /** How far back each reading's chart runs. */
  history_minutes: number;
  /** Latencies from which the internet is drawn primary, and secondary. */
  latency_busy_ms: number;
  latency_full_ms: number;
  /** What the plan carries each way, in the rates' own unit. */
  download_capacity: number | null;
  upload_capacity: number | null;
}

/** One container, as a containers sensor's `containers` attribute lists it. */
export interface Container {
  name: string;
  /** `ok`, `busy`, `completed`, `stopped`, `warning` or `error`. */
  state: string;
  status: string;
  uptime: string;
  /** Shown in place of the uptime when it is set. */
  detail?: string | null;
}

export interface NetworkVip {
  name: string;
  entity_id: string;
  attribute: string | null;
}

/** One reading on a card of them, from a state or an attribute. */
export interface NetworkStat {
  label: string;
  icon: string | null;
  entity_id: string;
  attribute: string | null;
  decimals: number;
  unit: string | null;
}

/** A switch held behind a card: turning it on goes straight through, turning it off asks first. */
export interface CriticalSwitch {
  entity_id: string;
  /** What it is called, across its window's band. */
  label: string;
  /** What turning it off asks, or null for `labels.critical_switch_confirm`. */
  confirm: string | null;
  /** Whether the card breathes in the secondary colour while it is off. */
  advise_when_off: boolean;
  /** How long the answer that turns it off is held down. */
  hold_seconds: number;
}

export interface NetworkStats {
  title: string;
  rows: NetworkStat[];
  switch: CriticalSwitch | null;
}

export interface NetworkRack {
  title: string;
  /** The temperature inside, which the card leads with and draws a day of. */
  entity_id: string;
  unit: string | null;
  upper_entity_id: string | null;
  lower_entity_id: string | null;
  /** The fan's speed, drawn on its own scale from nought to `fan_max`. */
  fan_entity_id: string | null;
  fan_max: number;
  caution_above: number | null;
  warning_above: number | null;
  switch: CriticalSwitch | null;
}

export interface NetworkContainersSummary {
  label: string;
  icon: string | null;
  entity_id: string;
  attribute: string | null;
}

export interface NetworkContainers {
  name: string;
  entity_id: string;
  /** The hosts' columns the card spans, and the columns its list runs down. */
  columns: number;
  /** `small` to fit a long list, or `regular` to match a card of readings' rows. */
  size: "small" | "regular";
  summary: NetworkContainersSummary | null;
  switch: CriticalSwitch | null;
}

export interface NetworkHost {
  /** Its name, or the state of `name_entity_id` for a host known by its role; at least one is set. */
  name: string | null;
  name_entity_id: string | null;
  /** None for the host doing the pinging, whose strip comes from the gaps in its heartbeat instead. */
  connection_entity_id: string | null;
  /** A sensor that changes every `heartbeat_seconds` while the host is up. */
  heartbeat_entity_id: string | null;
  heartbeat_seconds: number;
  /** When the host last booted, from the state or `booted_attribute`. */
  booted_entity_id: string | null;
  booted_attribute: string | null;
  address_entity_id: string | null;
  latency_entity_id: string | null;
  /** Its `cpu_utilization`, `memory_utilization` and `disk_utilization` attributes are fractions. */
  metrics_entity_id: string | null;
  /** Or a sensor apiece, each in percent. */
  cpu_entity_id: string | null;
  memory_entity_id: string | null;
  disk_entity_id: string | null;
  /** `normal` while on mains, with `capacity` and `runtime_remaining` attributes. */
  ups_entity_id: string | null;
  switch: CriticalSwitch | null;
}

/** One stream from the media server, as the media sensor's `sessions` attribute lists it. */
export interface MediaSession {
  device: string;
  user: string | null;
  title: string | null;
  series: string | null;
  state: string;
  /** Seconds in, and seconds long. */
  position: number | null;
  duration: number | null;
  /** How it reaches the client: `DirectPlay`, `DirectStream` or `Transcode`, as Jellyfin says. */
  play_method: string | null;
  /** What the client is shown, such as `1080p`, and at what rate, in bits a second. */
  resolution: string | null;
  bitrate: number | null;
}

export interface NetworkMedia {
  entity_id: string;
  title: string;
  /** The hosts' columns the card spans. */
  columns: number;
  /** Leave the card out while nothing is playing. */
  hide_idle: boolean;
  switch: CriticalSwitch | null;
}

export interface NetworkClock {
  /** How far a host's clock is off its time source, signed, in its own unit. */
  ntp_entity_id: string | null;
}

export interface NetworkFaceOptions {
  clock: NetworkClock;
  map: NetworkMap | null;
  wan: NetworkWan | null;
  hosts: NetworkHost[];
  containers: NetworkContainers[];
  vips: NetworkVip[];
  stats: NetworkStats | null;
  /** How hard the automations are working: a card of readings like `stats`. */
  bus: NetworkStats | null;
  rack: NetworkRack | null;
  media: NetworkMedia | null;
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
  popups: boolean;
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
  incidents: string;
  /** The banner's tail for roads it has no room to name, with `{count}` in it. */
  incidents_other: string;
  incidents_others: string;
  incidents_unnamed: string;
  /** The road an incident is at, with `{road}` in it: "near I-5". */
  incidents_near: string;
  /** A lone incident's title when HERE gives it no type. */
  incidents_type_unknown: string;
  incidents_closed: string;
  /** Words before a time: "Since 11:27", "until 11:47". */
  incidents_since: string;
  incidents_until: string;
  /** When an incident clears, with `{start}`, `{end}`, `{duration}`, `{day}` or `{time}` in them. */
  incidents_range: string;
  incidents_clears_in: string;
  incidents_clears_on: string;
  incidents_cleared_at: string;
  incidents_cleared_on: string;
  incidents_starts_in: string;
  incidents_starts_on: string;
  incidents_ongoing: string;
  incidents_hours: string;
  incidents_today: string;
  clock_utc: string;
  clock_ntp: string;
  critical_switch_confirm: string;
  critical_switch_on: string;
  critical_switch_off: string;
  critical_switch_turn_off: string;
  critical_switch_cancel: string;
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
  camera: MapCamera[] | null;
  go2rtc: Go2rtc | null;
  fuel: GaugeRow;
  transcript: Transcript | null;
  thermostat: Thermostat | null;
  visualizer: Visualizer | null;
  mcw: Mcw | null;
  popups: Popup[];
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
  /** Seconds since the epoch, as Home Assistant's state stream gives them. */
  last_changed: number | null;
  last_updated: number | null;
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
