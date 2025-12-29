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
 * Removes inline BibTeX citations wrapped in [[...]], bare BibTeX entries,
 * and LaTeX figure citations (inline refs and figure environments).
 */
export function stripInlineCitations(text: string): string {
    if (!text) return '';

    // Remove inline BibTeX wrapped in [[...]]
    let result = text.replace(/\[\[[\s\S]*?@\w+\{[\s\S]*?\}\]\]/g, ' ');

    // Remove bare BibTeX entries
    result = result.replace(/@\w+\{[^\n]*\}/g, ' ');

    // Remove LaTeX figure environment blocks: \begin{figure}...\end{figure}
    result = result.replace(/\\begin\{figure\}[\s\S]*?\\end\{figure\}/g, ' ');

    // Remove inline figure references: Figure~\ref{fig:...}
    result = result.replace(/Figure~\\ref\{fig:[^}]*\}/g, ' ');

    return result;
}

/**
 * Counts words in a text string after stripping inline citations.
 */
export function countWordsExcludingCitations(text: string): number {
    return countWords(stripInlineCitations(text));
}
