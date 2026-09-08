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
  hours_attribute: string | null;
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

export interface Weather {
  entity_id: string;
  sun_entity_id: string | null;
  high: Extreme | null;
  low: Extreme | null;
  summary_entity_id: string | null;
  summary_max_length: number;
  summary_min_scale: number;
  summary_max_scale: number;
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

export interface Camera {
  entity_id: string;
  title: string | null;
  refresh_seconds: number;
}

export interface Transcript {
  entity_id: string;
  characters: number;
  seconds: number;
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
  url: string;
  content_marker: string;
}

export interface Face {
  content: string;
  label: string;
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

export interface DashboardConfig {
  profile: Profile;
  theme: Theme;
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
