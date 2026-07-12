// The /api/step pipeline: H agent-loop message assembly, Holo call with
// structured outputs, validation with one corrective retry, fixture fallback.

import OpenAI from 'openai';
import type { Step, StepRequest, StepResponse } from '../../packages/core/src/types.ts';
import { config } from './config.ts';
import { StepError } from './errors.ts';
import { recordFixture, serveFixtureStep } from './fixtures.ts';
import { log } from './logger.ts';
import { stepJsonSchema, stepSchema } from './schema.ts';
import { getSession, type ChatMessage } from './sessions.ts';

const MODEL_NAME = 'holo3-1-35b-a3b';
// H docs cap the image budget at 3; we keep 2 (current + one prior). Durable
// state flows through `note`, so a second image is enough for this
// human-actuator loop, and one fewer image per turn cuts vision-token latency.
const MAX_IMAGES_IN_CONTEXT = 2;
// A single step's JSON is tiny; cap output so an unbounded ceiling can't let the
// model ramble (enable_thinking is off, so no reasoning tokens are billed here).
const MAX_OUTPUT_TOKENS = 512;

let client: OpenAI | null = null;

function getClient(): OpenAI {
	if (!client) {
		client = new OpenAI({
			baseURL: 'https://api.hcompany.ai/v1/',
			apiKey: config.haiApiKey,
		});
	}
	return client;
}

function systemPrompt(question: string): string {
	const prompt = [
		"You are Handyman, a friendly in-page guide. Each turn you get an <observation> with a screenshot; respond with exactly ONE tool_call.",
		'The HUMAN clicks and types unless they asked you to act for them:',
		'- Prefer "point": spotlight the next element and tell the user what to do; their own click advances the tour.',
		'- Use "act_click" / "act_write" only when the user asked you to act for them.',
		'- Use "answer" when the question is fully addressed; summarize what was accomplished.',
		'Fields:',
		'- "instruction": ONE short imperative sentence to the user, spoken aloud (e.g. "Click the New Invoice button, top right.").',
		'- "element": describe the target UI element. x, y: integers in [0, 1000], normalized to the screenshot, origin top-left.',
		'- "note": carry forward facts needed on later turns; null when nothing new.',
		`User's question: "${question}"`,
	].join('\n');
	// The model was trained with the schema visible in both the prompt and
	// structured_outputs — dropping either copy hurts reliability (H docs).
	return `${prompt}\n\n<output_format>\n\`\`\`json\n${JSON.stringify(stepJsonSchema)}\n\`\`\`\n</output_format>`;
}

function observationMessage(req: StepRequest): ChatMessage {
	return {
		role: 'user',
		content: [
			{
				type: 'text',
				text: `<observation>\nCurrent URL: ${req.url}\nViewport: ${req.viewport.width}x${req.viewport.height}\n`,
			},
			{ type: 'image_url', image_url: { url: req.screenshot } },
			{ type: 'text', text: '\n</observation>' },
		],
	};
}

/** Keep at most the last `n` screenshots; older image parts become the
 *  "[screenshot evicted]" placeholder while the <observation> wrappers stay. */
function trimToLastNImages(messages: ChatMessage[], n: number): void {
	let seen = 0;
	for (let i = messages.length - 1; i >= 0; i--) {
		const msg = messages[i];
		if (!msg || msg.role !== 'user' || !Array.isArray(msg.content)) continue;
		for (let j = 0; j < msg.content.length; j++) {
			if (msg.content[j]?.type !== 'image_url') continue;
			seen += 1;
			if (seen > n) msg.content[j] = { type: 'text', text: '[screenshot evicted]' };
		}
	}
}

function toolOutputText(event: StepRequest['event']): string {
	switch (event) {
		case 'user_acted':
			return 'user clicked the element';
		case 'agent_acted':
			return 'agent executed click';
		case 'skipped':
			return 'user skipped';
		default:
			return 'ok';
	}
}

async function completeOnce(messages: ChatMessage[]): Promise<string> {
	const params = {
		model: MODEL_NAME,
		messages,
		// Grounding-heavy single steps: temperature 0.0 (H element-localization guidance).
		temperature: 0.0,
		// Tight ceiling: one step's structured JSON is small; bounds decode latency.
		max_tokens: MAX_OUTPUT_TOKENS,
		// H-specific top-level body fields. The OpenAI JS client serializes the
		// whole body object, so unknown fields pass through on the wire — the
		// cast below only silences the SDK's param typing (per H docs' pattern).
		structured_outputs: { json: stepJsonSchema },
		chat_template_kwargs: { enable_thinking: false },
	};
	const resp = await getClient().chat.completions.create(
		params as unknown as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming,
	);
	const content = resp.choices[0]?.message?.content;
	if (!content) throw new StepError('empty completion from model', 502);
	return content;
}

function parseStep(content: string): Step | null {
	try {
		return stepSchema.parse(JSON.parse(content));
	} catch {
		return null;
	}
}

export async function handleStep(req: StepRequest): Promise<StepResponse> {
	const session = getSession(req.session_id, req.question, req.event === 'start');

	if (config.fixturesMode) {
		const step = await serveFixtureStep(req, session);
		return { step, fixture: true };
	}

	if (session.messages.length === 0) {
		session.messages.push({ role: 'system', content: systemPrompt(req.question) });
	}

	// Tool result for the previous step comes back as a <tool_output> USER
	// message (structured-outputs chat layout), then the new observation.
	if (req.event !== 'start' && session.lastToolName) {
		session.messages.push({
			role: 'user',
			content: `<tool_output tool="${session.lastToolName}">\n${toolOutputText(req.event)}\n</tool_output>`,
		});
	}
	session.messages.push(observationMessage(req));
	trimToLastNImages(session.messages, MAX_IMAGES_IN_CONTEXT);

	let content: string;
	try {
		content = await completeOnce(session.messages);
	} catch (err) {
		if (err instanceof StepError) throw err;
		const message = err instanceof Error ? err.message : String(err);
		throw new StepError(`upstream model call failed: ${message}`, 502);
	}

	let step = parseStep(content);
	if (!step) {
		log.warn('model output failed schema validation, retrying once', {
			session_id: req.session_id,
		});
		// Retry on a temp copy so the failed attempt never pollutes history.
		const retryMessages: ChatMessage[] = [
			...session.messages,
			{ role: 'assistant', content },
			{
				role: 'user',
				content:
					'Your previous message was not a valid JSON object matching the <output_format> schema. Respond again with exactly one JSON object matching that schema and nothing else.',
			},
		];
		try {
			content = await completeOnce(retryMessages);
		} catch (err) {
			if (err instanceof StepError) throw err;
			const message = err instanceof Error ? err.message : String(err);
			throw new StepError(`upstream model call failed on retry: ${message}`, 502);
		}
		step = parseStep(content);
		if (!step) {
			throw new StepError('model output failed Step schema validation after one retry', 502);
		}
	}

	// Re-add only the parsed step to history (never raw output / reasoning).
	session.messages.push({ role: 'assistant', content: JSON.stringify(step) });
	session.lastToolName = step.tool_call.tool_name;

	if (config.recordMode) {
		try {
			await recordFixture(req, step);
		} catch (err) {
			log.warn('fixture recording failed', {
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	return { step, fixture: false };
}
