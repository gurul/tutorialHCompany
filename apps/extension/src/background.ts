// Service worker (MV3).
//
// - onInstalled: seed sensible defaults (widget enabled everywhere by default).
// - onMessage 'set-site-enabled': toggle the per-origin enable flag and reload
//   the tab so the content script mounts / unmounts.
// - onMessage 'handyman-fetch': the network bridge. The service worker is the
//   ONLY context immune to the host page's CSP `connect-src`, mixed-content
//   (https page → http://localhost proxy), AND Private-Network-Access gating.
//   The main-world transport posts a req to the content script, which forwards
//   it here; this worker does the privileged fetch and returns the JSON.
// - onMessage 'handyman-capture': the screenshot bridge. Same story, `img-src`:
//   the widget's in-page rasterizer loads a `data:` URL image, which a strict page
//   CSP blocks — and the page cannot decode a replacement image either, so ALL
//   image work has to happen here. captureVisibleTab + OffscreenCanvas, neither of
//   which the page CSP reaches; the page only ever sees the resulting string.
//
// NOTE: MV3 does not fire chrome.action.onClicked when a default_popup is set —
// the popup opens instead. The per-site toggle therefore lives in the popup and
// is executed here (storage write + tab reload) via this message.

const DEFAULT_ENDPOINT = 'http://localhost:3000/api';

interface SetSiteMsg {
	type: 'set-site-enabled';
	origin: string;
	enabled: boolean;
	tabId: number;
}

function isSetSiteMsg(m: unknown): m is SetSiteMsg {
	return (
		typeof m === 'object' &&
		m !== null &&
		(m as { type?: unknown }).type === 'set-site-enabled'
	);
}

interface FetchMsg {
	type: 'handyman-fetch';
	endpoint: string;
	path: string;
	init: { method?: 'GET' | 'POST'; body?: unknown };
}

function isFetchMsg(m: unknown): m is FetchMsg {
	return (
		typeof m === 'object' &&
		m !== null &&
		(m as { type?: unknown }).type === 'handyman-fetch'
	);
}

chrome.runtime.onInstalled.addListener(() => {
	void (async () => {
		const cur = await chrome.storage.sync.get(['endpoint', 'tts', 'stt']);
		const patch: Record<string, unknown> = {};
		if (cur.endpoint === undefined) patch.endpoint = DEFAULT_ENDPOINT;
		if (cur.tts === undefined) patch.tts = true;
		if (cur.stt === undefined) patch.stt = true;
		if (Object.keys(patch).length > 0) await chrome.storage.sync.set(patch);
	})();
});

chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
	if (!isSetSiteMsg(msg)) return undefined;
	void (async () => {
		const { sites = {} } = (await chrome.storage.sync.get('sites')) as {
			sites?: Record<string, boolean>;
		};
		await chrome.storage.sync.set({ sites: { ...sites, [msg.origin]: msg.enabled } });
		try {
			await chrome.tabs.reload(msg.tabId);
		} catch {
			/* tab may have closed — ignore */
		}
		sendResponse({ ok: true });
	})();
	return true; // async sendResponse
});

// Network bridge: the privileged fetch. Extension-context fetch is immune to
// the page CSP, mixed-content, and PNA/localhost blocking — this is the whole
// point of moving the fetch out of the content script.
chrome.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
	if (!isFetchMsg(msg)) return undefined;
	const method = msg.init?.method ?? 'POST';
	console.debug('[handyman-ext] bg: fetch start', method, msg.endpoint + msg.path);
	void (async () => {
		try {
			const res = await fetch(msg.endpoint + msg.path, {
				method,
				headers:
					method === 'POST' ? { 'content-type': 'application/json' } : undefined,
				body:
					method === 'POST' && msg.init?.body !== undefined
						? JSON.stringify(msg.init.body)
						: undefined,
			});
			console.debug('[handyman-ext] bg: fetch status', res.status, msg.path);
			if (!res.ok) {
				sendResponse({ ok: false, status: res.status, error: `HTTP ${res.status}` });
				return;
			}
			const body: unknown = await res.json();
			sendResponse({ ok: true, status: res.status, body });
		} catch (e) {
			const error = e instanceof Error ? e.message : String(e);
			console.debug('[handyman-ext] bg: fetch error', error, msg.path);
			sendResponse({ ok: false, error });
		}
	})();
	return true; // keep the channel open for the async sendResponse
});

// ---------------------------------------------------------------------------
// Screenshot bridge.
//
// The page cannot take this screenshot and cannot even be handed one: snapdom
// rasterizes through a `data:` URL <img>, and a CSP like HN's
// (`img-src 'self' https://account.ycombinator.com`) blocks BOTH that load and any
// image we hand back. So the capture AND the resize/encode happen entirely here.
//
// chrome.tabs.captureVisibleTab needs a host permission for the tab; the manifest
// already grants `<all_urls>` in host_permissions, which satisfies it (the `tabs`
// permission is NOT required for this — only for reading tab.url et al, which we
// don't do: the window id comes from `sender`).
// ---------------------------------------------------------------------------

/** Mirrors packages/core/src/capture.ts — same raster budget on both paths, so
 *  an observation looks the same to the model whichever way it was taken. */
const MAX_IMAGE_EDGE = 1024;
const JPEG_QUALITY = 0.72;
/** Quality of the FIRST (pre-downscale) capture. Higher than the final encode on
 *  purpose: this one is only an intermediate, and JPEG artifacts baked in here
 *  would survive the resize into the image the model actually grounds on. */
const CAPTURE_QUALITY = 90;

interface CaptureMsg {
	type: 'handyman-capture';
	/** CSS viewport the caller wants; the raster arrives at dpr× this. */
	width: number;
	height: number;
}

function isCaptureMsg(m: unknown): m is CaptureMsg {
	return (
		typeof m === 'object' &&
		m !== null &&
		(m as { type?: unknown }).type === 'handyman-capture'
	);
}

/** captureVisibleTab's documented quota is ~2 calls/sec per window; over it, the
 *  call rejects with exactly this. It is a transient, self-clearing condition —
 *  the only error here worth a retry. */
const RATE_LIMIT_MARKER = 'MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND';
const RATE_LIMIT_BACKOFF_MS = 600;

function isRateLimit(e: unknown): boolean {
	return (e instanceof Error ? e.message : String(e)).includes(RATE_LIMIT_MARKER);
}

/** Take the shot, retrying ONCE if we tripped the rate limit. A tour step can
 *  legitimately land inside the quota window (act → settle → observe is fast),
 *  and one 600ms wait is far better than failing the tour. Any other error is
 *  real (no host permission, tab gone) and is surfaced immediately. */
async function captureTab(windowId: number): Promise<string> {
	try {
		return await chrome.tabs.captureVisibleTab(windowId, {
			format: 'jpeg',
			quality: CAPTURE_QUALITY,
		});
	} catch (e) {
		if (!isRateLimit(e)) throw e;
		console.debug('[handyman-ext] bg: capture rate-limited, retrying once');
		await new Promise((r) => setTimeout(r, RATE_LIMIT_BACKOFF_MS));
		return chrome.tabs.captureVisibleTab(windowId, {
			format: 'jpeg',
			quality: CAPTURE_QUALITY,
		});
	}
}

/** Bytes of a data URI, without fetch() (base64 decode is enough and has no
 *  scheme/CSP surface at all). */
function dataUriToBlob(uri: string, type: string): Blob {
	const base64 = uri.slice(uri.indexOf(',') + 1);
	const bin = atob(base64);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return new Blob([bytes], { type });
}

async function blobToDataUri(blob: Blob): Promise<string> {
	const bytes = new Uint8Array(await blob.arrayBuffer());
	// btoa on a megabyte-long string built char-by-char is slow and can blow the
	// argument limit — chunk it.
	let bin = '';
	const CHUNK = 0x8000;
	for (let i = 0; i < bytes.length; i += CHUNK) {
		bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
	}
	return `data:image/jpeg;base64,${btoa(bin)}`;
}

/**
 * Downscale the raster so its longest edge is ≤ MAX_IMAGE_EDGE, then re-encode.
 *
 * The output size is derived from the BITMAP, not from the CSS viewport, with one
 * scalar on both axes (never > 1). This is the whole ballgame for grounding
 * accuracy: the widget maps the model's normalized coords back through the CSS
 * viewport, which is only valid if the image is a UNIFORMLY scaled picture of the
 * viewport. Sizing the output from the CSS aspect while blitting a bitmap of a
 * (even slightly) different aspect would stretch one axis — every coordinate the
 * model returns then lands progressively off-target along that axis, which is
 * exactly the kind of "box is one item to the left" bug that is miserable to
 * diagnose. Scaling the bitmap by a single scalar cannot distort, whatever
 * captureVisibleTab hands us.
 *
 * cssWidth/cssHeight are therefore used ONLY to sanity-check the raster (below),
 * never to size the output.
 */
async function downscaleJpeg(
	dataUrl: string,
	cssWidth: number,
	cssHeight: number,
): Promise<string> {
	const bitmap = await createImageBitmap(dataUriToBlob(dataUrl, 'image/jpeg'));
	try {
		// Diagnostic, and cheap. captureVisibleTab should hand back the viewport at
		// dpr, so both ratios equal devicePixelRatio. If they DIVERGE, the raster is
		// not a faithful picture of the CSS viewport and grounding will be off by
		// exactly that factor — log it rather than silently mis-grounding.
		const dprX = bitmap.width / Math.max(1, cssWidth);
		const dprY = bitmap.height / Math.max(1, cssHeight);
		if (Math.abs(dprX - dprY) > 0.02) {
			console.warn(
				'[handyman-ext] bg: raster/viewport aspect mismatch —',
				`raster ${bitmap.width}x${bitmap.height}, css ${cssWidth}x${cssHeight}`,
				`(dprX ${dprX.toFixed(3)} vs dprY ${dprY.toFixed(3)}) — coords may be off`,
			);
		} else {
			console.debug(
				'[handyman-ext] bg: raster',
				`${bitmap.width}x${bitmap.height} css ${cssWidth}x${cssHeight} dpr ${dprX.toFixed(2)}`,
			);
		}

		const longest = Math.max(bitmap.width, bitmap.height);
		const scale = longest > MAX_IMAGE_EDGE ? MAX_IMAGE_EDGE / longest : 1;
		const outW = Math.max(1, Math.round(bitmap.width * scale));
		const outH = Math.max(1, Math.round(bitmap.height * scale));

		// Already within budget — the extra decode/encode round trip would only add
		// JPEG artifacts and latency.
		if (scale === 1) return dataUrl;
		const canvas = new OffscreenCanvas(outW, outH);
		const ctx = canvas.getContext('2d');
		if (ctx === null) throw new Error('offscreen 2d canvas unavailable');
		// JPEG has no alpha; paint opaque white first so nothing composites to black.
		ctx.fillStyle = '#fff';
		ctx.fillRect(0, 0, outW, outH);
		ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height, 0, 0, outW, outH);
		const blob = await canvas.convertToBlob({
			type: 'image/jpeg',
			quality: JPEG_QUALITY,
		});
		return await blobToDataUri(blob);
	} finally {
		bitmap.close();
	}
}

chrome.runtime.onMessage.addListener((msg: unknown, sender, sendResponse) => {
	if (!isCaptureMsg(msg)) return undefined;
	// The window id comes from the sender, never from the page: the content
	// script can only ever ask for a shot of the tab it is running in.
	const windowId = sender.tab?.windowId;
	if (windowId === undefined) {
		sendResponse({ ok: false, error: 'capture: no sender tab' });
		return undefined;
	}
	void (async () => {
		try {
			const raw = await captureTab(windowId);
			const dataUrl = await downscaleJpeg(raw, msg.width, msg.height);
			console.debug('[handyman-ext] bg: capture ok', dataUrl.length, 'bytes');
			sendResponse({ ok: true, dataUrl });
		} catch (e) {
			const error = e instanceof Error ? e.message : String(e);
			console.debug('[handyman-ext] bg: capture error', error);
			sendResponse({ ok: false, error: `screenshot failed: ${error}` });
		}
	})();
	return true; // keep the channel open for the async sendResponse
});

// ---------------------------------------------------------------------------
// Voice WebSocket bridge.
//
// Same failure, other protocol: the Gradium speech socket (wss://api.gradium.ai)
// opened from the page is killed by any host CSP whose `connect-src` omits that
// host — which is most large sites. So the socket is opened HERE, in the one
// context the page CSP cannot reach, and frames are relayed.
//
// A long-lived Port, not sendMessage: frames stream in BOTH directions for the
// whole utterance, which one-shot request/response cannot model. The open port
// also keeps this worker alive for the duration, so it cannot idle out mid-call.
// ---------------------------------------------------------------------------

const WS_PORT = 'handyman-ws';
/** The page can put any URL into the bridge, and this socket is privileged —
 *  so the destination is pinned here rather than trusted from the caller. */
const WS_HOST = 'api.gradium.ai';

/** content -> worker */
type WsClientMsg =
	| { t: 'open'; sid: number; url: string }
	| { t: 'send'; sid: number; data: string }
	| { t: 'close'; sid: number };

/** worker -> content */
type WsHostMsg =
	| { t: 'open'; sid: number }
	| { t: 'msg'; sid: number; data: string }
	| { t: 'error'; sid: number; error: string }
	| { t: 'close'; sid: number; code: number };

function isWsClientMsg(m: unknown): m is WsClientMsg {
	if (typeof m !== 'object' || m === null) return false;
	const t = (m as { t?: unknown }).t;
	return (
		(t === 'open' || t === 'send' || t === 'close') &&
		typeof (m as { sid?: unknown }).sid === 'number'
	);
}

function allowedWsUrl(raw: string): boolean {
	try {
		const u = new URL(raw);
		return u.protocol === 'wss:' && u.hostname === WS_HOST;
	} catch {
		return false;
	}
}

chrome.runtime.onConnect.addListener((port) => {
	if (port.name !== WS_PORT) return;
	// One socket table per port == per content script == per tab.
	const sockets = new Map<number, WebSocket>();

	const send = (m: WsHostMsg): void => {
		try {
			port.postMessage(m);
		} catch {
			/* port already torn down — the socket cleanup below will follow */
		}
	};

	const open = (sid: number, url: string): void => {
		if (!allowedWsUrl(url)) {
			send({ t: 'error', sid, error: `blocked websocket destination: ${url}` });
			return;
		}
		let ws: WebSocket;
		try {
			ws = new WebSocket(url);
		} catch (e) {
			send({ t: 'error', sid, error: e instanceof Error ? e.message : String(e) });
			return;
		}
		sockets.set(sid, ws);
		let opened = false;
		ws.onopen = () => {
			opened = true;
			console.debug('[handyman-ext] bg: ws open', sid);
			send({ t: 'open', sid });
		};
		ws.onmessage = (ev: MessageEvent) => {
			// Port messages are JSON-serialized, so binary would not survive the
			// relay. It never has to: Gradium's protocol is JSON text both ways and
			// audio rides as base64 INSIDE it. Anything else is off-protocol —
			// dropped, exactly as the direct-socket path already ignores it.
			if (typeof ev.data === 'string') send({ t: 'msg', sid, data: ev.data });
			else console.debug('[handyman-ext] bg: ws dropped non-text frame', sid);
		};
		ws.onerror = () => {
			console.debug('[handyman-ext] bg: ws error', sid, opened ? 'after open' : 'before open');
			send({ t: 'error', sid, error: 'websocket error' });
		};
		ws.onclose = (ev: CloseEvent) => {
			console.debug('[handyman-ext] bg: ws close', sid, ev.code);
			sockets.delete(sid);
			send({ t: 'close', sid, code: ev.code });
		};
	};

	port.onMessage.addListener((raw: unknown) => {
		if (!isWsClientMsg(raw)) return;
		const msg = raw;
		if (msg.t === 'open') {
			open(msg.sid, msg.url);
			return;
		}
		const ws = sockets.get(msg.sid);
		if (!ws) return;
		if (msg.t === 'send') {
			if (ws.readyState === WebSocket.OPEN) ws.send(msg.data);
			return;
		}
		// 'close': the widget is done. Drop it from the table first so the
		// onclose relay below is a no-op for a socket nobody is listening to.
		sockets.delete(msg.sid);
		ws.onclose = null;
		if (ws.readyState <= WebSocket.OPEN) ws.close();
	});

	port.onDisconnect.addListener(() => {
		// Tab navigated away / closed. Never leak a live socket: it would keep
		// streaming mic audio (and keep this worker alive) with nobody listening.
		for (const ws of sockets.values()) {
			ws.onclose = null;
			ws.onmessage = null;
			ws.onerror = null;
			if (ws.readyState <= WebSocket.OPEN) ws.close();
		}
		sockets.clear();
	});
});

export {};
