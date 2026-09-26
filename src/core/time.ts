/** Injectable time source so core logic stays deterministic in tests. */
export interface Clock {
	now(): number;
}

export class SystemClock implements Clock {
	now(): number {
		return Date.now();
	}
}

/** Format a timestamp as a local-timezone YYYY-MM-DD key. */
export function localDayKey(timestamp: number): string {
	const date = new Date(timestamp);
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

/** Local midnight that immediately follows the given timestamp. */
export function startOfNextLocalDay(timestamp: number): number {
	const date = new Date(timestamp);
	date.setHours(24, 0, 0, 0);
	return date.getTime();
}

/** Midnight of the ISO week (Monday) containing the given timestamp. */
export function startOfWeekLocal(timestamp: number): number {
	const date = new Date(timestamp);
	const daysSinceMonday = (date.getDay() + 6) % 7;
	date.setHours(0, 0, 0, 0);
	date.setDate(date.getDate() - daysSinceMonday);
	return date.getTime();
}
