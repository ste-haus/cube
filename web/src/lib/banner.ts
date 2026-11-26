/*
 * A band of information over the departure face's map, raised by a sensor while it is on: what it
 * says, an icon, and the colour of its outline. Home Assistant writes the words, so the band knows
 * nothing about what it is reporting.
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
  text: string;
  icon: string;
  colour: string;
}

/** The line a band reads: its message and its detail, either alone when the other is empty. */
export function bannerLine(message: unknown, detail: unknown): string {
  return [message, detail]
    .filter((part): part is string => typeof part === "string" && part.trim() !== "")
    .map((part) => part.trim())
    .join(PART_SEPARATOR);
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

  const text = bannerLine(attribute(MESSAGE_ATTRIBUTE), attribute(DETAIL_ATTRIBUTE));
  if (text === "") {
    return null;
  }

  const icon = attribute(ICON_ATTRIBUTE);

  return {
    text,
    icon: typeof icon === "string" && icon !== "" ? icon : DEFAULT_BANNER_ICON,
    colour: bannerColour(attribute(COLOUR_ATTRIBUTE), critical),
  };
}
