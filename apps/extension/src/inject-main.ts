// Main-world init script — runs in the PAGE's context (not the isolated
// content-script world), so window.Handyman (the injected widget IIFE) is
// reachable. Loaded via web_accessible_resources, never inline.
//
// It builds a `transport` that relays every proxy call to the content script
// over window.postMessage (the CSP-bypass bridge) and hands it to
// Handyman.init. The widget then routes ALL proxy calls through transport
// instead of fetch, so network escapes the host page's `connect-src` CSP.

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
	const transport = (path: string, init: TransportInit): Promise<unknown> =>
		new Promise<unknown>((resolve, reject) => {
			const id = ++counter;
			const onMsg = (ev: MessageEvent): void => {
				if (ev.source !== window) return;
				if (!isResMsg(ev.data, id)) return;
				window.removeEventListener('message', onMsg);
				if (ev.data.ok) resolve(ev.data.body);
				else reject(new Error(ev.data.error ?? 'transport error'));
			};
			window.addEventListener('message', onMsg);
			window.postMessage({ __handyman: 'req', id, path, init }, '*');
		});

	const start = (): void => {
		if (window.__handymanInjected) return;
		if (!window.Handyman) {
			// Widget IIFE not evaluated yet — retry shortly.
			setTimeout(start, 50);
			return;
		}
		window.__handymanInjected = true;
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
		});
	};
	start();
})();

export {};
