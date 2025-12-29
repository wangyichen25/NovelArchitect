/**
 * LaTeX Templates for NEJM-style Manuscript Export
 * 
 * These templates define the hardcoded structure for NEJM-formatted LaTeX documents.
 * The bibliography is embedded using filecontents* and biber is used for processing.
 */

/**
 * NEJM preamble template.
 * {BIBLIOGRAPHY} placeholder will be replaced with extracted BibTeX entries.
 */
export const NEJM_PREAMBLE = `% ---------- Embedded Bibliography ----------
\\begin{filecontents*}[overwrite]{\\jobname.bib}
{BIBLIOGRAPHY}
\\end{filecontents*}

\\documentclass[12pt]{article}

% ---------- Packages ----------
\\usepackage[margin=1in]{geometry}
\\usepackage[T1]{fontenc}
\\usepackage[utf8]{inputenc}
\\usepackage[strict]{csquotes}
\\usepackage{mathptmx}  % Times Roman font (NEJM requirement)
\\usepackage{setspace}
\\usepackage{authblk}
\\usepackage{amsmath, amssymb}
\\usepackage{siunitx}
\\usepackage{threeparttable}
\\usepackage{longtable,threeparttablex,booktabs}
\\usepackage{graphicx}
\\usepackage{caption}
\\usepackage{subcaption}
\\usepackage[hidelinks]{hyperref}
\\usepackage{enumitem}
\\usepackage[backend=biber,style=nejm,sorting=none,maxnames=6,minnames=3,terseinits=true,isbn=false]{biblatex}
\\addbibresource{\\jobname.bib}
\\captionsetup{font=small, labelfont=bf}
\\usepackage{tabularx}
\\usepackage{lineno}

% ---------- Formatting tweaks ----------
\\setlength{\\parskip}{0.6em}
\\setlength{\\parindent}{0pt}
\\doublespacing
\\linenumbers
`;

/**
 * Document start template.
 * {TITLE} and {AUTHORS_AND_AFFILIATIONS} placeholders will be replaced.
 */
export const NEJM_TITLE_AUTHORS = `
% ---------- Title & Authors ----------
{TITLE}

{AUTHORS_AND_AFFILIATIONS}
`;

/**
 * Document body start (after title/authors, before correspondence).
 */
export const NEJM_DOCUMENT_START = `
\\date{}

% ---------- Document ----------
\\begin{document}
\\maketitle

% Correspondence
\\section*{Correspondence}
`;

/**
 * Document end template.
 */
export const NEJM_DOCUMENT_END = `
\\printbibliography

% ---------- End ----------
\\end{document}
`;

/**
 * Abstract wrapper template.
 */
export const NEJM_ABSTRACT = `
% Abstract
\\begin{abstract}
{ABSTRACT_CONTENT}
\\end{abstract}
`;
