/**
 * Word Document Converter for AI-Generated Manuscripts
 * 
 * Converts manuscripts with inline BibTeX citations to submission-ready .docx files.
 * Uses the docx npm package for pure client-side generation.
 */

import {
    Document,
    Packer,
    Paragraph,
    TextRun,
    HeadingLevel,
    AlignmentType,
    convertInchesToTwip,
    Header,
    Footer,
    PageNumber,
    NumberFormat,
    Table,
    TableRow,
    TableCell,
    WidthType,
} from 'docx';

import type { LatexMetadata } from './latex-converter';

/**
 * Citation tracking for reference numbering
 */
interface CitationTracker {
    keyToNumber: Map<string, number>;
    nextNumber: number;
    entries: Array<{ key: string; entry: string }>;
}

/**
 * Extract citation key from inline BibTeX and track it
 */
function extractAndTrackCitation(
    match: string,
    tracker: CitationTracker
): { key: string; number: number; entry: string } {
    // Match inline BibTeX: [[@type{key, ...}]]
    // Using [\s\S] instead of 's' flag for compatibility
    const bibPattern = /@(\w+)\{([^,]+),([\s\S]+)\}/;
    const bibMatch = match.match(bibPattern);

    if (!bibMatch) {
        return { key: 'unknown', number: tracker.nextNumber, entry: '' };
    }

    const entryType = bibMatch[1];
    const key = bibMatch[2].trim();
    const fields = bibMatch[3];

    // Check if already tracked
    if (tracker.keyToNumber.has(key)) {
        return {
            key,
            number: tracker.keyToNumber.get(key)!,
            entry: `@${entryType}{${key},${fields}}`
        };
    }

    // Assign new number
    const number = tracker.nextNumber++;
    tracker.keyToNumber.set(key, number);
    const entry = `@${entryType}{${key},${fields}}`;
    tracker.entries.push({ key, entry });

    return { key, number, entry };
}

/**
 * Parse a paragraph and convert inline citations to superscript numbers.
 * Returns an array of TextRun objects for the docx paragraph.
 */
function parseTextWithCitations(
    text: string,
    tracker: CitationTracker
): TextRun[] {
    const runs: TextRun[] = [];

    // Pattern for inline BibTeX: [[@type{key, ...}]]
    const pattern = /\[\[@\w+\{[^,]+,[^\]]+\}\]\]/g;

    let lastIndex = 0;
    let match;

    while ((match = pattern.exec(text)) !== null) {
        // Add text before the citation
        if (match.index > lastIndex) {
            runs.push(new TextRun({
                text: text.slice(lastIndex, match.index),
                font: 'Times New Roman',
                size: 24, // 12pt * 2
            }));
        }

        // Extract and track the citation
        const citation = extractAndTrackCitation(match[0], tracker);

        // Add superscript citation number
        runs.push(new TextRun({
            text: citation.number.toString(),
            font: 'Times New Roman',
            size: 24,
            superScript: true,
        }));

        lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
        runs.push(new TextRun({
            text: text.slice(lastIndex),
            font: 'Times New Roman',
            size: 24,
        }));
    }

    return runs;
}

/**
 * Detect heading level from markdown-style or LaTeX headings
 */
function detectHeading(line: string): { level: (typeof HeadingLevel)[keyof typeof HeadingLevel] | null; text: string } {
    // Markdown headings
    if (line.startsWith('### ')) {
        return { level: HeadingLevel.HEADING_3, text: line.slice(4).trim() };
    }
    if (line.startsWith('## ')) {
        return { level: HeadingLevel.HEADING_2, text: line.slice(3).trim() };
    }
    if (line.startsWith('# ')) {
        return { level: HeadingLevel.HEADING_1, text: line.slice(2).trim() };
    }

    // LaTeX section commands
    const sectionMatch = line.match(/\\section\*?\{(.+)\}/);
    if (sectionMatch) {
        return { level: HeadingLevel.HEADING_1, text: sectionMatch[1] };
    }
    const subsectionMatch = line.match(/\\subsection\*?\{(.+)\}/);
    if (subsectionMatch) {
        return { level: HeadingLevel.HEADING_2, text: subsectionMatch[1] };
    }
    const subsubsectionMatch = line.match(/\\subsubsection\*?\{(.+)\}/);
    if (subsubsectionMatch) {
        return { level: HeadingLevel.HEADING_3, text: subsubsectionMatch[1] };
    }

    return { level: null, text: line };
}

/**
 * Clean text of LaTeX-specific formatting for Word output
 */
function cleanLatexForWord(text: string): string {
    return text
        // Remove main_text wrapper
        .replace(/<main_text>/g, '')
        .replace(/<\/main_text>/g, '')
        // Convert LaTeX special chars
        .replace(/\\%/g, '%')
        .replace(/\\&/g, '&')
        .replace(/\\_/g, '_')
        .replace(/\\textbf\{([^}]+)\}/g, '$1')  // We'll handle bold separately
        .replace(/\\textit\{([^}]+)\}/g, '$1')  // We'll handle italic separately
        .replace(/\\emph\{([^}]+)\}/g, '$1')
        // Remove LaTeX commands we don't need
        .replace(/\\noindent\s*/g, '')
        .replace(/\\par\s*/g, '\n')
        // Convert LaTeX math approximations
        .replace(/\$\\pm\$/g, '±')
        .replace(/\$\\times\$/g, '×')
        .replace(/\$\\ge\$/g, '≥')
        .replace(/\$\\le\$/g, '≤')
        .replace(/\$p<\$/g, 'p<')
        .replace(/\$p>\$/g, 'p>')
        .replace(/\$p=\$/g, 'p=')
        .replace(/\$n=(\d+)\$/g, 'n=$1')
        // Remove remaining simple math mode
        .replace(/\$([^$]+)\$/g, '$1')
        // Clean up thousand separators
        .replace(/\{,\}/g, ',')
        // Convert dashes
        .replace(/--/g, '–')
        // Clean up extra whitespace
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * Clean LaTeX cell text (used for tables) and capture basic styling.
 */
function cleanCellContent(raw: string): { text: string; bold: boolean; italics: boolean } {
    let bold = /\\textbf\{/.test(raw);
    let italics = /\\textit\{/.test(raw) || /\\emph\{/.test(raw);

    let text = raw
        .replace(/\\\\.*$/, '') // remove end-of-row markers like \\[2pt]
        .replace(/\\textbf\{([^}]+)\}/g, '$1')
        .replace(/\\textit\{([^}]+)\}/g, '$1')
        .replace(/\\emph\{([^}]+)\}/g, '$1')
        .replace(/\\hspace\{[^}]+\}/g, '')
        .replace(/\{,\}/g, ',') // thousand separators
        .replace(/\\%/g, '%')
        .replace(/\\&/g, '&')
        .replace(/\\_/g, '_')
        .replace(/--/g, '–')
        .replace(/\s+/g, ' ')
        .trim();

    return { text, bold, italics };
}

/**
 * Parse a LaTeX longtable block into row data for Word export.
 */
function parseLongtable(lines: string[], startIndex: number) {
    const rows: Array<Array<{ text: string; bold: boolean; italics: boolean }>> = [];
    let header: Array<{ text: string; bold: boolean; italics: boolean }> | null = null;
    let i = startIndex + 1;
    let inBody = false;

    for (; i < lines.length; i++) {
        const raw = lines[i].trim();
        if (raw.startsWith('\\end{longtable}')) {
            break;
        }

        // Longtable prints header/footers multiple times; start collecting only after the last foot marker
        if (raw.startsWith('\\endlastfoot')) {
            inBody = true;
            continue;
        }

        // Capture the first header row (before body starts) so we can render a single header in Word
        if (!inBody && !header) {
            const headerLine = raw.replace(/\\\\.*$/, '').trim();
            if (headerLine && headerLine.includes('&') && !headerLine.startsWith('\\')) {
                header = headerLine.split('&').map(cell => {
                    const cleaned = cleanCellContent(cell);
                    return { ...cleaned, bold: true };
                });
            }
            continue;
        }

        if (!inBody) {
            continue;
        }

        // Skip formatting/meta lines that are not data rows
        if (!raw ||
            raw.startsWith('\\toprule') ||
            raw.startsWith('\\midrule') ||
            raw.startsWith('\\bottomrule') ||
            raw.startsWith('\\caption') ||
            raw.startsWith('\\label') ||
            raw.startsWith('\\endhead') ||
            raw.startsWith('\\endfirsthead') ||
            raw.startsWith('\\endfoot') ||
            raw.startsWith('\\endlastfoot') ||
            raw.startsWith('\\multicolumn')) {
            continue;
        }

        const cleanedLine = raw.replace(/\\\\.*$/, '').trim();
        if (!cleanedLine || !cleanedLine.includes('&')) continue;

        const cells = cleanedLine.split('&').map(cleanCellContent);
        rows.push(cells);
    }

    return { header, rows, nextIndex: i + 1 };
}

/**
 * Build a docx Table from parsed longtable rows.
 */
function buildDocxTable(
    header: Array<{ text: string; bold: boolean; italics: boolean }> | null,
    rows: Array<Array<{ text: string; bold: boolean; italics: boolean }>>
): Table {
    const allRows = header ? [header, ...rows] : rows;

    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: allRows.map(row => new TableRow({
            children: row.map(cell => new TableCell({
                children: [new Paragraph({
                    children: [new TextRun({
                        text: cell.text,
                        font: 'Times New Roman',
                        size: 24,
                        bold: cell.bold,
                        italics: cell.italics,
                    })],
                })],
            })),
        })),
    });
}

/**
 * Format a BibTeX entry as a readable reference string
 */
function formatBibEntryAsText(entry: string): string {
    // Extract fields from BibTeX
    const authorMatch = entry.match(/author\s*=\s*\{([^}]+)\}/i);
    const titleMatch = entry.match(/title\s*=\s*\{([^}]+)\}/i);
    const journalMatch = entry.match(/journal\s*=\s*\{([^}]+)\}/i);
    const yearMatch = entry.match(/year\s*=\s*\{?(\d{4})\}?/i);
    const volumeMatch = entry.match(/volume\s*=\s*\{?([^},]+)\}?/i);
    const pagesMatch = entry.match(/pages\s*=\s*\{([^}]+)\}/i);
    const doiMatch = entry.match(/doi\s*=\s*\{([^}]+)\}/i);

    const parts: string[] = [];

    if (authorMatch) {
        // Simplify author list (first 3 authors + et al)
        const authors = authorMatch[1].split(' and ');
        if (authors.length <= 3) {
            parts.push(authors.join(', '));
        } else {
            parts.push(authors.slice(0, 3).join(', ') + ', et al');
        }
    }

    if (titleMatch) {
        parts.push(titleMatch[1]);
    }

    if (journalMatch) {
        parts.push(journalMatch[1]);
    }

    if (yearMatch) {
        let yearPart = yearMatch[1];
        if (volumeMatch) {
            yearPart += `;${volumeMatch[1].trim()}`;
        }
        if (pagesMatch) {
            yearPart += `:${pagesMatch[1]}`;
        }
        parts.push(yearPart);
    }

    if (doiMatch) {
        parts.push(`doi:${doiMatch[1]}`);
    }

    return parts.join('. ') + '.';
}

/**
 * Build reference paragraphs from tracked citations
 */
function buildReferences(tracker: CitationTracker): Paragraph[] {
    const paragraphs: Paragraph[] = [];

    // References heading
    paragraphs.push(new Paragraph({
        children: [new TextRun({
            text: 'References',
            font: 'Times New Roman',
            size: 24,
            bold: true,
        })],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: convertInchesToTwip(0.5), after: convertInchesToTwip(0.25) },
    }));

    // Each reference
    for (const { key, entry } of tracker.entries) {
        const number = tracker.keyToNumber.get(key)!;
        const formattedRef = formatBibEntryAsText(entry);

        paragraphs.push(new Paragraph({
            children: [
                new TextRun({
                    text: `${number}. `,
                    font: 'Times New Roman',
                    size: 24,
                }),
                new TextRun({
                    text: formattedRef,
                    font: 'Times New Roman',
                    size: 24,
                }),
            ],
            spacing: { after: convertInchesToTwip(0.1) },
            indent: { left: convertInchesToTwip(0.5), hanging: convertInchesToTwip(0.5) },
        }));
    }

    return paragraphs;
}

/**
 * Convert an AI-generated manuscript to a Word document.
 * 
 * @param manuscript The manuscript text with inline BibTeX citations
 * @param metadata Optional metadata for title/authors
 * @returns Document object ready for packing
 */
export function convertToWord(
    manuscript: string,
    metadata?: LatexMetadata
): Document {
    const tracker: CitationTracker = {
        keyToNumber: new Map(),
        nextNumber: 1,
        entries: [],
    };

    const blocks: Array<Paragraph | Table> = [];

    // Clean the manuscript
    let content = cleanLatexForWord(manuscript);

    // Add title if provided
    if (metadata?.title) {
        blocks.push(new Paragraph({
            children: [new TextRun({
                text: metadata.title,
                font: 'Times New Roman',
                size: 32, // 16pt
                bold: true,
            })],
            alignment: AlignmentType.CENTER,
            spacing: { after: convertInchesToTwip(0.5) },
        }));
    }

    // Add authors if provided
    if (metadata?.authors && metadata.authors.length > 0) {
        const authorNames = metadata.authors.map(a => a.name).join(', ');
        blocks.push(new Paragraph({
            children: [new TextRun({
                text: authorNames,
                font: 'Times New Roman',
                size: 24,
            })],
            alignment: AlignmentType.CENTER,
            spacing: { after: convertInchesToTwip(0.25) },
        }));
    }

    // Add affiliations if provided
    if (metadata?.affiliations && metadata.affiliations.length > 0) {
        for (let i = 0; i < metadata.affiliations.length; i++) {
            blocks.push(new Paragraph({
                children: [new TextRun({
                    text: `${i + 1}. ${metadata.affiliations[i]}`,
                    font: 'Times New Roman',
                    size: 20, // 10pt
                    italics: true,
                })],
                alignment: AlignmentType.CENTER,
                spacing: { after: convertInchesToTwip(0.1) },
            }));
        }
    }

    // Add correspondence if provided
    if (metadata?.correspondence) {
        blocks.push(new Paragraph({
            children: [new TextRun({
                text: 'Correspondence: ',
                font: 'Times New Roman',
                size: 24,
                bold: true,
            }), new TextRun({
                text: metadata.correspondence,
                font: 'Times New Roman',
                size: 24,
            })],
            spacing: { before: convertInchesToTwip(0.25), after: convertInchesToTwip(0.5) },
        }));
    }

    // Process content line by line
    const lines = content.split('\n');
    let currentParagraph: string[] = [];

    const flushParagraph = () => {
        if (currentParagraph.length === 0) return;

        const text = currentParagraph.join(' ').trim();
        if (!text) {
            currentParagraph = [];
            return;
        }

        const { level, text: headingText } = detectHeading(text);

        if (level) {
            // It's a heading
            blocks.push(new Paragraph({
                children: [new TextRun({
                    text: headingText,
                    font: 'Times New Roman',
                    size: level === HeadingLevel.HEADING_1 ? 28 : 24,
                    bold: true,
                })],
                heading: level,
                spacing: { before: convertInchesToTwip(0.25), after: convertInchesToTwip(0.1) },
            }));
        } else {
            // Regular paragraph with citation processing
            const runs = parseTextWithCitations(text, tracker);
            if (runs.length > 0) {
                blocks.push(new Paragraph({
                    children: runs,
                    spacing: { after: convertInchesToTwip(0.1), line: 480 }, // Double spacing (240 twips = single)
                }));
            }
        }

        currentParagraph = [];
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Handle LaTeX longtable blocks by converting to native Word tables
        if (trimmed.startsWith('\\begin{longtable')) {
            flushParagraph();
            const { header, rows, nextIndex } = parseLongtable(lines, i);
            if (rows.length > 0) {
                blocks.push(buildDocxTable(header, rows));
            }
            i = nextIndex - 1; // jump past the table block
            continue;
        }

        // Skip LaTeX-only lines
        if (trimmed.startsWith('\\begin{') ||
            trimmed.startsWith('\\end{') ||
            trimmed.startsWith('\\includegraphics') ||
            trimmed.startsWith('\\caption') ||
            trimmed.startsWith('\\label') ||
            trimmed.startsWith('\\centering') ||
            trimmed.startsWith('\\printbibliography') ||
            trimmed.startsWith('\\maketitle') ||
            trimmed.startsWith('\\documentclass') ||
            trimmed.startsWith('\\usepackage') ||
            trimmed.startsWith('\\title{') ||
            trimmed.startsWith('\\author') ||
            trimmed.startsWith('\\affil') ||
            trimmed.startsWith('\\date') ||
            trimmed.startsWith('%')) {
            continue;
        }

        // Empty line = paragraph break
        if (trimmed === '') {
            flushParagraph();
            continue;
        }

        currentParagraph.push(trimmed);
    }

    // Flush any remaining content
    flushParagraph();

    // Add references
    if (tracker.entries.length > 0) {
        blocks.push(...buildReferences(tracker));
    }

    // Create document
    const doc = new Document({
        sections: [{
            properties: {
                page: {
                    margin: {
                        top: convertInchesToTwip(1),
                        right: convertInchesToTwip(1),
                        bottom: convertInchesToTwip(1),
                        left: convertInchesToTwip(1),
                    },
                },
            },
            headers: {
                default: new Header({
                    children: [new Paragraph({
                        children: [new TextRun({
                            text: metadata?.title || 'Manuscript',
                            font: 'Times New Roman',
                            size: 20,
                            italics: true,
                        })],
                        alignment: AlignmentType.RIGHT,
                    })],
                }),
            },
            footers: {
                default: new Footer({
                    children: [new Paragraph({
                        children: [new TextRun({
                            children: [PageNumber.CURRENT],
                            font: 'Times New Roman',
                            size: 20,
                        })],
                        alignment: AlignmentType.CENTER,
                    })],
                }),
            },
            children: blocks,
        }],
    });

    return doc;
}

/**
 * Export manuscript to Word document as Blob.
 * Main entry point for the converter.
 * 
 * @param manuscript The AI-generated manuscript
 * @param metadata Optional metadata
 * @returns Promise resolving to Blob of the .docx file
 */
export async function exportToWord(
    manuscript: string,
    metadata?: LatexMetadata
): Promise<Blob> {
    const doc = convertToWord(manuscript, metadata);
    return await Packer.toBlob(doc);
}
