// SVG arrow pointer. Two-wrapper trick from the reference: the OUTER wrapper
// travels (a persistent spring loop integrates its transform toward a
// retargetable goal), the INNER wrapper idle-bobs on a keyframe animation, so
// travel and bob never fight over `transform`. dockTo still uses a one-shot
// CSS transition for the shrink-to-FAB landing. Follow ("buddy") mode springs
// the pointer after the user's real cursor with a trailing offset.

import type { CutBox, Side } from './overlay.ts';

export interface PointerHandle {
	show(): void;
	hide(): void; // also exits follow mode
	/** Glide beside the cutout, rotated so the arrow points at the target. Exits follow mode. */
	pointTo(cut: CutBox, side: Side): void;
	/** Brief press animation (scale dip + click ripple) before the agent acts. */
	press(): Promise<void>;
	/** Shrink-and-land into the FAB, then hide. Exits follow mode. Fires opts.onDock when landed. */
	dockTo(x: number, y: number): Promise<void>;
	/** Buddy mode: pointer springs after the user's real mouse cursor with a trailing offset.
	    Optional `from` = starting point (e.g. the FAB center) so it visibly pops out of the FAB. */
	startFollow(from?: { x: number; y: number }): void;
	stopFollow(): void;
	destroy(): void;
}

export const POINTER_SIZE = 40;
const HALF = POINTER_SIZE / 2;
// Distance from cutout edge to pointer center.
const EDGE_GAP = 12 + HALF;
const DOCK_MS = 650;
const PRESS_MS = 300;
const RIPPLE_MS = 420;

// Spring tuning. Slightly underdamped so travel overshoots a touch and
// settles — reads as hand-moved, not railed. Critical damping for k=160 is
// ~25.3; for k=100 it's 20. Follow mode is softer so the buddy trails the
// cursor like a companion instead of sticking to it.
const TRAVEL_K = 160;
const TRAVEL_C = 22;
const FOLLOW_K = 100;
const FOLLOW_C = 16;
// Background tabs starve rAF; clamp dt so a huge frame gap can't explode the
// integration (spring becomes unstable when k*dt² grows past ~1).
const MAX_DT_MS = 32;
// Buddy trails below-right of the real cursor so it never sits under it. The
// host stays pointer-events: none in every mode (follow included), so it can
// never intercept a click — going home is the launcher's job, not the buddy's.
const FOLLOW_DX = 26;
const FOLLOW_DY = 30;
// Subtle life in follow mode: tilt with horizontal velocity, spring back to
// upright at rest. 12° at ~500 px/s, clamped.
const TILT_MAX = 12;
const TILT_PER_VX = 12 / 500;

// Settle thresholds — the loop must self-stop (never spin idle, and never
// leave a live rAF chain behind in tests).
const SETTLE_DIST = 0.3; // px per axis
const SETTLE_SPEED = 3; // px/s
const SETTLE_ROT = 0.3; // deg
const SETTLE_ROT_SPEED = 6; // deg/s

function prefersReducedMotion(): boolean {
	try {
		return (
			typeof window !== 'undefined' &&
			typeof window.matchMedia === 'function' &&
			window.matchMedia('(prefers-reduced-motion: reduce)').matches
		);
	} catch {
		return false;
	}
}

const CAN_RAF =
	typeof requestAnimationFrame === 'function' &&
	typeof cancelAnimationFrame === 'function';

// Minimal cursor dart, tip at top center pointing straight up (the SIDE_ROT
// map depends on this convention). Slender, slightly curved sides; ink fill
// with a crisp paper outline so it reads on any background. The floating
// drop-shadow lives in POINTER_CSS (svg-level filter) so the FAB glyph —
// which reuses this markup by class — stays flat.
export const POINTER_SVG = `<svg class="handyman-pointer__svg" width="${POINTER_SIZE}" height="${POINTER_SIZE}" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<path d="M20 3 C21.2 6.4 25.1 18.6 28.5 27.3 C29 28.6 27.7 29.8 26.5 29.2 L21.3 26.6 C20.5 26.2 19.5 26.2 18.7 26.6 L13.5 29.2 C12.3 29.8 11 28.6 11.5 27.3 C14.9 18.6 18.8 6.4 20 3 Z" fill="var(--handyman-ink, #16161a)" stroke="var(--handyman-paper, #fff)" stroke-width="1.75" stroke-linejoin="round"/>
</svg>`;

// The arrow art points up; rotate the whole wrapper so it points at the
// target from whichever side it sits on.
const SIDE_ROT: Record<Side, number> = {
	bottom: 0, // below the target, pointing up
	top: 180, // above, pointing down
	left: 90, // left of target, pointing right
	right: -90, // right of target, pointing left
};

const POINTER_CSS = `
:host {
	position: fixed;
	top: 0;
	left: 0;
	width: ${POINTER_SIZE}px;
	height: ${POINTER_SIZE}px;
	/* Fallback only. Travel is driven per-frame by the spring loop (which sets
	   an inline transition without a transform component so it can't
	   double-animate); dockTo sets its own transform transition inline for the
	   landing. */
	transition: opacity 300ms ease;
	will-change: transform;
	pointer-events: none;
}
.handyman-pointer__svg {
	filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.28));
}
.handyman-pointer__bob {
	animation: handyman-bob 2.4s ease-in-out infinite;
}
.handyman-pointer__bob--press {
	animation: handyman-press ${PRESS_MS}ms ease;
}
.handyman-pointer__ripple {
	position: absolute;
	/* Centered on the arrow tip (top center of the box); the host's rotation
	   carries it to wherever the tip actually points. */
	left: ${HALF - 4}px;
	top: -1px;
	width: 8px;
	height: 8px;
	border-radius: 999px;
	border: 2px solid var(--handyman-accent, #4353ff);
	pointer-events: none;
	animation: handyman-ripple ${RIPPLE_MS}ms ease-out forwards;
}
@keyframes handyman-bob {
	0%, 100% { transform: translateY(0); }
	50% { transform: translateY(-5px); }
}
@keyframes handyman-press {
	0%, 100% { transform: scale(1); }
	50% { transform: scale(0.8); }
}
@keyframes handyman-ripple {
	from { transform: scale(1); opacity: 0.9; }
	to { transform: scale(5); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
	:host { transition-duration: 0ms !important; }
	.handyman-pointer__bob, .handyman-pointer__bob--press { animation: none !important; }
}
`;

/** Shortest angular path so the arrow never spins the long way round. */
function shortestDelta(from: number, to: number): number {
	return ((((to - from) % 360) + 540) % 360) - 180;
}

export function createPointer(opts: {
	zIndex: number;
	/** dockTo finished landing (pointer is home in the FAB). */
	onDock?: () => void;
}): PointerHandle {
	const wrap = document.createElement('div');
	wrap.className = 'handyman-pointer';
	wrap.setAttribute('data-handyman', 'pointer');
	wrap.setAttribute('aria-hidden', 'true');
	wrap.style.zIndex = String(opts.zIndex);
	// Shadow-isolate so host CSS can't restyle the arrow; the host div keeps
	// [data-handyman] + the spring transform (styled via :host in POINTER_CSS).
	const shadow = wrap.attachShadow({ mode: 'open' });

	const style = document.createElement('style');
	style.textContent = POINTER_CSS;
	shadow.appendChild(style);

	const bob = document.createElement('div');
	bob.className = 'handyman-pointer__bob';
	bob.innerHTML = POINTER_SVG;
	shadow.appendChild(bob);

	document.body.appendChild(wrap);
	wrap.style.display = 'none';

	// Logical state the spring integrates: pointer CENTER (cx, cy) + rotation,
	// with their velocities, chasing a retargetable goal. `placed` gates the
	// first appearance — a fresh (hidden/docked) pointer snaps to its first
	// target instead of gliding in from a stale spot.
	let curX = HALF;
	let curY = HALF;
	let curRot = 0;
	let velX = 0;
	let velY = 0;
	let velRot = 0;
	let tgtX = HALF;
	let tgtY = HALF;
	let tgtRot = 0;
	let placed = false;
	let following = false;
	let rafId: number | null = null;
	let lastT = 0;

	function stopLoop(): void {
		if (rafId !== null) {
			cancelAnimationFrame(rafId);
			rafId = null;
		}
	}

	// Low-level: paint the OUTER wrapper transform. The inner bob wrapper owns
	// the idle bob / press dip on its own transform, so travel never fights bob.
	function place(cx: number, cy: number, rot: number, scale = 1): void {
		wrap.style.transform = `translate(${cx - HALF}px, ${cy - HALF}px) rotate(${rot}deg)${scale !== 1 ? ` scale(${scale})` : ''}`;
	}

	// Jump straight to a target with no transform transition (first placement
	// or reduced-motion). Records state so a later spring starts from here.
	function snap(x: number, y: number, rot: number): void {
		stopLoop();
		curX = x;
		curY = y;
		curRot = rot;
		velX = 0;
		velY = 0;
		velRot = 0;
		tgtX = x;
		tgtY = y;
		tgtRot = rot;
		placed = true;
		wrap.style.transition = 'opacity 300ms ease';
		place(x, y, rot);
	}

	// One persistent physics loop: classic damped spring per axis + rotation,
	// dt clamped so background-tab jank doesn't explode the sim. Self-starts
	// on retarget, self-stops when settled — never spins idle.
	function step(now: number): void {
		const dt = Math.min(MAX_DT_MS, Math.max(0, now - lastT)) / 1000;
		lastT = now;
		const k = following ? FOLLOW_K : TRAVEL_K;
		const c = following ? FOLLOW_C : TRAVEL_C;

		velX += (k * (tgtX - curX) - c * velX) * dt;
		curX += velX * dt;
		velY += (k * (tgtY - curY) - c * velY) * dt;
		curY += velY * dt;

		// In follow mode the arrow tilts with horizontal velocity (springs back
		// upright at rest); guided travel chases the side rotation instead.
		const wantRot = following
			? Math.max(-TILT_MAX, Math.min(TILT_MAX, velX * TILT_PER_VX))
			: tgtRot;
		const goalRot = curRot + shortestDelta(curRot, wantRot);
		velRot += (k * (goalRot - curRot) - c * velRot) * dt;
		curRot += velRot * dt;

		const settled =
			Math.abs(tgtX - curX) < SETTLE_DIST &&
			Math.abs(tgtY - curY) < SETTLE_DIST &&
			Math.abs(velX) < SETTLE_SPEED &&
			Math.abs(velY) < SETTLE_SPEED &&
			Math.abs(goalRot - curRot) < SETTLE_ROT &&
			Math.abs(velRot) < SETTLE_ROT_SPEED;

		if (settled) {
			// Land EXACTLY on target (the ring/card share this geometry, so drift
			// would misalign them). Next retarget/mousemove restarts the loop.
			curX = tgtX;
			curY = tgtY;
			curRot = goalRot;
			velX = 0;
			velY = 0;
			velRot = 0;
			place(curX, curY, curRot);
			rafId = null;
			return;
		}
		place(curX, curY, curRot);
		rafId = requestAnimationFrame(step);
	}

	// Point the spring at a new goal. First show, reduced motion, or no rAF →
	// snap, exactly like the old tween's snap path.
	function retarget(x: number, y: number, rot: number): void {
		if (!placed || prefersReducedMotion() || !CAN_RAF) {
			snap(x, y, rot);
			return;
		}
		tgtX = x;
		tgtY = y;
		tgtRot = rot;
		// The loop paints every frame — the CSS transform transition must be off
		// or it would double-animate and overshoot. Opacity keeps its ease.
		wrap.style.transition = 'opacity 300ms ease';
		if (rafId === null) {
			lastT = performance.now();
			rafId = requestAnimationFrame(step);
		}
	}

	// Follow ("buddy") mode. The host stays pointer-events: none here too —
	// the buddy is pure presentation; clicking the LAUNCHER sends it home.
	const onFollowMouse = (e: MouseEvent): void => {
		retarget(e.clientX + FOLLOW_DX, e.clientY + FOLLOW_DY, 0);
	};

	function exitFollow(): void {
		if (!following) return;
		following = false;
		window.removeEventListener('mousemove', onFollowMouse, true);
	}

	// A dock that gets superseded (new show/follow within DOCK_MS) must not
	// fire its landing timer later — it would display:none a pointer that is
	// back in use and report a spurious onDock.
	let dockTimer: ReturnType<typeof setTimeout> | null = null;
	let dockResolve: (() => void) | null = null;
	function cancelDock(): void {
		if (dockTimer === null) return;
		clearTimeout(dockTimer);
		dockTimer = null;
		// The superseded dock never landed: settle its promise without the
		// hide/onDock side effects.
		dockResolve?.();
		dockResolve = null;
	}

	function show(): void {
		// Intentionally does NOT reset `placed`: between steps the pointer
		// stays visible and should GLIDE to the next target. Only hide()/
		// dockTo (true disappearance) reset it so a fresh entrance snaps.
		cancelDock();
		wrap.style.display = '';
		wrap.style.opacity = '1';
		bob.className = 'handyman-pointer__bob';
	}

	return {
		show,
		hide(): void {
			exitFollow();
			stopLoop();
			cancelDock();
			wrap.style.display = 'none';
			placed = false;
		},
		pointTo(cut: CutBox, side: Side): void {
			exitFollow(); // tour guidance outranks buddy
			const cx = cut.left + cut.width / 2;
			const cy = cut.top + cut.height / 2;
			let x = cx;
			let y = cy;
			switch (side) {
				case 'right':
					x = cut.left + cut.width + EDGE_GAP;
					break;
				case 'left':
					x = cut.left - EDGE_GAP;
					break;
				case 'bottom':
					y = cut.top + cut.height + EDGE_GAP;
					break;
				case 'top':
					y = cut.top - EDGE_GAP;
					break;
			}
			retarget(x, y, SIDE_ROT[side]);
		},
		press(): Promise<void> {
			bob.className = 'handyman-pointer__bob--press';
			if (!prefersReducedMotion()) {
				// Click ripple at the arrow tip; the host's rotation carries it to
				// wherever the tip points. Removed after its animation ends.
				const ripple = document.createElement('div');
				ripple.className = 'handyman-pointer__ripple';
				shadow.appendChild(ripple);
				setTimeout(() => ripple.remove(), RIPPLE_MS);
			}
			return new Promise((resolve) => {
				setTimeout(() => {
					bob.className = 'handyman-pointer__bob';
					resolve();
				}, PRESS_MS);
			});
		},
		dockTo(x: number, y: number): Promise<void> {
			// Stop the spring so the dock owns the transform, then land via a CSS
			// transition (reduced motion → instant).
			exitFollow();
			stopLoop();
			cancelDock(); // restart: only one landing timer may be live
			bob.className = ''; // Bob pauses so the dock isn't mid-hop.
			const dockMs = prefersReducedMotion() ? 0 : DOCK_MS;
			wrap.style.transition = `transform ${dockMs}ms ease, opacity 300ms ease`;
			curX = x;
			curY = y;
			curRot = 0;
			velX = 0;
			velY = 0;
			velRot = 0;
			place(x, y, 0, 0.5);
			return new Promise((resolve) => {
				dockResolve = resolve;
				dockTimer = setTimeout(() => {
					dockTimer = null;
					dockResolve = null;
					wrap.style.display = 'none';
					placed = false; // next entrance snaps in fresh
					opts.onDock?.();
					resolve();
				}, dockMs);
			});
		},
		startFollow(from?: { x: number; y: number }): void {
			// Seed position (FAB center → visible pop-out); a never-placed pointer
			// snaps wherever it currently is instead of gliding from a stale spot.
			if (from) snap(from.x, from.y, 0);
			else if (!placed) snap(curX, curY, 0);
			following = true;
			show();
			// Duplicate adds are deduped by the browser (same fn + capture).
			window.addEventListener('mousemove', onFollowMouse, {
				capture: true,
				passive: true,
			});
		},
		stopFollow(): void {
			exitFollow();
		},
		destroy(): void {
			exitFollow();
			stopLoop();
			cancelDock();
			wrap.remove();
		},
	};
}
