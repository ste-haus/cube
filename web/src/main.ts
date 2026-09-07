import { mount } from "svelte";

import App from "./App.svelte";
import "@mdi/font/css/materialdesignicons.css";
import "./styles/app.css";
import "./styles/rotation.css";

const target = document.getElementById("app");
if (!target) {
  throw new Error("Missing mount point");
}

export default mount(App, { target });
