/**
 * Gradium TTS over WebSocket (wss://api.gradium.ai/api/speech/tts).
 * Protocol: setup -> ready -> text* -> end_of_stream -> audio* -> end_of_stream.
 * Audio: base64 PCM, 48kHz 16-bit signed mono, 3840 samples (80ms) per chunk.
 */

import type { TTSPlayer } from "./index";
import { base64ToInt16 } from "./base64";
import {
  fetchVoiceToken,
  gradiumWsUrl,
  openVoiceSocket,
  type VoiceSocket,
  type VoiceSocketFactory,
  type VoiceTransport,
} from "./token";

const VOICE_ID = "YTpq7expH9539ERJ";
const SAMPLE_RATE = 48_000;
/** Small lead before the first chunk so scheduling never lands in the past. */
const SCHEDULE_LEAD_S = 0.05;

type TTSServerMessage =
  | { type: "ready" }
  | { type: "audio"; audio: string }
  | { type: "end_of_stream" }
  | { type: "error"; message?: string };

interface Utterance {
  ws: VoiceSocket | null;
  sources: Set<AudioBufferSourceNode>;
  /** Running playback cursor (AudioContext time) for gapless scheduling. */
  cursor: number;
  /** Server finished sending audio (or the stream died). */
  streamEnded: boolean;
  settled: boolean;
  resolve: () => void;
}

export function createTTS(
  endpoint: string,
  transport?: VoiceTransport,
  socketFactory?: VoiceSocketFactory,
): TTSPlayer {
  // Preferably created by unlock() on a user gesture; lazily on first speak()
  // otherwise (which Chrome's autoplay policy leaves suspended off-gesture).
  let ctx: AudioContext | null = null;
  let active: Utterance | null = null;

  function ensureContext(): AudioContext {
    if (!ctx) {
      ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    }
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
    return ctx;
  }

  /** Tear down an utterance: cancel scheduled audio, close WS, resolve speak(). */
  function settle(utt: Utterance): void {
    if (utt.settled) return;
    utt.settled = true;
    for (const src of utt.sources) {
      src.onended = null;
      try {
        src.stop();
      } catch {
        // never started or already stopped
      }
    }
    utt.sources.clear();
    utt.ws?.close();
    if (active === utt) active = null;
    utt.resolve();
  }

  /** Resolve once the server stream ended AND all scheduled audio drained. */
  function maybeFinish(utt: Utterance): void {
    if (utt.streamEnded && utt.sources.size === 0) {
      settle(utt);
    }
  }

  function schedule(utt: Utterance, audioCtx: AudioContext, b64: string): void {
    const pcm = base64ToInt16(b64);
    if (pcm.length === 0) return;
    const floats = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) {
      floats[i] = (pcm[i] ?? 0) / 32768;
    }
    // Buffer carries its own 48kHz rate; Web Audio resamples if ctx differs.
    const buffer = audioCtx.createBuffer(1, floats.length, SAMPLE_RATE);
    buffer.copyToChannel(floats, 0);
    const src = audioCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(audioCtx.destination);
    const startAt = Math.max(utt.cursor, audioCtx.currentTime + SCHEDULE_LEAD_S);
    src.start(startAt);
    utt.cursor = startAt + buffer.duration;
    utt.sources.add(src);
    src.onended = () => {
      utt.sources.delete(src);
      maybeFinish(utt);
    };
  }

  return {
    unlock(): void {
      // Runs inside a user-gesture handler: create + resume synchronously so
      // the AudioContext is "running" before any off-gesture speak(). No-op if
      // already running.
      ensureContext();
    },

    speak(text: string): Promise<void> {
      if (active) settle(active); // new speak() interrupts the current one
      const audioCtx = ensureContext();

      return new Promise<void>((resolve) => {
        const utt: Utterance = {
          ws: null,
          sources: new Set(),
          cursor: 0,
          streamEnded: false,
          settled: false,
          resolve,
        };
        active = utt;

        void (async () => {
          // The server frame handlers close over `ws`, which only exists after
          // the await below; `utt.ws` is the stable reference they use instead.
          const onServerMessage = (data: string): void => {
            if (utt.settled) return;
            let msg: TTSServerMessage;
            try {
              msg = JSON.parse(data) as TTSServerMessage;
            } catch {
              return;
            }
            switch (msg.type) {
              case "ready":
                utt.ws?.send(JSON.stringify({ type: "text", text }));
                utt.ws?.send(JSON.stringify({ type: "end_of_stream" }));
                break;
              case "audio":
                schedule(utt, audioCtx, msg.audio);
                break;
              case "end_of_stream":
                utt.streamEnded = true;
                utt.ws?.close();
                maybeFinish(utt);
                break;
              case "error":
                console.error("[voice/tts] server error frame:", msg.message ?? msg);
                utt.streamEnded = true;
                utt.ws?.close();
                maybeFinish(utt);
                break;
            }
          };

          let ws: VoiceSocket;
          try {
            // Tokens are single-use: fetch a fresh one per connect. Both the
            // token request (`transport`) and the socket (`socketFactory`) route
            // through the extension bridge when present, so neither is subject to
            // the host page's CSP `connect-src`.
            const token = await fetchVoiceToken(endpoint, transport);
            if (utt.settled) return;
            ws = await openVoiceSocket(
              gradiumWsUrl("tts", token),
              {
                onMessage: onServerMessage,
                onError: () => {
                  console.warn("[voice/tts] websocket error");
                },
                onClose: () => {
                  if (utt.settled) return;
                  if (!utt.streamEnded) {
                    console.warn("[voice/tts] websocket closed mid-stream; playing what arrived");
                  }
                  // Let already-scheduled audio drain, then resolve.
                  utt.streamEnded = true;
                  maybeFinish(utt);
                },
              },
              socketFactory,
            );
          } catch (err) {
            // Narration must never break the tour: log loudly, resolve quietly.
            console.error("[voice/tts] failed to start:", err);
            settle(utt);
            return;
          }
          if (utt.settled) {
            // A newer speak() (or stop()) landed while we were connecting.
            ws.close();
            return;
          }
          utt.ws = ws;

          ws.send(
            JSON.stringify({
              type: "setup",
              voice_id: VOICE_ID,
              model_name: "default",
              output_format: "pcm",
            }),
          );
        })();
      });
    },

    stop(): void {
      if (active) settle(active);
    },
  };
}
