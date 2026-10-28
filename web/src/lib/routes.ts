import { strftime } from "./format";

export interface BaseRouteDetails {
  trip: string;
  name: string;
  color: string;
  destination_address: string | null;
  kind: string;
  source: string | null;
  length_m: number | null;
  cached_at: string | null;
  via_count: number;
  suggested: boolean;
  congestion_available: boolean;
}

const METRES_PER_KILOMETRE = 1000;
const DISTANCE_DECIMALS = 1;
const UNKNOWN = "Unknown";
const CACHED_AT_FORMAT = "%Y-%m-%d %H:%M:%S";
const UNKNOWN_DESTINATION = "Unknown destination";
const ADDRESS_SEPARATOR = /[\r\n,]/;
const FIRST_LINE = 0;

export function firstAddressLine(address: string | null): string {
  return address?.trim().split(ADDRESS_SEPARATOR)[FIRST_LINE].trim() || UNKNOWN_DESTINATION;
}

export function routeSummary(route: Pick<BaseRouteDetails, "destination_address" | "length_m" | "via_count">): string {
  return `${firstAddressLine(route.destination_address)} · ${routeDistance(route.length_m)} · via ${route.via_count} points`;
}

export function routeDistance(metres: number | null): string {
  return metres === null || !Number.isFinite(metres)
    ? UNKNOWN
    : `${(metres / METRES_PER_KILOMETRE).toFixed(DISTANCE_DECIMALS)} km`;
}

export function routeCachedAt(value: string | null): string {
  if (!value) return UNKNOWN;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? UNKNOWN : strftime(date, CACHED_AT_FORMAT);
}
