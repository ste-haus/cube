# Visualizer pages

Each style of the announcement overlay is a directory here, holding its page and the code behind it. Vite serves and builds an HTML file at the path it has here, so where a page sits is the address the panel loads it from: `ridgeline/index.html` is `/visualizer/ridgeline/`, and the backend serves any style's page at `/visualizer/<style>/`.

Bars is the exception. It is vendored and served unchanged from `web/public/visualizer/bars/`, at `/visualizer/bars/`: its script is a classic one that Vite would not bundle, and it cannot become a module without editing the vendored code. See the README there.

`demo/` is not a page. It holds the front page's demo button, which the dashboard imports; the demo is turned on by `visualizer.demo` in the config.
