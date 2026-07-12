import './setup.ts';
import { afterEach, describe, expect, it } from 'bun:test';
import { openVoiceSocket, type VoiceSocketHandlers } from '../voice/token.ts';

const URL_ASR = 'wss://api.gradium.ai/api/speech/asr?token=t';

/** Minimal scriptable stand-in for the browser WebSocket (happy-dom's would
 *  try to dial the network). Installed as the global for the direct path. */
class FakeWebSocket {
	static instances: FakeWebSocket[] = [];
	static readonly OPEN = 1;
	readonly sent: string[] = [];
	readyState = 0;
	closed = false;
	onopen: (() => void) | null = null;
	onmessage: ((ev: { data: unknown }) => void) | null = null;
	onerror: (() => void) | null = null;
	onclose: ((ev: { code: number }) => void) | null = null;

	constructor(readonly url: string) {
		FakeWebSocket.instances.push(this);
	}

	send(data: string): void {
		this.sent.push(data);
	}

	close(): void {
		this.closed = true;
		this.readyState = 3;
	}

	// --- test drivers ---
	fireOpen(): void {
		this.readyState = 1;
		this.onopen?.();
	}
	fireMessage(data: unknown): void {
		this.onmessage?.({ data });
	}
	fireClose(code: number): void {
		this.onclose?.({ code });
	}
}

function installFakeWs(): void {
	FakeWebSocket.instances = [];
	(globalThis as { WebSocket?: unknown }).WebSocket = FakeWebSocket;
}

interface Collector extends VoiceSocketHandlers {
	messages: string[];
	errors: unknown[];
	closes: number;
}

function collector(): Collector {
	const c: Collector = {
		messages: [],
		errors: [],
		closes: 0,
		onMessage(data: string): void {
			c.messages.push(data);
		},
		onError(err: unknown): void {
			c.errors.push(err);
		},
		onClose(): void {
			c.closes++;
		},
	};
	return c;
}

describe('openVoiceSocket — direct path (no extension bridge)', () => {
	afterEach(() => {
		delete (globalThis as { WebSocket?: unknown }).WebSocket;
	});

	it('resolves on open and relays text frames', async () => {
		installFakeWs();
		const h = collector();
		const pending = openVoiceSocket(URL_ASR, h);
		const ws = FakeWebSocket.instances[0]!;
		expect(ws.url).toBe(URL_ASR);

		ws.fireOpen();
		const sock = await pending;
		sock.send('{"type":"setup"}');
		expect(ws.sent).toEqual(['{"type":"setup"}']);

		ws.fireMessage('{"type":"text","text":"hi"}');
		ws.fireMessage(new ArrayBuffer(4)); // off-protocol binary is ignored
		expect(h.messages).toEqual(['{"type":"text","text":"hi"}']);

		ws.fireClose(1000);
		expect(h.closes).toBe(1);
	});

	it('rejects when the socket closes before opening (the strict-CSP failure)', async () => {
		installFakeWs();
		const pending = openVoiceSocket(URL_ASR, collector());
		FakeWebSocket.instances[0]!.fireClose(1006);
		await expect(pending).rejects.toThrow(/websocket failed to open/);
	});

	it('close() is idempotent and closes the underlying socket', async () => {
		installFakeWs();
		const pending = openVoiceSocket(URL_ASR, collector());
		const ws = FakeWebSocket.instances[0]!;
		ws.fireOpen();
		const sock = await pending;
		sock.close();
		sock.close();
		expect(ws.closed).toBe(true);
	});
});

describe('openVoiceSocket — bridged path (extension socketFactory)', () => {
	it('delegates to the factory and never touches the global WebSocket', async () => {
		// No global WebSocket at all: if the bridged path fell through to `new
		// WebSocket`, this would throw — which is exactly the bug being fixed.
		delete (globalThis as { WebSocket?: unknown }).WebSocket;

		const h = collector();
		const sent: string[] = [];
		let seenUrl = '';
		let closed = false;
		const sock = await openVoiceSocket(URL_ASR, h, async (url, handlers) => {
			seenUrl = url;
			handlers.onMessage('{"type":"ready"}');
			return {
				send: (d) => sent.push(d),
				close: () => {
					closed = true;
				},
			};
		});

		expect(seenUrl).toBe(URL_ASR);
		expect(h.messages).toEqual(['{"type":"ready"}']);
		sock.send('{"type":"text"}');
		sock.close();
		expect(sent).toEqual(['{"type":"text"}']);
		expect(closed).toBe(true);
	});

	it('propagates a bridge failure to the caller', async () => {
		await expect(
			openVoiceSocket(URL_ASR, collector(), () =>
				Promise.reject(new Error('websocket failed to open: blocked')),
			),
		).rejects.toThrow(/blocked/);
	});
});
