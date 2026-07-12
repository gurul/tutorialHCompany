// Build the unpacked MV3 extension into apps/extension/dist.
//
// - Bundles src/*.ts (content, inject-main, background, popup) with esbuild.
// - Copies manifest.json + popup.html.
// - Copies the widget IIFE from packages/core/dist (warns if missing — the
//   core bundle is built by another workstream; integration rebuilds it).
// - Generates placeholder PNG icons (no committed binaries).

import { build } from 'esbuild';
import { mkdir, copyFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import zlib from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = __dirname;
const dist = resolve(root, 'dist');
const repoRoot = resolve(root, '..', '..');
const widgetSrc = resolve(repoRoot, 'packages', 'core', 'dist', 'index.global.js');

// ---- minimal PNG encoder (RGBA -> PNG) ------------------------------------
const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();

function crc32(buf) {
	let c = 0xffffffff;
	for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
	const typeBuf = Buffer.from(type, 'ascii');
	const body = Buffer.concat([typeBuf, data]);
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length, 0);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body), 0);
	return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgba) {
	const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(size, 0);
	ihdr.writeUInt32BE(size, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // color type RGBA
	// 10..12 = compression, filter, interlace = 0
	const stride = size * 4;
	const raw = Buffer.alloc((stride + 1) * size);
	for (let y = 0; y < size; y++) {
		raw[y * (stride + 1)] = 0; // filter: none
		rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
	}
	const idat = zlib.deflateSync(raw, { level: 9 });
	return Buffer.concat([
		sig,
		chunk('IHDR', ihdr),
		chunk('IDAT', idat),
		chunk('IEND', Buffer.alloc(0)),
	]);
}

// Draw a rounded indigo square with a white cursor/target ring.
function drawIcon(size) {
	const rgba = Buffer.alloc(size * size * 4);
	const r = size * 0.22; // corner radius
	// accent indigo #4f46e5
	const bg = [0x4f, 0x46, 0xe5];
	const cx = size * 0.5;
	const cy = size * 0.5;
	const ringOuter = size * 0.3;
	const ringInner = size * 0.17;
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const i = (y * size + x) * 4;
			// rounded-square membership (px center)
			const px = x + 0.5;
			const py = y + 0.5;
			const dx = Math.max(r - px, px - (size - r), 0);
			const dy = Math.max(r - py, py - (size - r), 0);
			const inside = Math.hypot(dx, dy) <= r;
			if (!inside) {
				rgba[i] = 0;
				rgba[i + 1] = 0;
				rgba[i + 2] = 0;
				rgba[i + 3] = 0;
				continue;
			}
			const dist = Math.hypot(px - cx, py - cy);
			const isRing = dist <= ringOuter && dist >= ringInner;
			if (isRing) {
				rgba[i] = 0xff;
				rgba[i + 1] = 0xff;
				rgba[i + 2] = 0xff;
			} else {
				rgba[i] = bg[0];
				rgba[i + 1] = bg[1];
				rgba[i + 2] = bg[2];
			}
			rgba[i + 3] = 0xff;
		}
	}
	return encodePng(size, rgba);
}

// ---- build ----------------------------------------------------------------
async function run() {
	await rm(dist, { recursive: true, force: true });
	await mkdir(dist, { recursive: true });
	await mkdir(resolve(dist, 'widget'), { recursive: true });
	await mkdir(resolve(dist, 'icons'), { recursive: true });

	await build({
		entryPoints: {
			content: resolve(root, 'src', 'content.ts'),
			'inject-main': resolve(root, 'src', 'inject-main.ts'),
			background: resolve(root, 'src', 'background.ts'),
			popup: resolve(root, 'src', 'popup.ts'),
		},
		outdir: dist,
		bundle: true,
		format: 'iife',
		target: 'chrome110',
		platform: 'browser',
		sourcemap: false,
		// Build stamp: inject-main logs this once on init, so the console tells you
		// WHICH bundle the page is actually running. A stale cached inject-main.js
		// already cost us a debugging cycle once.
		define: { __HANDYMAN_BUILD__: JSON.stringify(new Date().toISOString()) },
		logLevel: 'info',
	});

	await copyFile(resolve(root, 'manifest.json'), resolve(dist, 'manifest.json'));
	await copyFile(resolve(root, 'popup.html'), resolve(dist, 'popup.html'));

	if (existsSync(widgetSrc)) {
		await copyFile(widgetSrc, resolve(dist, 'widget', 'index.global.js'));
		console.log('[build] copied widget bundle');
	} else {
		console.warn(
			`[build] WARNING: widget bundle missing at ${widgetSrc}\n` +
				'         Run the @handyman/core build first; integration will rebuild.',
		);
	}

	for (const s of [16, 48, 128]) {
		await writeFile(resolve(dist, 'icons', `icon${s}.png`), drawIcon(s));
	}
	console.log('[build] generated icons 16/48/128');
	console.log(`[build] done -> ${dist}`);
}

run().catch((e) => {
	console.error(e);
	process.exit(1);
});
