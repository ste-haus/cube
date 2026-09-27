# Bars

The bars style of the announcement overlay. It reads the audio through the Web Audio API and draws the spectrum onto a canvas.

Third-party code, vendored rather than rewritten, so `visualizer.js` is kept as it arrived and is not held to this repository's conventions. Only the stylesheet and the page are adapted: the stylesheet because the page is sized by a full-screen overlay rather than by a dashboard card, and the page so it is entered through `main.ts` like every other style. `main.ts` runs the vendored script unchanged, as the classic script it is, and lays a faint noise floor under the analyser's readings so the bars idle rather than vanish when the sound stops. It also repaints the script's magenta and grey, from a second classic script run straight after it, in the palette the other styles share (see `../shared/tint.ts`), so bars follow `visualizer.reference_color` like the rest.

It is served from this application on purpose. The analysis is a cross-origin read, so hosting the page elsewhere means the audio needs `Access-Control-Allow-Origin` from whatever serves it — which Home Assistant does not send. Serving the page and relaying the audio from the same origin removes the question instead of answering it.

Source: https://github.com/gg-1414/music-visualizer
Write-up: https://medium.com/@gg_gina/how-to-music-visualizer-web-audio-api-aa007f4ea525
