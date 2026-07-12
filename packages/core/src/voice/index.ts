/**
 * Gradium voice layer — public contract.
 * The core widget imports this module dynamically; keep these exports stable.
 */

export interface TTSPlayer {
  /**
   * Create + resume the AudioContext synchronously. MUST be called from a real
   * user gesture (FAB click, mic click, hotkey) so Chrome's autoplay policy
   * lets later speak() calls produce sound. Idempotent — a no-op once running.
   */
  unlock(): void;
  speak(text: string): Promise<void>;
  stop(): void;
}

export interface STTSession {
  /** Cancel: tear down without emitting a transcript. */
  stop(): void;
  /**
   * Finish: stop capturing, tell the server the stream is over, wait briefly
   * for the tail of the transcript, then emit onFinal with whatever was heard
   * (possibly ""). Push-to-talk release path.
   */
  finish(): void;
}

export interface STTCallbacks {
  onPartial?(text: string): void;
  onFinal(text: string): void;
  onError?(e: unknown): void;
}

export type {
  VoiceSocket,
  VoiceSocketFactory,
  VoiceSocketHandlers,
  VoiceTransport,
} from "./token";
export { createTTS } from "./tts";
export { startSTT } from "./stt";
