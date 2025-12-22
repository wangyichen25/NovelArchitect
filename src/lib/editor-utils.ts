
export function extractTextFromContent(content: any): string {
    if (!content) return "";
    if (typeof content === 'string') return content;

    if (Array.isArray(content)) {
        const blockTypes = new Set([
            'doc',
            'paragraph',
            'heading',
            'blockquote',
            'bulletList',
            'orderedList',
            'listItem',
            'codeBlock',
            'horizontalRule',
            'table',
            'tableRow',
            'tableCell',
            'tableHeader'
        ]);
        const separator = content.some(node => {
            if (!node || typeof node !== 'object') return false;
            return blockTypes.has(node.type);
        }) ? "\n" : "";
        return content.map(extractTextFromContent).join(separator);
    }

    if (content.type === 'text') {
        return content.text || "";
    }

    if (content.type === 'hardBreak') {
        return "\n";
    }

    if (content.content) {
        return extractTextFromContent(content.content);
    }

    return "";
}
