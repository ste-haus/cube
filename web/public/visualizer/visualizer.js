const CONFIG = {
  truthy: ['true', 't', '1'],
  lines: 100,
  colors: {
    165: [189, 0, 189], //magenta
    0: [44, 44, 44] // grey
  },
  spacing: 10,
  width: 1000,
  height: 255 * 2.5,
  barWidthOffset: 1, // 25
  magnitudeMultiplier: 1
};

function visualize(source, mute, magnitudeMultiplier, loop, debug) {
  const canvas = document.getElementById('canvas');
  const h3 = document.getElementById('name');
  const audio = document.getElementById('audio');

  console.log('SOURCE: ', source);
  audio.src = source;

  if (debug) {
    h3.innerText = `${source}`;
  }
  
  console.log('LOOP: ', loop);
  audio.loop = loop;

  console.log('MUTE: ', mute);
  console.log('MAGNITUDE MULTIPLIER: ', magnitudeMultiplier);

  // canvas init
  canvas.width = CONFIG.width;
  canvas.height = CONFIG.height;
  const ctx = canvas.getContext('2d');
  
  const context = new AudioContext(); // (Interface) Audio-processing graph
  let src = context.createMediaElementSource(audio); // Give the audio context an audio source
  const analyser = context.createAnalyser(); // Create an analyser for the audio context
  src.connect(analyser); // Connects the audio context source to the analyser

  // Sends sound to the speakers or headphones
  if (!mute) {
    analyser.connect(context.destination); // End destination of an audio graph in a given context
  }

  // (FFTSize) represents the window size in samples that is used when performing a FFT
  // Lower the size, the less bars (but wider in size)
  analyser.fftSize = 16384;

  const bufferLength = analyser.frequencyBinCount; // (read-only property)
  // Unsigned integer, half of fftSize (so in this case, bufferLength = 8192)
  // Equates to number of data values you have to play with for the visualization

  // The FFT size defines the number of bins used for dividing the window into equal strips, or bins.
  // Hence, a bin is a spectrum sample, and defines the frequency resolution of the window.

  // 8-bit unsigned integer array
  const dataArray = (new Uint8Array(bufferLength)).filter((_, i) => i % Math.round(bufferLength / CONFIG.lines) == 0);

  const WIDTH = canvas.width;
  const HEIGHT = canvas.height;
  console.log('WIDTH: ', WIDTH, 'HEIGHT: ', HEIGHT)

  const barWidth = (WIDTH / bufferLength) * CONFIG.barWidthOffset;
  console.log('BARWIDTH: ', barWidth);

   // (total space between bars) + (total width of all bars)
  console.log('TOTAL WIDTH: ', (CONFIG.lines * CONFIG.spacing) + ((CONFIG.lines + 1) * barWidth));

  CONFIG.colorBuckets = Object.keys(CONFIG.colors).sort().reverse();

  function renderFrame() {
    requestAnimationFrame(renderFrame); // Takes callback function to invoke before rendering

    analyser.getByteFrequencyData(dataArray); // Copies the frequency data into dataArray
    // Results in a normalized array of values between 0 and 255
    // Before this step, dataArray's values are all zeros (but with length of 8192)

    ctx.fillStyle = "rgba(17,17,17)"; // Clears canvas before rendering bars
    ctx.fillRect(0, 0, WIDTH, HEIGHT); // Fade effect, set opacity to 1 for sharper rendering of bars

    let r, g, b, barHeight;
    let x = 0;
    let bars = dataArray.length;

    for (let i = 0; i < bars; i++) {
      let j = (i <= bars / 2 ? i : bars - i); //mirror
      magnitude = (dataArray[j] * 2.5) * magnitudeMultiplier;
      barHeight = magnitude * Math.abs(Math.sin(j / 9 / Math.PI));
      //barHeight = (dataArray[j] * (bars / (Math.abs(i - bars/2 + 1) + 1) / (bars/2)) * 2.5);

      for (const bucket of CONFIG.colorBuckets) {
        if (magnitude >= bucket) {
          r = CONFIG.colors[bucket][0];
          g = CONFIG.colors[bucket][1];
          b = CONFIG.colors[bucket][2];
          break;
        }
      }

      // ctx.fillStyle = `rgb(${r},${g},${b})`;
      // ctx.fillRect(x, (HEIGHT - barHeight - (((255*2.5) - barHeight)/2)), barWidth, barHeight);

      ctx.strokeStyle = `rgb(${r},${g},${b})`;
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.beginPath();
      ctx.roundRect(x, (HEIGHT - barHeight - (((255*2.5) - barHeight) / 2)), barWidth, barHeight, 2);
      ctx.stroke();

      x += barWidth + CONFIG.spacing;
    }
  }

  audio.play();
  renderFrame();
};

window.onload = function() {
  const urlParams = new URLSearchParams(window.location.search);
  const src = urlParams.get('src');
  const mute = (CONFIG.truthy.includes(urlParams.get('mute')));
  const magnitudeMultiplier = (urlParams.get('magnitude') == null ? CONFIG.magnitudeMultiplier : parseFloat(urlParams.get('magnitude')));
  const loop = (CONFIG.truthy.includes(urlParams.get('loop')));
  const debug = (CONFIG.truthy.includes(urlParams.get('debug')));

  if (src != null) {
    visualize(src, mute, magnitudeMultiplier, loop, debug);
  }
};
