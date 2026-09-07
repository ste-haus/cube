import type { AgendaEvent, DashboardConfig } from "./types";

const API_ROOT = "/api";
const PROFILE_PATH_PREFIX = "/p/";

const WS_SCHEME = "ws:";
const WSS_SCHEME = "wss:";
const HTTPS_PROTOCOL = "https:";

/** Reads the profile from the panel's own URL, so one bundle serves every panel. */
export function currentProfile(): string | null {
  const { pathname } = window.location;

  if (!pathname.startsWith(PROFILE_PATH_PREFIX)) {
    return null;
  }

  return pathname.slice(PROFILE_PATH_PREFIX.length).replace(/\/$/, "") || null;
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

export function floorplanUrl(name: string): string {
  return `${API_ROOT}/floorplan/${encodeURIComponent(name)}`;
}

export function floorplanStylesUrl(): string {
  return `${API_ROOT}/floorplan-styles.css`;
}

export function cameraSnapshotUrl(entityId: string, tick: number): string {
  return `${API_ROOT}/camera/${encodeURIComponent(entityId)}/snapshot?t=${tick}`;
}
