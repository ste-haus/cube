import type { AgendaEvent, DashboardConfig, ForecastDay, ForecastHour } from "./types";

const API_ROOT = "/api";
const FACE_ROOT = "/faces";
const PROFILE_PARAMETER = "profile";

const WS_SCHEME = "ws:";
const WSS_SCHEME = "wss:";
const HTTPS_PROTOCOL = "https:";

/** Reads the profile from the panel's own URL, so one bundle serves every panel. */
export function currentProfile(): string | null {
  return new URLSearchParams(window.location.search).get(PROFILE_PARAMETER) || null;
}

export async function fetchConfig(): Promise<DashboardConfig> {
  const profile = currentProfile();
  const query = profile ? `?profile=${encodeURIComponent(profile)}` : "";

  const response = await fetch(`${API_ROOT}/config${query}`);
  if (!response.ok) {
    throw new Error(`Could not load dashboard config: ${response.status}`);
  }

  return response.json();
}

export async function fetchAgenda(): Promise<AgendaEvent[]> {
  const response = await fetch(`${API_ROOT}/agenda`);
  if (!response.ok) {
    throw new Error(`Could not load agenda: ${response.status}`);
  }

  const body = await response.json();

  return body.events;
}

export async function fetchForecast(): Promise<{ days: ForecastDay[]; hours: ForecastHour[] }> {
  const response = await fetch(`${API_ROOT}/forecast`);
  if (!response.ok) {
    throw new Error(`Could not load forecast: ${response.status}`);
  }

  const body = await response.json();

  return { days: body.days ?? [], hours: body.hours ?? [] };
}

export async function toggle(entityId: string): Promise<void> {
  await fetch(`${API_ROOT}/toggle`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ entity_id: entityId }),
  });
}

export function streamUrl(): string {
  const scheme = window.location.protocol === HTTPS_PROTOCOL ? WSS_SCHEME : WS_SCHEME;

  return `${scheme}//${window.location.host}${API_ROOT}/stream`;
}

/** A face an installation supplied itself, served out of the mounted resources directory. */
export function faceUrl(page: string): string {
  return `${FACE_ROOT}/${encodeURIComponent(page)}/`;
}

export function floorplanUrl(name: string): string {
  return `${API_ROOT}/floorplan/${encodeURIComponent(name)}`;
}

/** An installation's own icon set: name to SVG path, empty when it has none. */
export async function fetchIcons(): Promise<Record<string, string>> {
  const response = await fetch(`${API_ROOT}/icons`);
  if (!response.ok) {
    return {};
  }

  return response.json();
}

export function floorplanStylesUrl(): string {
  return `${API_ROOT}/floorplan-styles.css`;
}

export function cameraSnapshotUrl(entityId: string, tick: number): string {
  return `${API_ROOT}/camera/${encodeURIComponent(entityId)}/snapshot?t=${tick}`;
}
