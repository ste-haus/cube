/**
 * The bars announcement overlay, entered the way every style is: its stylesheet and its script
 * come in through here, and Vite builds the page like the rest.
 *
 * The drawing itself is vendored and kept as it arrived. It is a classic script, one that assigns
 * a variable it never declares, so it cannot run as a module; it is brought in as text instead and
 * run as a classic script, unchanged. It sets up on the page's load, which this runs ahead of.
 */

import vendored from "./visualizer.js?raw";
import "./style.css";

const script = document.createElement("script");
script.textContent = vendored;
document.body.appendChild(script);
