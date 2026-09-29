import type { WifiSecurity } from "./types";

/*
 * What a phone's camera reads to join a network: the `WIFI:` scheme ZXing defined and every
 * camera app since has followed. The name and the password are escaped, because a password with a
 * semicolon in it would otherwise end its own field.
 */

const SCHEME = "WIFI:";
const FIELD_END = ";";
const PAYLOAD_END = ";";
const SPECIAL = /[\\;,":]/g;
const ESCAPE = "\\";
const HIDDEN = "true";

/** The security an open network names, which has no password to give. */
export const OPEN_NETWORK: WifiSecurity = "nopass";

export interface Network {
  ssid: string;
  password: string;
  security: WifiSecurity;
  hidden: boolean;
}

function escaped(value: string): string {
  return value.replace(SPECIAL, (character) => `${ESCAPE}${character}`);
}

export function wifiPayload(network: Network): string {
  const fields = [`T:${network.security}`, `S:${escaped(network.ssid)}`];

  if (network.security !== OPEN_NETWORK) {
    fields.push(`P:${escaped(network.password)}`);
  }

  if (network.hidden) {
    fields.push(`H:${HIDDEN}`);
  }

  return `${SCHEME}${fields.map((field) => `${field}${FIELD_END}`).join("")}${PAYLOAD_END}`;
}

const DATA_PLACEHOLDER = "{data}";
const SIZE_PLACEHOLDER = "{size}";

/** The page drawing the code, told what to draw and how large, each escaped for a URL. */
export function codeUrl(template: string, payload: string, size: number): string {
  return template
    .replaceAll(DATA_PLACEHOLDER, encodeURIComponent(payload))
    .replaceAll(SIZE_PLACEHOLDER, String(Math.round(size)));
}
