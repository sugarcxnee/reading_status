/** A chapter heading parsed from a note, identified by normalized title. */
export interface Section {
	id: string;
	title: string;
	/** Zero-based line index of the heading. */
	lineIndex: number;
	/** Heading position within the document, in [0, 1]. */
	positionRatio: number;
}

/** Section identity: the title with collapsed whitespace. */
export function normalizeSectionId(title: string): string {
	return title.trim().replace(/\s+/g, " ");
}

function buildHeadingPattern(level: number): RegExp {
	const hashes = "#".repeat(level);
	// Exactly `level` hashes, up to three leading spaces, then a title.
	return new RegExp(`^ {0,3}${hashes}(?=\\s|$)\\s*(.+?)\\s*$`);
}

function isFenceLine(line: string): boolean {
	return /^\s{0,3}(```|~~~)/.test(line);
}

/**
 * Parse chapter headings at the given level, skipping code fences. The final
 * newline does not count toward the document length used for ratios.
 */
export function parseHeadings(text: string, level: number): Section[] {
	const lines = text.split("\n");
	const denominator = Math.max(
		1,
		lines.length - (lines[lines.length - 1] === "" ? 1 : 0),
	);
	const headingPattern = buildHeadingPattern(level);
	const sections: Section[] = [];
	let insideFence = false;

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index];
		if (isFenceLine(line)) {
			insideFence = !insideFence;
			continue;
		}
		if (insideFence) {
			continue;
		}
		const match = headingPattern.exec(line);
		if (match === null) {
			continue;
		}
		const title = match[1];
		sections.push({
			id: normalizeSectionId(title),
			title,
			lineIndex: index,
			positionRatio: index / denominator,
		});
	}
	return sections;
}

/**
 * Merge sections reached by the current scroll ratio into the stored read
 * list. Returns ids without duplicates: stored order first, then newly read
 * sections in document order.
 */
export function updateReadSections(
	sections: Section[],
	scrollRatio: number,
	stored: string[],
): string[] {
	const result: string[] = [];
	const seen = new Set<string>();
	for (const id of stored) {
		if (!seen.has(id)) {
			seen.add(id);
			result.push(id);
		}
	}
	for (const section of sections) {
		if (section.positionRatio <= scrollRatio && !seen.has(section.id)) {
			seen.add(section.id);
			result.push(section.id);
		}
	}
	return result;
}

export interface ChapterStats {
	total: number;
	read: number;
	remaining: number;
}

/**
 * Compare current document sections against stored read ids. Stored ids that
 * no longer match any heading (renamed or removed) are ignored so the
 * remaining count always reflects the current document.
 */
export function computeChapterStats(
	sections: Section[],
	stored: string[],
): ChapterStats {
	const storedIds = new Set(stored);
	const read = sections.filter((section) => storedIds.has(section.id)).length;
	return {
		total: sections.length,
		read,
		remaining: sections.length - read,
	};
}
