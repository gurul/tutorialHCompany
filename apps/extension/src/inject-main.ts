// Main-world init script — runs in the PAGE's context (not the isolated
// content-script world), so window.Handyman (the injected widget IIFE) is
// reachable. Loaded via web_accessible_resources, never inline.
//
// It builds a `transport` (proxy HTTP calls), a `socketFactory` (the Gradium
// voice WebSocket) and a `captureScreenshot` (the viewport screenshot), all of
// which relay to the content script over window.postMessage (the CSP-bypass
// bridge), and hands them to Handyman.init. The widget then routes ALL network —
// fetch AND socket — through them, so nothing is subject to the host page's
// `connect-src` CSP, and takes its screenshot in the service worker, so nothing
// is subject to its `img-src` CSP either.

interface TransportInit {
	method: 'GET' | 'POST';
	body?: unknown;
}

interface ResMsg {
	__handyman: 'res';
	id: number;
	ok: boolean;
	body?: unknown;
	error?: string;
}

interface SocketHandlers {
	onMessage(data: string): void;
	onError(err: unknown): void;
	onClose(): void;
}

interface Socket {
	send(data: string): void;
	close(): void;
}

/** Replies on the screenshot channel (content script -> here). */
interface CapResMsg {
	__handyman: 'cap-res';
	id: number;
	ok: boolean;
	dataUrl?: string;
	error?: string;
}

/** Stamped in by the build (see build.mjs). Identifies the LIVE bundle. */
declare const __HANDYMAN_BUILD__: string;

/** Replies on the voice-socket channel (content script -> here). */
type WsResMsg =
	| { __handyman: 'ws-opened'; sid: number }
	| { __handyman: 'ws-msg'; sid: number; data: string }
	| { __handyman: 'ws-error'; sid: number; error: string }
	| { __handyman: 'ws-closed'; sid: number; code: number };

declare global {
	interface Window {
		Handyman?: {
			init(config: {
				endpoint: string;
				tts?: boolean;
				stt?: boolean;
				hotkey?: string;
				hotkeyPushToTalk?: boolean;
				transport?: (path: string, init: TransportInit) => Promise<unknown>;
				socketFactory?: (url: string, handlers: SocketHandlers) => Promise<Socket>;
				captureScreenshot?: (opts: { width: number; height: number }) => Promise<string>;
			}): void;
			ask?(q: string): void;
		};
		__handymanInjected?: boolean;
	}
}

function isResMsg(d: unknown, id: number): d is ResMsg {
	return (
		typeof d === 'object' &&
		d !== null &&
		(d as { __handyman?: unknown }).__handyman === 'res' &&
		(d as { id?: unknown }).id === id
	);
}

function isCapResMsg(d: unknown, id: number): d is CapResMsg {
	return (
		typeof d === 'object' &&
		d !== null &&
		(d as { __handyman?: unknown }).__handyman === 'cap-res' &&
		(d as { id?: unknown }).id === id
	);
}

function isWsResMsg(d: unknown, sid: number): d is WsResMsg {
	if (typeof d !== 'object' || d === null) return false;
	const k = (d as { __handyman?: unknown }).__handyman;
	return (
		(k === 'ws-opened' || k === 'ws-msg' || k === 'ws-error' || k === 'ws-closed') &&
		(d as { sid?: unknown }).sid === sid
	);
}

(function bootstrap(): void {
	if (window.__handymanInjected) return; // guard against double-init

	const el =
		(document.currentScript as HTMLScriptElement | null) ??
		(document.getElementById('handyman-inject-main') as HTMLScriptElement | null);
	const raw = el?.dataset.handymanConfig;
	if (!raw) return;

	let cfg: {
		endpoint: string;
		tts: boolean;
		stt: boolean;
		hotkey?: string;
		hotkeyPushToTalk?: boolean;
	};
	try {
		cfg = JSON.parse(raw) as typeof cfg;
	} catch {
		return;
	}

	let counter = 0;
	const TRANSPORT_TIMEOUT_MS = 20_000;
	const transport = (path: string, init: TransportInit): Promise<unknown> =>
		new Promise<unknown>((resolve, reject) => {
			const id = ++counter;
			console.debug('[handyman-ext] inject: req sent', id, path);
			// Bound the wait: if the relay/background chain never answers (worker
			// asleep, host blocked, proxy down), reject so the widget's
			// session.fail() surfaces "couldn't finish" instead of hanging forever.
			const timer = window.setTimeout(() => {
				window.removeEventListener('message', onMsg);
				console.debug('[handyman-ext] inject: timeout', id, path);
				reject(
					new Error(`transport timeout after ${TRANSPORT_TIMEOUT_MS}ms for ${path}`),
				);
			}, TRANSPORT_TIMEOUT_MS);
			const onMsg = (ev: MessageEvent): void => {
				if (ev.source !== window) return;
				if (!isResMsg(ev.data, id)) return;
				window.clearTimeout(timer);
				window.removeEventListener('message', onMsg);
				console.debug('[handyman-ext] inject: res received', id, ev.data.ok);
				if (ev.data.ok) resolve(ev.data.body);
				else reject(new Error(ev.data.error ?? 'transport error'));
			};
			window.addEventListener('message', onMsg);
			window.postMessage({ __handyman: 'req', id, path, init }, '*');
		});

	// Voice sockets: the widget asks for a socket, we hand back a proxy whose
	// frames travel main world -> content script -> service worker, which holds
	// the real WebSocket. Same reason as `transport` above: a page CSP whose
	// `connect-src` omits api.gradium.ai kills a socket opened from here.
	let sockets = 0;
	const WS_OPEN_TIMEOUT_MS = 15_000;
	const socketFactory = (url: string, handlers: SocketHandlers): Promise<Socket> =>
		new Promise<Socket>((resolve, reject) => {
			const sid = ++sockets;
			let opened = false;
			let closed = false;

			const cleanup = (): void => {
				window.clearTimeout(timer);
				window.removeEventListener('message', onMsg);
			};

			// Bound the connect the same way `transport` does: if the relay chain
			// never answers, reject so the widget reports "voice unavailable"
			// instead of leaving the mic spinning forever.
			const timer = window.setTimeout(() => {
				if (opened) return;
				cleanup();
				closed = true;
				window.postMessage({ __handyman: 'ws-close', sid }, '*');
				reject(new Error(`websocket open timed out after ${WS_OPEN_TIMEOUT_MS}ms`));
			}, WS_OPEN_TIMEOUT_MS);

			const onMsg = (ev: MessageEvent): void => {
				if (ev.source !== window) return;
				if (!isWsResMsg(ev.data, sid)) return;
				const msg = ev.data;
				switch (msg.__handyman) {
					case 'ws-opened':
						if (opened) return;
						opened = true;
						window.clearTimeout(timer);
						console.debug('[handyman-ext] inject: ws open', sid);
						resolve({
							send: (data: string) => {
								if (closed) return;
								window.postMessage({ __handyman: 'ws-send', sid, data }, '*');
							},
							close: () => {
								if (closed) return;
								closed = true;
								cleanup();
								window.postMessage({ __handyman: 'ws-close', sid }, '*');
							},
						});
						break;
					case 'ws-msg':
						if (!closed) handlers.onMessage(msg.data);
						break;
					case 'ws-error':
						if (closed) return;
						// Before open, an error is the open failing: reject and let the
						// close that follows be a no-op. After open, it is informational —
						// the socket's own close is what ends the session.
						if (!opened) {
							closed = true;
							cleanup();
							reject(new Error(`websocket failed to open: ${msg.error}`));
						} else {
							handlers.onError(new Error(msg.error));
						}
						break;
					case 'ws-closed':
						if (closed) return;
						closed = true;
						cleanup();
						if (opened) handlers.onClose();
						else reject(new Error(`websocket failed to open: closed (code ${msg.code})`));
						break;
				}
			};

			window.addEventListener('message', onMsg);
			window.postMessage({ __handyman: 'ws-open', sid, url }, '*');
		});

	// Screenshots: the widget asks for a JPEG of the viewport, we relay the ask to
	// the service worker (via the content script), which takes it with
	// chrome.tabs.captureVisibleTab and downscales it in an OffscreenCanvas. The
	// page never rasterizes or decodes an image, so a host CSP whose `img-src`
	// omits `data:` (news.ycombinator.com) can no longer kill the capture — it only
	// ever holds the returned string and posts it on to /api/step.
	let caps = 0;
	// Generous: the worker may be cold, and captureVisibleTab can be rate-limited
	// into a backoff+retry (see background.ts). Still bounded, so a dead relay
	// surfaces as session.fail() instead of a tour that hangs forever.
	const CAPTURE_TIMEOUT_MS = 15_000;
	const captureScreenshot = (opts: {
		width: number;
		height: number;
	}): Promise<string> =>
		new Promise<string>((resolve, reject) => {
			const id = ++caps;
			console.debug('[handyman-ext] inject: capture req', id, opts.width, opts.height);
			const timer = window.setTimeout(() => {
				window.removeEventListener('message', onMsg);
				reject(new Error(`screenshot timed out after ${CAPTURE_TIMEOUT_MS}ms`));
			}, CAPTURE_TIMEOUT_MS);
			const onMsg = (ev: MessageEvent): void => {
				if (ev.source !== window) return;
				if (!isCapResMsg(ev.data, id)) return;
				window.clearTimeout(timer);
				window.removeEventListener('message', onMsg);
				const msg = ev.data;
				if (msg.ok && typeof msg.dataUrl === 'string') {
					console.debug('[handyman-ext] inject: capture res', id, msg.dataUrl.length);
					resolve(msg.dataUrl);
				} else {
					reject(new Error(msg.error ?? 'screenshot failed'));
				}
			};
			window.addEventListener('message', onMsg);
			window.postMessage(
				{ __handyman: 'cap-req', id, width: opts.width, height: opts.height },
				'*',
			);
		});

	const start = (): void => {
		if (window.__handymanInjected) return;
		if (!window.Handyman) {
			// Widget IIFE not evaluated yet — retry shortly.
			setTimeout(start, 50);
			return;
		}
		window.__handymanInjected = true;
		// Build stamp. A stale cached inject-main.js once cost a whole debugging
		// cycle (the page kept opening the Gradium socket directly long after the
		// shipped code stopped doing that) with no way to tell WHICH build was live.
		// One line, on init, naming the build and the bridges it actually has.
		console.info(
			`[handyman-ext] build ${__HANDYMAN_BUILD__} — bridges: transport, socket, capture`,
		);
		// This init runs in the page's MAIN world, which is exactly where the
		// widget's document-level keydown hotkey listener must live to intercept
		// the host page's keyboard events — content-script isolated worlds don't
		// share the page's DOM event target. Forward the hotkey config through.
		window.Handyman.init({
			endpoint: cfg.endpoint,
			tts: cfg.tts,
			stt: cfg.stt,
			hotkey: cfg.hotkey,
			hotkeyPushToTalk: cfg.hotkeyPushToTalk,
			transport,
			socketFactory,
			captureScreenshot,
		});
	};
	start();
})();

export {};
