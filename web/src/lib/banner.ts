/*
 * A band of information over the departure face's map, raised by a sensor while it is on: what it
 * says, an icon, and the colour of its outline, its icon and its message. Home Assistant writes the
 * words, so the band knows nothing about what it is reporting.
 */

export const MESSAGE_ATTRIBUTE = "message";
export const DETAIL_ATTRIBUTE = "detail";
export const ICON_ATTRIBUTE = "icon";
export const COLOUR_ATTRIBUTE = "color";

// The two parts are read as one line, a middle dot between them, as the panel separates details elsewhere.
export const PART_SEPARATOR = " · ";
export const DEFAULT_BANNER_ICON = "mdi:information-outline";

// The panel's colours by name; anything else is taken as a CSS colour as it stands.
const NAMED_COLOURS: Record<string, string> = {
  primary: "var(--color-primary)",
  secondary: "var(--color-secondary)",
  muted: "var(--color-muted)",
};
const CRITICAL = "critical";
export const DEFAULT_BANNER_COLOUR = "var(--color-muted)";

export interface Banner {
  message: string;
  detail: string;
  icon: string;
  colour: string;
}

/** A part of the line as it is read, or empty when the sensor gives none. */
export function bannerPart(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** `primary`, `secondary`, `muted`, `critical` (the master warning's red), or a CSS colour. */
export function bannerColour(value: unknown, critical: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    return DEFAULT_BANNER_COLOUR;
  }

  const name = value.trim();
  if (name === CRITICAL) {
    return critical;
  }

  return NAMED_COLOURS[name] ?? name;
}

/** The band a sensor raises, or null while it is off or has nothing to say. */
export function bannerOf(
  on: boolean,
  attribute: (name: string) => unknown,
  critical: string,
): Banner | null {
  if (!on) {
    return null;
  }

  const message = bannerPart(attribute(MESSAGE_ATTRIBUTE));
  const detail = bannerPart(attribute(DETAIL_ATTRIBUTE));
  if (message === "" && detail === "") {
    return null;
  }

  const icon = attribute(ICON_ATTRIBUTE);

  return {
    message,
    detail,
    icon: typeof icon === "string" && icon !== "" ? icon : DEFAULT_BANNER_ICON,
    colour: bannerColour(attribute(COLOUR_ATTRIBUTE), critical),
  };
}
