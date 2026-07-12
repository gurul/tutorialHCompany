/**
 * Ephemeral Gradium token flow.
 * Tokens are SINGLE-USE: fetch a fresh one for every WebSocket connect.
 */

const TOKEN_TIMEOUT_MS = 15_000;

interface VoiceTokenResponse {
  token: string;
  expires_at: string;
}

/**
 * Proxy transport, same shape as HandymanConfig.transport. When supplied, the
 * token request routes through the extension's content-script relay instead of
 * a direct page fetch, so it bypasses the host page's CSP `connect-src`.
 * `path` is proxy-relative and leads with a slash; resolves with parsed JSON.
 */
export type VoiceTransport = (
  path: string,
  init: { method: "GET" | "POST"; body?: unknown },
) => Promise<unknown>;

/**
 * Fetch a fresh single-use token from the widget proxy: GET {endpoint}/voice-token.
 * Uses `transport` (the extension bridge) when provided so the request survives a
 * strict-CSP host page; otherwise falls back to a direct page fetch.
 */
export async function fetchVoiceToken(
  endpoint: string,
  transport?: VoiceTransport,
): Promise<string> {
  let body: VoiceTokenResponse;
  if (transport) {
    body = (await transport("/voice-token", { method: "GET" })) as VoiceTokenResponse;
  } else {
    const url = `${endpoint.replace(/\/+$/, "")}/voice-token`;
    const res = await fetch(url, { signal: AbortSignal.timeout(TOKEN_TIMEOUT_MS) });
    if (!res.ok) {
      throw new Error(`voice-token request failed: ${res.status} ${res.statusText}`);
    }
    body = (await res.json()) as VoiceTokenResponse;
  }
  if (!body.token) {
    throw new Error("voice-token response missing token");
  }
  return body.token;
}

/** Build the authenticated Gradium speech WebSocket URL. */
export function gradiumWsUrl(path: "tts" | "asr", token: string): string {
  const url = new URL(`wss://api.gradium.ai/api/speech/${path}`);
  url.searchParams.set("token", token);
  return url.toString();
}

/** Callbacks driven for the life of one voice socket. */
export interface VoiceSocketHandlers {
  onMessage(data: string): void;
  onError(err: unknown): void;
  onClose(): void;
}

/** Minimal socket surface stt.ts / tts.ts need. Mirrors HandymanConfig's. */
export interface VoiceSocket {
  send(data: string): void;
  /** Idempotent. */
  close(): void;
}

/**
 * Socket transport override, same shape as HandymanConfig.socketFactory. When
 * supplied, the Gradium WebSocket is opened by the extension's service worker
 * and frames are relayed, so it survives a host page whose CSP `connect-src`
 * omits api.gradium.ai. Absent => direct `new WebSocket` from the page.
 */
export type VoiceSocketFactory = (
  url: string,
  handlers: VoiceSocketHandlers,
) => Promise<VoiceSocket>;

/**
 * Open a voice socket; resolves on open, rejects on error/close before open.
 * Uses `factory` (the extension bridge) when provided; otherwise a direct
 * page WebSocket — the embed script and bookmarklet have no bridge.
 */
export function openVoiceSocket(
  url: string,
  handlers: VoiceSocketHandlers,
  factory?: VoiceSocketFactory,
): Promise<VoiceSocket> {
  if (factory) return factory(url, handlers);
  return new Promise<VoiceSocket>((resolve, reject) => {
    const ws = new WebSocket(url);
    let opened = false;
    const fail = (reason: string) => reject(new Error(`websocket failed to open: ${reason}`));
    ws.onopen = () => {
      opened = true;
      resolve({
        send: (data) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(data);
        },
        close: () => {
          if (ws.readyState <= WebSocket.OPEN) ws.close();
        },
      });
    };
    // Gradium speaks JSON text frames in both directions (audio is base64 INSIDE
    // the JSON), so non-string data is not part of the protocol — ignore it.
    ws.onmessage = (ev: MessageEvent) => {
      if (typeof ev.data === "string") handlers.onMessage(ev.data);
    };
    ws.onerror = () => {
      if (opened) handlers.onError(new Error("websocket error"));
      else fail("error event");
    };
    ws.onclose = (ev) => {
      if (opened) handlers.onClose();
      else fail(`closed (code ${ev.code})`);
    };
  });
}
