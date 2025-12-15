import JSZip from 'jszip';

export interface EpubChapter {
    title: string;
    content: string;
}

export async function parseEpub(file: File): Promise<EpubChapter[]> {
    const zip = new JSZip();
    const content = await zip.loadAsync(file);

    // 1. Find the OPF file path from META-INF/container.xml
    const container = await content.file("META-INF/container.xml")?.async("string");
    if (!container) throw new Error("Invalid EPUB: Missing META-INF/container.xml");

    const parser = new DOMParser();
    const containerDoc = parser.parseFromString(container, "application/xml");
    const rootfile = containerDoc.querySelector("rootfile");
    const opfPath = rootfile?.getAttribute("full-path");

    if (!opfPath) throw new Error("Invalid EPUB: No rootfile found in container.xml");

    // 2. Parse the OPF file
    const opfContent = await content.file(opfPath)?.async("string");
    if (!opfContent) throw new Error(`Invalid EPUB: OPF file not found at ${opfPath}`);

    const opfDoc = parser.parseFromString(opfContent, "application/xml");
    const manifest = opfDoc.getElementsByTagName("manifest")[0];
    const spine = opfDoc.getElementsByTagName("spine")[0];
    const metadata = opfDoc.getElementsByTagName("metadata")[0]; // For future use if needed

    if (!manifest || !spine) throw new Error("Invalid EPUB: OPF missing manifest or spine");

    // Map manifest items by ID for easy lookup
    const manifestItems = new Map<string, string>();
    Array.from(manifest.getElementsByTagName("item")).forEach(item => {
        const id = item.getAttribute("id");
        const href = item.getAttribute("href");
        if (id && href) manifestItems.set(id, href);
    });

    // 3. Iterate through spine to get reading order
    const chapters: EpubChapter[] = [];
    const spineItems = Array.from(spine.getElementsByTagName("itemref"));

    // Helper to resolve relative paths
    // opfPath might be "OEBPS/content.opf", href might be "Text/chapter1.xhtml" -> "OEBPS/Text/chapter1.xhtml"
    const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/'));

    const resolvePath = (href: string) => {
        if (!opfDir) return href;
        return `${opfDir}/${href}`;
    };

    for (const itemRef of spineItems) {
        const idref = itemRef.getAttribute("idref");
        if (!idref) continue;

        const href = manifestItems.get(idref);
        if (!href) continue;

        const fullPath = resolvePath(href);
        const fileContent = await content.file(fullPath)?.async("string");

        if (fileContent) {
            const doc = parser.parseFromString(fileContent, "application/xhtml+xml") || parser.parseFromString(fileContent, "text/html");

            // Try to extract a title
            let title = doc.querySelector("title")?.textContent ||
                doc.querySelector("h1")?.textContent ||
                doc.querySelector("h2")?.textContent ||
                "Chapter";

            // If body exists, get its content, otherwise fallback
            const body = doc.body;
            let htmlContent = "";

            if (body) {
                // Clean up some content if necessary, or just take innerHTML
                // Simple version: take innerHTML
                htmlContent = body.innerHTML;
            } else {
                htmlContent = fileContent; // Fallback to raw if logic fails
            }

            chapters.push({
                title: title.trim(),
                content: htmlContent
            });
        }
    }

    return chapters;
}
