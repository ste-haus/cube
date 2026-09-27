/**
 * The speech clip both visualizer demos play, so the two are always compared on the same sound.
 * It is made locally rather than kept in the repository:
 *
 *   say -o voice.aiff "…" && afconvert -f WAVE -d LEI16@48000 voice.aiff web/visualizer/demo/voice.wav
 */
export const DEMO_CLIP = "/visualizer/demo/voice.wav";
