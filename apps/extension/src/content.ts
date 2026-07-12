// Content script — runs in the ISOLATED world at document_idle.
//
// Responsibilities:
//   1. Read config from chrome.storage.sync; bail if disabled for this origin.
//   2. Inject the widget IIFE + the main-world init script into the page's
//      MAIN world (both via web_accessible_resources — never inline, which a
//      strict page CSP `script-src` would block).
//   3. Act as the CSP-BYPASS BRIDGE: the main-world transport cannot `fetch`
//      the proxy under a strict page `connect-src`, so it posts each request
//      here via window.postMessage; this isolated-world script (not bound by
//      the page CSP) does the real fetch and posts the JSON response back.

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

function post(res: Record<string, unknown>): void {
	window.postMessage({ __handyman: 'res', ...res }, '*');
}

async function relay(req: ReqMsg, endpoint: string): Promise<void> {
	const method = req.init?.method ?? 'POST';
	try {
		const res = await fetch(endpoint + req.path, {
			method,
			headers:
				method === 'POST' ? { 'content-type': 'application/json' } : undefined,
			body:
				method === 'POST' && req.init?.body !== undefined
					? JSON.stringify(req.init.body)
					: undefined,
		});
		if (!res.ok) {
			post({ id: req.id, ok: false, error: `HTTP ${res.status}` });
			return;
		}
		const body: unknown = await res.json();
		post({ id: req.id, ok: true, body });
	} catch (e) {
		post({ id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) });
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

	// Bridge listener: relay main-world transport requests through fetch.
	window.addEventListener('message', (ev: MessageEvent) => {
		if (ev.source !== window) return;
		if (!isReqMsg(ev.data)) return;
		void relay(ev.data, endpoint);
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
