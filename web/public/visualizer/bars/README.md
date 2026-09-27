# Audio visualizer

The overlay drawn while a speaker is playing an announcement. It reads the audio through the Web Audio API and draws the spectrum onto a canvas.

Third-party code, vendored rather than rewritten, so `visualizer.js` is kept as it arrived and is not held to this repository's conventions. Only the stylesheet is adapted, because the page is now sized by a full-screen overlay rather than by a dashboard card.

It is served from this application on purpose. The analysis is a cross-origin read, so hosting the page elsewhere means the audio needs `Access-Control-Allow-Origin` from whatever serves it — which Home Assistant does not send. Serving the page and relaying the audio from the same origin removes the question instead of answering it.

Source: https://github.com/gg-1414/music-visualizer
Write-up: https://medium.com/@gg_gina/how-to-music-visualizer-web-audio-api-aa007f4ea525
