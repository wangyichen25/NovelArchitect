/**
 * LaTeX Converter for AI-Generated Manuscripts
 * 
 * Converts manuscripts with inline BibTeX citations to publication-ready .tex files.
 * Handles bibliography extraction, LaTeX grammar conversion, and document assembly.
 */

import {
    NEJM_PREAMBLE,
    NEJM_TITLE_AUTHORS,
    NEJM_DOCUMENT_START,
    NEJM_DOCUMENT_END,
} from './latex-templates';

/**
 * Metadata for LaTeX export.
 */
export interface LatexMetadata {
    title?: string;
    authors?: Array<{
        name: string;
        affiliationIndices: number[];
    }>;
    affiliations?: string[];
    correspondence?: string;
}

/**
 * Extract all inline BibTeX entries from the manuscript.
 * Entries are wrapped in [[@...]] format.
 * 
 * @param manuscript The manuscript text
 * @returns Object with entries array and citation keys map
 */
export function extractBibliography(manuscript: string): {
    entries: string[];
    keyToEntry: Map<string, string>;
    citationKeys: string[];
} {
    const entries: string[] = [];
    const keyToEntry = new Map<string, string>();
    const citationKeys: string[] = [];

    // Match inline BibTeX: [[@type{key, ...}]]
    const bibPattern = /\[\[@(\w+)\{([^,]+),([^\]]+)\}\]\]/g;
    let match;

    while ((match = bibPattern.exec(manuscript)) !== null) {
        const entryType = match[1]; // article, book, etc.
        const key = match[2].trim();
        const fields = match[3];

        // Reconstruct the BibTeX entry
        let entry = `@${entryType}{${key},${fields}}`;

        // Sanitize the entry
        entry = sanitizeBibTeX(entry);

        if (!keyToEntry.has(key)) {
            keyToEntry.set(key, entry);
            entries.push(entry);
        }

        citationKeys.push(key);
    }

    return { entries, keyToEntry, citationKeys };
}

/**
 * Sanitize a BibTeX entry to ensure validity.
 * 1. Escapes unescaped '&' characters in field values.
 * 2. Escapes unescaped '_' characters (prevent "Missing $ inserted" errors).
 * 3. Balances braces (adds missing closing braces).
 * 
 * @param entry The raw BibTeX entry string
 * @returns Sanitized entry string
 */
export function sanitizeBibTeX(entry: string): string {
    let sanitized = entry;

    // 1. Escape unescaped ampersands
    // We want to avoid escaping already escaped \& or & used in strict LaTeX commands if any (though unlikely in BibTeX fields)
    // Simple approach: replace all & that are not preceded by \ using a negative lookbehind
    // JS regex doesn't support lookbehind in all envs, but we can capture or use replace callback
    sanitized = sanitized.replace(/(?<!\\)&/g, '\\&');

    // 2. Escape unescaped underscores
    // Underscores in BibTeX fields (e.g., number={16_suppl}) cause "Missing $ inserted" errors
    // because LaTeX interprets _ as subscript operator which requires math mode
    sanitized = sanitized.replace(/(?<!\\)_/g, '\\_');

    // 3. Convert Unicode Greek letters to LaTeX math mode
    // These appear in titles like "Wnt/β-Catenin" and must be converted
    const unicodeGreekMap: Record<string, string> = {
        'α': '$\\alpha$',
        'β': '$\\beta$',
        'γ': '$\\gamma$',
        'δ': '$\\delta$',
        'ε': '$\\epsilon$',
        'ζ': '$\\zeta$',
        'η': '$\\eta$',
        'θ': '$\\theta$',
        'ι': '$\\iota$',
        'κ': '$\\kappa$',
        'λ': '$\\lambda$',
        'μ': '$\\mu$',
        'ν': '$\\nu$',
        'ξ': '$\\xi$',
        'π': '$\\pi$',
        'ρ': '$\\rho$',
        'σ': '$\\sigma$',
        'τ': '$\\tau$',
        'υ': '$\\upsilon$',
        'φ': '$\\phi$',
        'χ': '$\\chi$',
        'ψ': '$\\psi$',
        'ω': '$\\omega$',
        // Uppercase
        'Α': '$A$',
        'Β': '$B$',
        'Γ': '$\\Gamma$',
        'Δ': '$\\Delta$',
        'Ε': '$E$',
        'Ζ': '$Z$',
        'Η': '$H$',
        'Θ': '$\\Theta$',
        'Ι': '$I$',
        'Κ': '$K$',
        'Λ': '$\\Lambda$',
        'Μ': '$M$',
        'Ν': '$N$',
        'Ξ': '$\\Xi$',
        'Ο': '$O$',
        'Π': '$\\Pi$',
        'Ρ': '$P$',
        'Σ': '$\\Sigma$',
        'Τ': '$T$',
        'Υ': '$\\Upsilon$',
        'Φ': '$\\Phi$',
        'Χ': '$X$',
        'Ψ': '$\\Psi$',
        'Ω': '$\\Omega$',
    };
    for (const [unicode, latex] of Object.entries(unicodeGreekMap)) {
        sanitized = sanitized.replace(new RegExp(unicode, 'g'), latex);
    }

    // 4. Balance braces
    let openBraces = 0;
    for (const char of sanitized) {
        if (char === '{') openBraces++;
        else if (char === '}') openBraces--;
    }

    // Append missing closing braces
    while (openBraces > 0) {
        sanitized += '}';
        openBraces--;
    }

    // If somehow we have too many closing braces (negative), trim them from the end?
    // Unlikely to happen with simply appending, but good to be safe if matching fails.
    // For now, only handle missing closing braces which is the common error.

    return sanitized;
}

/**
 * Convert inline BibTeX citations to \supercite{key} format.
 * 
 * @param manuscript The manuscript text
 * @returns Manuscript with citations converted
 */
export function convertCitations(manuscript: string): string {
    // Match inline BibTeX: [[@type{key, ...}]]
    // Replace with \supercite{key}
    return manuscript.replace(
        /\[\[@(\w+)\{([^,]+),[^\]]+\}\]\]/g,
        (_, _entryType, key) => `\\supercite{${key.trim()}}`
    );
}

/**
 * Merge consecutive \supercite commands into a single command.
 * e.g., \supercite{a}\supercite{b} -> \supercite{a,b}
 * 
 * @param text Text with supercite commands
 * @returns Text with merged supercites
 */
export function mergeConsecutiveSupercites(text: string): string {
    // Match consecutive \supercite{...} commands (with optional whitespace between)
    return text.replace(
        /\\supercite\{([^}]+)\}(\s*)\\supercite\{([^}]+)\}/g,
        (_, key1, _space, key2) => `\\supercite{${key1},${key2}}`
    );
}

/**
 * Escape ampersands in text while preserving table environments.
 * Table environments (tabular, longtable, tabularx, array) use & as column separators
 * and must not be escaped. This function processes text in segments.
 * 
 * @param text The text to process
 * @returns Text with ampersands escaped outside of table environments
 */
function escapeAmpersandsOutsideTables(text: string): string {
    // Pattern to match table environments: \begin{tabletype}...\end{tabletype}
    // We need to handle nested environments and be greedy enough to capture full tables
    const tableEnvPattern = /\\begin\{(tabular|longtable|tabularx|array|ThreePartTable|TableNotes)\}[\s\S]*?\\end\{\1\}/g;

    // Find all table environments and their positions
    const tableMatches: { start: number; end: number; content: string }[] = [];
    let match;
    while ((match = tableEnvPattern.exec(text)) !== null) {
        tableMatches.push({
            start: match.index,
            end: match.index + match[0].length,
            content: match[0]
        });
    }

    // If no tables, escape normally
    if (tableMatches.length === 0) {
        return text.replace(/(?<!\\)&(?=\s+[A-Za-z])/g, '\\&');
    }

    // Process text in segments, skipping table environments
    let result = '';
    let lastEnd = 0;

    for (const tableMatch of tableMatches) {
        // Process text before this table (escape ampersands)
        const beforeTable = text.slice(lastEnd, tableMatch.start);
        result += beforeTable.replace(/(?<!\\)&(?=\s+[A-Za-z])/g, '\\&');

        // Add table content unchanged
        result += tableMatch.content;

        lastEnd = tableMatch.end;
    }

    // Process remaining text after last table
    const afterLastTable = text.slice(lastEnd);
    result += afterLastTable.replace(/(?<!\\)&(?=\s+[A-Za-z])/g, '\\&');

    return result;
}

/**
 * Apply LaTeX grammar conversions to text.
 * Handles numbers, percentages, special characters, math mode, etc.
 * 
 * @param text The text to convert
 * @returns Text with LaTeX grammar applied
 */
export function convertLatexGrammar(text: string): string {
    let result = text;

    // Preserve existing LaTeX environments and commands
    // We'll process in a way that avoids breaking existing LaTeX

    // 1. Large numbers with thousands separator: 1,127 -> 1{,}127
    // But NOT in BibTeX entries or existing LaTeX
    result = result.replace(
        /(?<!\\|\{|@\w+\{[^}]*)\b(\d{1,3}),(\d{3})\b(?![^{]*})/g,
        '$1{,}$2'
    );

    // 2. Percent signs (not already escaped, not in comments)
    // Must escape % that aren't already \%
    result = result.replace(/(?<!\\)%(?!\s*-)/g, '\\%');

    // 3. Ampersand (not already escaped, not in tables)
    // Be careful not to break table separators - only escape in running text
    // This is tricky; we'll be conservative and only escape & that appears
    // in clear prose contexts (followed by space and word)
    // IMPORTANT: Skip table environments (tabular, longtable, tabularx, array) entirely
    result = escapeAmpersandsOutsideTables(result);

    // 4. Plus-minus symbol
    result = result.replace(/±/g, '$\\pm$');

    // 5. Comparison operators in clinical text (p<0.001, P<0.05, etc.)
    // Convert p<, p>, p=, etc. to proper math mode (case insensitive)
    // Use lookahead to keep the digit
    result = result.replace(/\b[pP]\s*<\s*(?=\d)/g, '$p<$');
    result = result.replace(/\b[pP]\s*>\s*(?=\d)/g, '$p>$');
    result = result.replace(/\b[pP]\s*=\s*(?=\d)/g, '$p=$');

    // 6. Greater/less than symbols - ONLY Unicode symbols, not ASCII < >
    // ASCII < and > are used extensively in LaTeX (table column specs, environments)
    // so we must NOT convert them. Only convert Unicode symbols.
    result = result.replace(/(?<![\\$])≥/g, '$\\ge$');
    result = result.replace(/(?<![\\$])≤/g, '$\\le$');

    // 7. Multiplication sign
    result = result.replace(/×/g, '$\\times$');

    // 8. Sample size notation: (n=3; 1.2%) -> ($n=3$; 1.2\%)
    // Make 'n' italic in n=X contexts - only in parentheses to avoid false matches
    result = result.replace(/\(n\s*=\s*(\d+)/g, '($n=$1$');

    // 9. Numeric ranges with en-dash in specific contexts (pages, years)
    // Convert Unicode en-dash to LaTeX double hyphen
    result = result.replace(/–/g, '--');
    // Don't convert regular hyphens in ranges as they may be intentional

    // 10. Em-dash to comma (should already be done by manuscript cleanup)
    result = result.replace(/—/g, ', ');

    // 11. Underscores in text (not in math mode or commands)
    // Be very careful here - only escape standalone underscores
    // Skip if it's part of a LaTeX command like \begin{figure}
    // This is a simplified approach
    result = result.replace(/(?<!\\)(?<![a-zA-Z])_(?![a-zA-Z{])/g, '\\_');

    // 12. Smart quotes to LaTeX quotes (using explicit Unicode code points)
    // \u201C (left double) -> `` (LaTeX opening double quote)
    // \u201D (right double) -> '' (LaTeX closing double quote)
    // \u2018 (left single) -> ` (LaTeX opening single quote)
    // \u2019 (right single, also used as apostrophe) -> ' (ASCII apostrophe)
    result = result.replace(/\u201C/g, "``");
    result = result.replace(/\u201D/g, "''");
    result = result.replace(/\u2018/g, "`");
    result = result.replace(/\u2019/g, "'");

    // 13. Greek letters must be in math mode
    // Match \alpha, \beta, etc. that aren't already wrapped in $...$
    // Use negative lookbehind for $ and negative lookahead for $
    const greekLetters = [
        'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta',
        'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'varpi', 'rho', 'varrho', 'sigma', 'varsigma',
        'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi', 'omega',
        // Uppercase variants
        'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega'
    ];
    const greekPattern = new RegExp(
        `(?<!\\$)\\\\(${greekLetters.join('|')})\\b(?!\\s*\\$)`,
        'g'
    );
    result = result.replace(greekPattern, '$\\$1$');

    // 14. Convert Unicode Greek letters to LaTeX math mode
    // These may appear in text like "β-catenin" and must be converted
    const unicodeGreekMap: Record<string, string> = {
        'α': '$\\alpha$',
        'β': '$\\beta$',
        'γ': '$\\gamma$',
        'δ': '$\\delta$',
        'ε': '$\\epsilon$',
        'ζ': '$\\zeta$',
        'η': '$\\eta$',
        'θ': '$\\theta$',
        'ι': '$\\iota$',
        'κ': '$\\kappa$',
        'λ': '$\\lambda$',
        'μ': '$\\mu$',
        'ν': '$\\nu$',
        'ξ': '$\\xi$',
        'π': '$\\pi$',
        'ρ': '$\\rho$',
        'σ': '$\\sigma$',
        'τ': '$\\tau$',
        'υ': '$\\upsilon$',
        'φ': '$\\phi$',
        'χ': '$\\chi$',
        'ψ': '$\\psi$',
        'ω': '$\\omega$',
        // Uppercase
        'Γ': '$\\Gamma$',
        'Δ': '$\\Delta$',
        'Θ': '$\\Theta$',
        'Λ': '$\\Lambda$',
        'Ξ': '$\\Xi$',
        'Π': '$\\Pi$',
        'Σ': '$\\Sigma$',
        'Υ': '$\\Upsilon$',
        'Φ': '$\\Phi$',
        'Ψ': '$\\Psi$',
        'Ω': '$\\Omega$',
    };
    for (const [unicode, latex] of Object.entries(unicodeGreekMap)) {
        result = result.replace(new RegExp(unicode, 'g'), latex);
    }

    return result;
}

/**
 * Convert markdown-style headings to LaTeX section commands.
 * 
 * @param text Text with potential markdown headings
 * @returns Text with LaTeX section commands
 */
export function convertHeadings(text: string): string {
    let result = text;

    // ### Subsubsection (must process first - more specific)
    result = result.replace(/^###\s+(.+)$/gm, '\\subsubsection{$1}');

    // ## Subsection
    result = result.replace(/^##\s+(.+)$/gm, '\\subsection{$1}');

    // # Section
    result = result.replace(/^#\s+(.+)$/gm, '\\section{$1}');

    return result;
}

/**
 * Normalize figure and table references to use tilde (non-breaking space).
 * Fixes common AI mistakes like "Figure-\ref{...}" which produces "Figure-1" in PDF.
 * 
 * @param text The text to normalize
 * @returns Text with normalized references
 */
export function normalizeFigureReferences(text: string): string {
    let result = text;

    // Fix Figure-\ref{...} -> Figure~\ref{...}
    result = result.replace(/Figure-\\ref\{/g, 'Figure~\\ref{');
    result = result.replace(/Figure -\\ref\{/g, 'Figure~\\ref{');

    // Fix Table-\ref{...} -> Table~\ref{...}
    result = result.replace(/Table-\\ref\{/g, 'Table~\\ref{');
    result = result.replace(/Table -\\ref\{/g, 'Table~\\ref{');

    return result;
}

/**
 * Reorder figure environments to match their first citation order in text.
 * LaTeX assigns figure numbers based on the order \begin{figure} environments appear,
 * not the order of \ref{} calls. This function reorders figures to ensure proper numbering.
 * 
 * @param text The text containing figure environments
 * @returns Text with figures reordered by first citation
 */
export function reorderFigures(text: string): string {
    // Extract all figure environments
    const figurePattern = /\\begin\{figure\}[\s\S]*?\\end\{figure\}/g;
    const figures: { content: string; label: string; firstRefIndex: number }[] = [];

    let match;
    while ((match = figurePattern.exec(text)) !== null) {
        const figContent = match[0];
        // Extract label from figure
        const labelMatch = figContent.match(/\\label\{(fig:[^}]+)\}/);
        if (labelMatch) {
            const label = labelMatch[1];
            // Find first reference to this figure in the text
            const refPattern = new RegExp(`\\\\ref\\{${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\}`);
            const refMatch = text.match(refPattern);
            const firstRefIndex = refMatch ? text.indexOf(refMatch[0]) : Infinity;

            figures.push({
                content: figContent,
                label,
                firstRefIndex
            });
        }
    }

    // If no figures or only one, return as-is
    if (figures.length <= 1) {
        return text;
    }

    // Sort figures by their first reference position
    figures.sort((a, b) => a.firstRefIndex - b.firstRefIndex);

    // Remove all figure environments from the text
    let result = text.replace(figurePattern, '<<<FIGURE_PLACEHOLDER>>>');

    // Replace placeholders with reordered figures
    for (const fig of figures) {
        result = result.replace('<<<FIGURE_PLACEHOLDER>>>', fig.content);
    }

    return result;
}

/**
 * Normalize paragraph breaks for LaTeX.
 * Ensures paragraphs are separated by blank lines.
 * 
 * AI-generated content often comes with paragraphs on single lines or
 * with only single newlines between them. LaTeX requires blank lines
 * (double newlines) to separate paragraphs.
 * 
 * This function:
 * 1. Preserves LaTeX environments (figure, table, ThreePartTable, etc.)
 * 2. Adds blank lines between paragraphs based on sentence boundaries
 * 3. Ensures sections have proper spacing
 * 
 * @param text The text to normalize
 * @returns Text with proper paragraph breaks
 */
export function normalizeParagraphs(text: string): string {
    // Split content into lines
    const lines = text.split('\n');
    const result: string[] = [];
    let inEnvironment = 0; // Track nested environments

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();

        // Track environment depth
        if (trimmedLine.match(/\\begin\{/)) {
            inEnvironment++;
        }
        if (trimmedLine.match(/\\end\{/)) {
            inEnvironment = Math.max(0, inEnvironment - 1);
        }

        result.push(line);

        // Skip if we're inside an environment
        if (inEnvironment > 0) continue;

        // Skip empty lines (already a paragraph break)
        if (trimmedLine === '') continue;

        // Skip LaTeX commands that should have their own spacing
        if (trimmedLine.match(/^\\(section|subsection|subsubsection|noindent|begin|end|caption|label|printbibliography)/)) {
            continue;
        }

        // Check if this line ends a paragraph (ends with sentence-ending punctuation)
        // and the next non-empty line starts a new paragraph
        const nextLineIndex = i + 1;
        if (nextLineIndex < lines.length) {
            const nextLine = lines[nextLineIndex].trim();

            // If next line is empty, we already have a paragraph break
            if (nextLine === '') continue;

            // Check if current line ends a sentence and next line starts a new thought
            const endsWithSentence = trimmedLine.match(/[.!?)\d]\s*$/) ||
                trimmedLine.match(/\\supercite\{[^}]+\}\s*$/);

            // Next line starts a new paragraph if it:
            // - Starts with a capital letter (new sentence)
            // - Is a section command
            // - Starts with a LaTeX environment
            const startsNewParagraph = nextLine.match(/^[A-Z]/) ||
                nextLine.match(/^\\(section|subsection|begin)/) ||
                nextLine.match(/^\\noindent/);

            // Add blank line between paragraphs
            if (endsWithSentence && startsNewParagraph) {
                result.push('');
            }
        }
    }

    // Clean up multiple consecutive blank lines
    let finalResult = result.join('\n');
    finalResult = finalResult.replace(/\n{3,}/g, '\n\n');

    return finalResult;
}

/**
 * Format title in LaTeX.
 * 
 * @param title The title text
 * @returns LaTeX \title{} command
 */
export function formatTitle(title: string): string {
    return `\\title{${title}}`;
}

/**
 * Format authors and affiliations in LaTeX using authblk package.
 * 
 * @param authors Array of author objects
 * @param affiliations Array of affiliation strings
 * @returns LaTeX author/affil commands
 */
export function formatAuthors(
    authors: Array<{ name: string; affiliationIndices: number[] }>,
    affiliations: string[]
): string {
    const lines: string[] = [];

    // Author lines
    for (const author of authors) {
        const indices = author.affiliationIndices.join(',');
        lines.push(`\\author[${indices}]{\\textbf{${author.name}}}`);
    }

    // Blank line between authors and affiliations
    lines.push('');

    // Affiliation lines
    for (let i = 0; i < affiliations.length; i++) {
        lines.push(`\\affil[${i + 1}]{${affiliations[i]}}`);
    }

    return lines.join('\n');
}

/**
 * Parse title and authors from manuscript if present.
 * Looks for patterns like "Title: ..." or first # heading as title.
 * 
 * @param manuscript The manuscript text
 * @returns Extracted metadata or undefined
 */
export function parseManuscriptMetadata(manuscript: string): LatexMetadata | undefined {
    const metadata: LatexMetadata = {};

    // Try to find title (first # heading or "Title:" line)
    const titleMatch = manuscript.match(/^#\s+(.+)$/m) ||
        manuscript.match(/^Title:\s*(.+)$/mi);
    if (titleMatch) {
        metadata.title = titleMatch[1].trim();
    }

    // Authors and affiliations are more complex to parse
    // For now, return just the title if found

    return Object.keys(metadata).length > 0 ? metadata : undefined;
}

/**
 * Extract LaTeX title page elements from manuscript content.
 * This handles cases where AI generates \title{}, \author[]{}, \affil[]{} inline.
 * These must be moved to before \begin{document}.
 * 
 * @param content The manuscript content
 * @returns Object with extracted elements and cleaned content
 */
export function extractTitlePageElements(content: string): {
    titleCommands: string[];
    authorCommands: string[];
    affilCommands: string[];
    correspondenceSection: string;
    cleanedContent: string;
} {
    const titleCommands: string[] = [];
    const authorCommands: string[] = [];
    const affilCommands: string[] = [];
    let correspondenceSection = '';
    let cleanedContent = content;

    // Extract \title{...} commands (may span multiple lines)
    const titlePattern = /\\title\{([^}]+)\}/g;
    let match;
    while ((match = titlePattern.exec(content)) !== null) {
        titleCommands.push(match[0]);
    }
    cleanedContent = cleanedContent.replace(titlePattern, '');

    // Extract \author[N]{\textbf{...}} commands
    const authorPattern = /\\author\[[^\]]+\]\{\\textbf\{[^}]+\}\}/g;
    while ((match = authorPattern.exec(content)) !== null) {
        authorCommands.push(match[0]);
    }
    cleanedContent = cleanedContent.replace(authorPattern, '');

    // Extract \affil[N]{...} commands
    const affilPattern = /\\affil\[[^\]]+\]\{[^}]+\}/g;
    while ((match = affilPattern.exec(content)) !== null) {
        affilCommands.push(match[0]);
    }
    cleanedContent = cleanedContent.replace(affilPattern, '');

    // Extract \section*{Correspondence} or \section*{Corresponding Author} section
    // Match the section header and following content until next \section, \noindent, or blank line
    const corrPattern = /\\section\*\{Correspond(?:ence|ing Author)\}\s*([^\n]*(?:\n(?!\\section|\\noindent)[^\n]*)*)/i;
    const corrMatch = content.match(corrPattern);
    if (corrMatch) {
        correspondenceSection = corrMatch[1].trim();
        // Only remove the section header and its content, not the whole match including next section
        cleanedContent = cleanedContent.replace(/\\section\*\{Correspond(?:ence|ing Author)\}\s*([^\n]*(?:\n(?!\\section|\\noindent)[^\n]*)*)/i, '');
    }

    // Clean up extra blank lines that may result from extraction
    cleanedContent = cleanedContent.replace(/\n{3,}/g, '\n\n').trim();

    return {
        titleCommands,
        authorCommands,
        affilCommands,
        correspondenceSection,
        cleanedContent
    };
}

/**
 * Remove the <main_text>...</main_text> wrapper tags from manuscript.
 * 
 * @param manuscript The manuscript text
 * @returns Manuscript content without wrapper tags
 */
export function removeMainTextWrapper(manuscript: string): string {
    return manuscript
        .replace(/<main_text>/g, '')
        .replace(/<\/main_text>/g, '');
}

/**
 * Format the complete bibliography block for embedding.
 * 
 * @param entries Array of BibTeX entry strings
 * @returns Formatted bibliography string
 */
export function formatBibliography(entries: string[]): string {
    return entries.join('\n\n');
}

/**
 * Convert an AI-generated manuscript to a complete LaTeX document.
 * 
 * @param manuscript The manuscript text with inline BibTeX citations
 * @param metadata Optional metadata for title/authors
 * @returns Complete LaTeX document string
 */
export function convertToLatex(
    manuscript: string,
    metadata?: LatexMetadata
): string {
    // 1. Remove main_text wrapper
    let content = removeMainTextWrapper(manuscript);

    // 2. Extract bibliography
    const { entries } = extractBibliography(content);
    const bibliography = formatBibliography(entries);

    // 3. Convert inline citations to \supercite
    content = convertCitations(content);

    // 4. Merge consecutive supercites
    // Apply multiple times to handle chains of 3+
    for (let i = 0; i < 5; i++) {
        content = mergeConsecutiveSupercites(content);
    }

    // 5. Convert markdown headings to LaTeX
    content = convertHeadings(content);

    // 6. Normalize paragraph breaks (must be before grammar conversion)
    content = normalizeParagraphs(content);

    // 7. Apply LaTeX grammar conversions
    content = convertLatexGrammar(content);

    // 8. Normalize figure/table references (fix hyphen to tilde)
    content = normalizeFigureReferences(content);

    // 9. Reorder figures based on citation order
    content = reorderFigures(content);

    // 10. Extract title page elements from content (must be before \begin{document})
    const extracted = extractTitlePageElements(content);
    content = extracted.cleanedContent;

    // 8. Build document
    let doc = '';

    // Preamble with embedded bibliography
    doc += NEJM_PREAMBLE.replace('{BIBLIOGRAPHY}', bibliography);

    // Title and authors - either from extracted content or from metadata
    let titleAuthors = NEJM_TITLE_AUTHORS;

    // Title: prefer extracted, fall back to metadata
    if (extracted.titleCommands.length > 0) {
        titleAuthors = titleAuthors.replace('{TITLE}', extracted.titleCommands.join('\n'));
    } else if (metadata?.title) {
        titleAuthors = titleAuthors.replace('{TITLE}', formatTitle(metadata.title));
    } else {
        titleAuthors = titleAuthors.replace('{TITLE}', '');
    }

    // Authors and affiliations: prefer extracted, fall back to metadata
    if (extracted.authorCommands.length > 0 || extracted.affilCommands.length > 0) {
        const authorsAffils = [
            ...extracted.authorCommands,
            '',
            ...extracted.affilCommands
        ].join('\n');
        titleAuthors = titleAuthors.replace('{AUTHORS_AND_AFFILIATIONS}', authorsAffils);
    } else if (metadata?.authors && metadata?.affiliations) {
        titleAuthors = titleAuthors.replace(
            '{AUTHORS_AND_AFFILIATIONS}',
            formatAuthors(metadata.authors, metadata.affiliations)
        );
    } else {
        titleAuthors = titleAuthors.replace('{AUTHORS_AND_AFFILIATIONS}', '');
    }

    doc += titleAuthors;

    // Document start
    doc += NEJM_DOCUMENT_START;

    // Add correspondence - prefer extracted, fall back to metadata
    if (extracted.correspondenceSection) {
        doc += extracted.correspondenceSection + '\n\n';
    } else if (metadata?.correspondence) {
        doc += metadata.correspondence + '\n\n';
    }

    // Main content
    doc += content;

    // Document end
    doc += NEJM_DOCUMENT_END;

    return doc;
}

/**
 * Export manuscript to LaTeX file content.
 * Main entry point for the converter.
 * 
 * @param manuscript The AI-generated manuscript
 * @param metadata Optional metadata
 * @returns Complete .tex file content
 */
export function exportToLatex(
    manuscript: string,
    metadata?: LatexMetadata
): string {
    return convertToLatex(manuscript, metadata);
}
