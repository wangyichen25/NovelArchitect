/**
 * Counts words in a text string, correctly handling CJK characters.
 * Each CJK character is counted as one word.
 * Non-CJK text is split by whitespace.
 */
export function countWords(text: string): number {
    if (!text) return 0;

    // Remove CJK characters and count them
    // CJK Unity (4E00-9FFF), CJK Ext A (3400-4DBF), CJK Ext B (20000-2A6DF), 
    // CJK Compatibility (F900-FAFF), CJK Radicals (2E80-2EFF)
    // plus hiragana, katakana, hangul... simplified: basic CJK + extensions
    const cjkRegex = /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/g;

    // Find all CJK characters
    const cjkMatches = text.match(cjkRegex) || [];
    const cjkCount = cjkMatches.length;

    // Remove CJK chars from text to count remaining "western" words
    // Replace with space to ensure separation if they were adjacent to words
    const nonCjkText = text.replace(cjkRegex, ' ');

    // Normalize whitespace and split
    const westernWords = nonCjkText.trim().split(/\s+/).filter(w => w.length > 0);
    const westernCount = westernWords.length;

    return cjkCount + westernCount;
}

/**
 * Removes inline BibTeX citations wrapped in [[...]] and bare BibTeX entries.
 */
export function stripInlineCitations(text: string): string {
    if (!text) return '';

    const withoutInline = text.replace(/\[\[[\s\S]*?@\w+\{[\s\S]*?\}\]\]/g, ' ');
    return withoutInline.replace(/@\w+\{[^\n]*\}/g, ' ');
}

/**
 * Counts words in a text string after stripping inline citations.
 */
export function countWordsExcludingCitations(text: string): number {
    return countWords(stripInlineCitations(text));
}
