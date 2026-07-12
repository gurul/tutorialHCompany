import { stubRect, waitFor } from './setup.ts';
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test';
import type { Step, StepRequest } from '../types.ts';
import { createOverlay, type OverlayHandle } from '../overlay.ts';
import { createPointer, type PointerHandle } from '../pointer.ts';
import { createSession, type SessionHandle } from '../session.ts';

/** Overlay markup now lives inside a shadow root; query through it. */
function q<T extends Element = HTMLElement>(sel: string): T {
	const host = document.querySelector('[data-handyman="overlay"]')!;
	return host.shadowRoot!.querySelector(sel) as unknown as T;
}

const ENDPOINT = 'http://api.test/api';
const TIMINGS = { settleQuiet: 5, settleFloor: 1, settleCap: 50, glideMs: 1 };

function pointStep(x = 500, y = 500): Step {
	return {
		note: null,
		thought: 'user should click save',
		tool_call: {
			tool_name: 'point',
			element: 'the Save button',
			x,
			y,
			instruction: 'Click the Save button',
		},
	};
}

function writeStep(): Step {
	return {
		note: null,
		thought: 'fill the name field',
		tool_call: {
			tool_name: 'act_write',
			element: 'the name field',
			x: 500,
			y: 500,
			instruction: 'Type the customer name',
			content: 'Acme Corp',
			press_enter: true,
		},
	};
}

function answerStep(): Step {
	return {
		note: null,
		thought: 'done',
		tool_call: { tool_name: 'answer', content: 'That is how you save.' },
	};
}

/** Queue of step responses; records each StepRequest body. */
function mockFetch(steps: Step[]): { requests: StepRequest[] } {
	const requests: StepRequest[] = [];
	let i = 0;
	globalThis.fetch = mock(async (_url: unknown, init?: { body?: unknown }) => {
		requests.push(JSON.parse(String(init?.body)) as StepRequest);
		const step = steps[Math.min(i, steps.length - 1)];
		i += 1;
		return new Response(JSON.stringify({ step, fixture: false }), {
			status: 200,
			headers: { 'content-type': 'application/json' },
		});
	}) as unknown as typeof fetch;
	return { requests };
}

describe('session', () => {
	let overlay: OverlayHandle;
	let pointer: PointerHandle;
	let session: SessionHandle;
	let target: HTMLButtonElement;

	function build(): void {
		overlay = createOverlay({
			zIndex: 1000,
			callbacks: {
				onNext: () => session.ui.next(),
				onBack: () => session.ui.back(),
				onSkip: () => session.ui.skip(),
				onDoIt: () => session.ui.doIt(),
				onTargetLost: () => session.ui.targetLost(),
			},
		});
		pointer = createPointer({ zIndex: 1003 });
		session = createSession({
			config: { endpoint: ENDPOINT },
			overlay,
			pointer,
			fabCenter: () => ({ x: 990, y: 740 }),
			capture: async () => ({
				screenshot: 'data:image/png;base64,AAAA',
				viewport: { width: 1024, height: 768 },
			}),
			timings: TIMINGS,
		});
	}

	beforeEach(() => {
		document.body.innerHTML = '';
		sessionStorage.clear();
		localStorage.clear();
		target = document.createElement('button');
		target.textContent = 'Save';
		stubRect(target, 100, 100, 200, 100);
		document.body.appendChild(target);
		document.elementFromPoint = () => target;
		build();
	});

	afterEach(() => {
		session.destroy();
		overlay.destroy();
		pointer.destroy();
	});

	it('runs the loop: start → point → user click advances → answer, cache written', async () => {
		const { requests } = mockFetch([pointStep(), answerStep()]);
		session.ask('how do I save?');
		await waitFor(() => session.getState() === 'waiting_user');
		expect(requests.length).toBe(1);
		expect(requests[0]!.event).toBe('start');
		expect(requests[0]!.question).toBe('how do I save?');
		expect(requests[0]!.screenshot.startsWith('data:image/png')).toBe(true);

		// Real user click inside the cutout advances the tour.
		target.click();
		await waitFor(() => session.getState() === 'done');
		expect(requests.length).toBe(2);
		expect(requests[1]!.event).toBe('user_acted');
		expect(requests[1]!.session_id).toBe(requests[0]!.session_id);

		// Session cleared, completed tour cached.
		expect(sessionStorage.getItem('handyman:session')).toBeNull();
		const cacheKeys = Object.keys(localStorage).filter((k) =>
			k.startsWith('handyman:cache:v1:'),
		);
		expect(cacheKeys.length).toBe(1);
		expect((JSON.parse(localStorage.getItem(cacheKeys[0]!)!) as Step[]).length).toBe(2);
	});

	it('Next button advances with user_acted', async () => {
		const { requests } = mockFetch([pointStep(), answerStep()]);
		session.ask('how?');
		await waitFor(() => session.getState() === 'waiting_user');
		(q('[data-handyman-btn="next"]') as HTMLElement).click();
		await waitFor(() => session.getState() === 'done');
		expect(requests[1]!.event).toBe('user_acted');
	});

	// Regression (live on news.ycombinator.com): in a dense row of small links,
	// grounding drift of a few px lands the coordinate on the NEIGHBOUR — which is
	// interactive too, so the coord check passed and we highlighted the wrong link.
	// The cutout then exposed the wrong element and BLOCKED the real one, so the
	// user could not click the thing they were being told to click and the tour
	// could never advance. The model's own element description disagrees loudly in
	// exactly this case, and now wins.
	it('corrects a coordinate hit that lands on the wrong neighbouring link', async () => {
		const jobs = document.createElement('a');
		jobs.href = '/jobs';
		jobs.textContent = 'jobs';
		stubRect(jobs, 100, 10, 40, 20);
		document.body.appendChild(jobs);

		const submit = document.createElement('a');
		submit.href = '/submit';
		submit.textContent = 'submit';
		stubRect(submit, 150, 10, 60, 20);
		document.body.appendChild(submit);

		// Grounding drift: the coords land on `jobs`, one item to the left.
		document.elementFromPoint = () => jobs;

		const step: Step = {
			note: null,
			thought: 'the user must open the submit form',
			tool_call: {
				tool_name: 'point',
				element: "the 'submit' link",
				x: 500,
				y: 500,
				instruction: "Click on the 'submit' link in the top navigation bar.",
			},
		};
		const { requests } = mockFetch([step, answerStep()]);
		session.ask('how do I post to hacker news?');
		await waitFor(() => session.getState() === 'waiting_user');

		// The mis-hit neighbour must NOT be the step's target.
		jobs.click();
		await new Promise((r) => setTimeout(r, 30));
		expect(requests.length).toBe(1);
		expect(session.getState()).toBe('waiting_user');

		// The element the model NAMED is, so clicking it advances the tour.
		submit.click();
		await waitFor(() => session.getState() === 'done');
		expect(requests.length).toBe(2);
		expect(requests[1]!.event).toBe('user_acted');
	});

	it('skip ends the tour, clears the session, no further requests', async () => {
		const { requests } = mockFetch([pointStep(), answerStep()]);
		session.ask('how?');
		await waitFor(() => session.getState() === 'waiting_user');
		(q('[data-handyman-btn="skip"]') as HTMLElement).click();
		expect(session.getState()).toBe('done');
		expect(sessionStorage.getItem('handyman:session')).toBeNull();
		await new Promise((r) => setTimeout(r, 30));
		expect(requests.length).toBe(1);
	});

	it('missing target mid-step re-observes instead of crashing', async () => {
		const { requests } = mockFetch([pointStep(), answerStep()]);
		session.ask('how?');
		await waitFor(() => session.getState() === 'waiting_user');
		target.remove();
		window.dispatchEvent(new Event('resize'));
		await waitFor(() => session.getState() === 'done');
		expect(requests.length).toBe(2);
	});

	it('act_write dispatches focus, native value, input/change, and Enter', async () => {
		const input = document.createElement('input');
		stubRect(input, 100, 100, 200, 30);
		document.body.appendChild(input);
		document.elementFromPoint = () => input;

		const events: string[] = [];
		for (const type of ['input', 'change', 'keydown', 'keyup']) {
			input.addEventListener(type, () => events.push(type));
		}
		mockFetch([writeStep(), answerStep()]);
		session.ask('fill the form');
		await waitFor(() => session.getState() === 'done', 3000);
		expect(input.value).toBe('Acme Corp');
		expect(events).toEqual(['input', 'change', 'keydown', 'keyup']);
	});

	it('resumes a persisted cross-page session with user_acted', async () => {
		sessionStorage.setItem(
			'handyman:session',
			JSON.stringify({ session_id: 'sess-1', question: 'how?', mode: 'live' }),
		);
		const { requests } = mockFetch([answerStep()]);
		expect(session.resume()).toBe(true);
		await waitFor(() => session.getState() === 'done');
		expect(requests[0]!.event).toBe('user_acted');
		expect(requests[0]!.session_id).toBe('sess-1');
	});

	it('replays a cached tour without hitting the network', async () => {
		localStorage.setItem(
			`handyman:cache:v1:${location.origin}${location.pathname}:how?`,
			JSON.stringify([pointStep(), answerStep()]),
		);
		const { requests } = mockFetch([]);
		session.ask('how?');
		await waitFor(() => session.getState() === 'waiting_user');
		target.click();
		await waitFor(() => session.getState() === 'done');
		expect(requests.length).toBe(0);
	});
});
