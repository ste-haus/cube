# Visualizer pages

Each style of the announcement overlay is a directory here, holding its page and the code behind it, and each page is entered the same way: `index.html` loads `main.ts`, which brings in the rest. Vite serves and builds an HTML file at the path it has here, so where a page sits is the address the panel loads it from, `/visualizer/<style>/`.

`shared/` is not a page either: it holds what the drawn styles have in common, how they hear the announcement, the Rubens-tube shaping, the glow, the noise, and the palette.

`demo/` is not a page. It holds the front page's demo button, which the dashboard imports; the demo is turned on by `visualizer.demo` in the config.
