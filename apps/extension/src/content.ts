// Content script — runs in the ISOLATED world at document_idle.
//
// Responsibilities:
//   1. Read config from chrome.storage.sync; bail if disabled for this origin.
//   2. Inject the widget IIFE + the main-world init script into the page's
//      MAIN world (both via web_accessible_resources — never inline, which a
//      strict page CSP `script-src` would block).
//   3. Act as the NETWORK BRIDGE RELAY: the main-world transport cannot `fetch`
//      the proxy (blocked by the page `connect-src` CSP, mixed-content on
//      https→http-localhost, and PNA/localhost gating). It posts each request
//      here via window.postMessage; this isolated-world script forwards it to
//      the BACKGROUND service worker (the only context immune to all three),
//      then posts the worker's JSON response back to the main world.
//   4. Act as the VOICE SOCKET RELAY: same problem, other protocol. The Gradium
//      speech WebSocket cannot be opened from the page either (`connect-src`),
//      so the worker owns the socket and frames are relayed over a long-lived
//      runtime Port — see the ws-* channel below.
//   5. Act as the SCREENSHOT RELAY: same problem, a third directive. The widget's
//      in-page rasterizer (snapdom) loads a `data:` URL image, which a page CSP
//      `img-src` without `data:` blocks outright — and the page cannot decode an
//      image handed to it either, so the whole screenshot has to be taken outside
//      the page. The worker does it with chrome.tabs.captureVisibleTab; this
//      script just relays the ask and the resulting data URI — see the cap-* channel.

const DEFAULT_ENDPOINT = 'http://localhost:3000/api';

interface StoredConfig {
	endpoint?: string;
	tts?: boolean;
	stt?: boolean;
	/** Voice hotkey combo, e.g. "Alt+KeyH". Absent => widget default. */
	hotkey?: string;
	hotkeyPushToTalk?: boolean;
	/** Per-origin enable flag. Absent => enabled (default on). */
	sites?: Record<string, boolean>;
}

interface ReqMsg {
	__handyman: 'req';
	id: number;
	path: string;
	init: { method?: 'GET' | 'POST'; body?: unknown };
}

function isReqMsg(d: unknown): d is ReqMsg {
	return (
		typeof d === 'object' &&
		d !== null &&
		(d as { __handyman?: unknown }).__handyman === 'req'
	);
}

interface FetchResponse {
	ok: boolean;
	status?: number;
	body?: unknown;
	error?: string;
}

/** main world -> here, on the screenshot channel. */
interface CapReqMsg {
	__handyman: 'cap-req';
	id: number;
	width: number;
	height: number;
}

interface CaptureResponse {
	ok: boolean;
	dataUrl?: string;
	error?: string;
}

function isCapReqMsg(d: unknown): d is CapReqMsg {
	return (
		typeof d === 'object' &&
		d !== null &&
		(d as { __handyman?: unknown }).__handyman === 'cap-req' &&
		typeof (d as { id?: unknown }).id === 'number'
	);
}

function post(res: Record<string, unknown>): void {
	window.postMessage({ __handyman: 'res', ...res }, '*');
}

/** Post an already-discriminated message (the ws-* channel carries its own). */
function postToPage(msg: Record<string, unknown>): void {
	window.postMessage(msg, '*');
}

// Forward one main-world request to the background service worker, which does
// the privileged fetch, then relay its response back to the main world.
function relay(req: ReqMsg, endpoint: string): void {
	console.debug('[handyman-ext] content: req received', req.id, req.path);
	chrome.runtime.sendMessage(
		{ type: 'handyman-fetch', endpoint, path: req.path, init: req.init },
		(resp: FetchResponse | undefined) => {
			const lastError = chrome.runtime.lastError;
			if (lastError || !resp) {
				const error = lastError?.message ?? 'no response from background';
				console.debug('[handyman-ext] content: bg error', req.id, error);
				post({ id: req.id, ok: false, error });
				return;
			}
			if (resp.ok) {
				console.debug('[handyman-ext] content: res posted (ok)', req.id, resp.status);
				post({ id: req.id, ok: true, body: resp.body });
			} else {
				console.debug('[handyman-ext] content: res posted (err)', req.id, resp.error);
				post({ id: req.id, ok: false, error: resp.error ?? 'fetch failed' });
			}
		},
	);
	console.debug('[handyman-ext] content: forwarded to bg', req.id);
}

// Forward one screenshot request to the service worker. Nothing to do here but
// relay: the worker needs no tab id from us (it reads sender.tab), and the reply
// is an opaque string the main world posts straight on to /api/step.
function relayCapture(req: CapReqMsg): void {
	console.debug('[handyman-ext] content: capture req', req.id);
	chrome.runtime.sendMessage(
		{ type: 'handyman-capture', width: req.width, height: req.height },
		(resp: CaptureResponse | undefined) => {
			const lastError = chrome.runtime.lastError;
			if (lastError || !resp) {
				const error = lastError?.message ?? 'no response from background';
				console.debug('[handyman-ext] content: capture bg error', req.id, error);
				postToPage({ __handyman: 'cap-res', id: req.id, ok: false, error });
				return;
			}
			if (resp.ok && typeof resp.dataUrl === 'string') {
				console.debug('[handyman-ext] content: capture ok', req.id, resp.dataUrl.length);
				postToPage({ __handyman: 'cap-res', id: req.id, ok: true, dataUrl: resp.dataUrl });
			} else {
				postToPage({
					__handyman: 'cap-res',
					id: req.id,
					ok: false,
					error: resp.error ?? 'capture failed',
				});
			}
		},
	);
}

// ---------------------------------------------------------------------------
// Voice WebSocket bridge (the other half of the relay).
//
// Main world <-window.postMessage-> here <-runtime.Port-> background worker,
// which owns the real socket. Every message carries a `sid` so the TTS and STT
// sockets (and successive utterances) can be in flight at once over one port.
// ---------------------------------------------------------------------------

const WS_PORT = 'handyman-ws';

/** main world -> here */
type WsPageMsg =
	| { __handyman: 'ws-open'; sid: number; url: string }
	| { __handyman: 'ws-send'; sid: number; data: string }
	| { __handyman: 'ws-close'; sid: number };

/** worker -> here */
type WsHostMsg =
	| { t: 'open'; sid: number }
	| { t: 'msg'; sid: number; data: string }
	| { t: 'error'; sid: number; error: string }
	| { t: 'close'; sid: number; code: number };

function isWsPageMsg(d: unknown): d is WsPageMsg {
	if (typeof d !== 'object' || d === null) return false;
	const k = (d as { __handyman?: unknown }).__handyman;
	return (
		(k === 'ws-open' || k === 'ws-send' || k === 'ws-close') &&
		typeof (d as { sid?: unknown }).sid === 'number'
	);
}

let wsPort: chrome.runtime.Port | null = null;
/** Sockets the main world still believes are live, so a worker restart can be
 *  reported to each of them instead of hanging their promises forever. */
const liveSids = new Set<number>();

function ensureWsPort(): chrome.runtime.Port {
	if (wsPort) return wsPort;
	const port = chrome.runtime.connect({ name: WS_PORT });
	wsPort = port;

	port.onMessage.addListener((raw: unknown) => {
		const m = raw as WsHostMsg;
		switch (m.t) {
			case 'open':
				postToPage({ __handyman: 'ws-opened', sid: m.sid });
				break;
			case 'msg':
				postToPage({ __handyman: 'ws-msg', sid: m.sid, data: m.data });
				break;
			case 'error':
				postToPage({ __handyman: 'ws-error', sid: m.sid, error: m.error });
				break;
			case 'close':
				liveSids.delete(m.sid);
				postToPage({ __handyman: 'ws-closed', sid: m.sid, code: m.code });
				break;
		}
	});

	port.onDisconnect.addListener(() => {
		// The MV3 worker was killed (or the extension reloaded). Its sockets died
		// with it — tell the main world so each pending open rejects and each live
		// session tears down, then let the next open() reconnect.
		wsPort = null;
		const error = chrome.runtime.lastError?.message ?? 'voice bridge disconnected';
		for (const sid of liveSids) {
			postToPage({ __handyman: 'ws-error', sid, error });
			postToPage({ __handyman: 'ws-closed', sid, code: 1006 });
		}
		liveSids.clear();
	});

	return port;
}

function relayWs(msg: WsPageMsg): void {
	// A 'send'/'close' with no port means the worker already died and the main
	// world has been told; reconnecting here would open a port with no socket.
	if (msg.__handyman !== 'ws-open' && !wsPort) return;
	const port = ensureWsPort();
	if (msg.__handyman === 'ws-open') {
		liveSids.add(msg.sid);
		port.postMessage({ t: 'open', sid: msg.sid, url: msg.url });
	} else if (msg.__handyman === 'ws-send') {
		port.postMessage({ t: 'send', sid: msg.sid, data: msg.data });
	} else {
		liveSids.delete(msg.sid);
		port.postMessage({ t: 'close', sid: msg.sid });
	}
}

function inject(cfg: {
	endpoint: string;
	tts: boolean;
	stt: boolean;
	hotkey?: string;
	hotkeyPushToTalk?: boolean;
}): void {
	const parent = document.head ?? document.documentElement;

	// The widget IIFE (defines window.Handyman). Must run first — async=false
	// preserves insertion order for dynamically added scripts.
	const widget = document.createElement('script');
	widget.src = chrome.runtime.getURL('widget/index.global.js');
	widget.async = false;

	// Main-world init: reads config from its own data-* attribute (no inline
	// script, so a strict page CSP cannot block it) and calls Handyman.init.
	const initScript = document.createElement('script');
	initScript.id = 'handyman-inject-main';
	initScript.src = chrome.runtime.getURL('inject-main.js');
	initScript.async = false;
	initScript.dataset.handymanConfig = JSON.stringify(cfg);

	parent.appendChild(widget);
	parent.appendChild(initScript);
}

async function main(): Promise<void> {
	const cfg = (await chrome.storage.sync.get([
		'endpoint',
		'tts',
		'stt',
		'hotkey',
		'hotkeyPushToTalk',
		'sites',
	])) as StoredConfig;

	const origin = location.origin;
	if (cfg.sites?.[origin] === false) return; // disabled for this site

	const endpoint = cfg.endpoint || DEFAULT_ENDPOINT;
	const tts = cfg.tts !== false; // default true
	const stt = cfg.stt !== false; // default true

	// Bridge listener: relay main-world transport requests to the background
	// worker. No `ev.source !== window` guard — cross-world postMessage can
	// carry a source the isolated world doesn't equate to `window`; the
	// `__handyman:'req'` discriminator + numeric id is the real gate.
	window.addEventListener('message', (ev: MessageEvent) => {
		if (isReqMsg(ev.data)) {
			relay(ev.data, endpoint);
			return;
		}
		// Screenshots ride the same listener, gated by `__handyman:'cap-req'` +
		// numeric id — same shape as the transport channel, one request/one reply.
		if (isCapReqMsg(ev.data)) {
			relayCapture(ev.data);
			return;
		}
		// Voice sockets ride the same listener for the same reason; here the
		// `__handyman:'ws-*'` discriminator + numeric sid is the gate.
		if (isWsPageMsg(ev.data)) relayWs(ev.data);
	});

	inject({
		endpoint,
		tts,
		stt,
		...(cfg.hotkey !== undefined ? { hotkey: cfg.hotkey } : {}),
		...(cfg.hotkeyPushToTalk !== undefined
			? { hotkeyPushToTalk: cfg.hotkeyPushToTalk }
			: {}),
	});
}

void main();

export {};
