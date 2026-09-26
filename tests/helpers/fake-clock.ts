import type { Clock } from "../../src/core/time";

/** Deterministic clock for tests. All times are epoch milliseconds. */
export class FakeClock implements Clock {
	private current: number;

	constructor(start = 0) {
		this.current = start;
	}

	now(): number {
		return this.current;
	}

	set(ms: number): this {
		this.current = ms;
		return this;
	}

	advance(ms: number): this {
		this.current += ms;
		return this;
	}
}
