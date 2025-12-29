/**
 * Test script for LaTeX converter
 * Run with: npx ts-node src/lib/exporters/test-converter.ts
 */

import {
    extractBibliography,
    convertCitations,
    convertLatexGrammar,
    convertHeadings,
    convertToLatex,
    mergeConsecutiveSupercites
} from './latex-converter';

// Test data
const testManuscript = `
<main_text>

# INTRODUCTION

The prevalence of alcohol-associated hepatitis (AH) continues to increase in the United States[[@article{aslam2023, author={Aslam, A. and Kwo, P. Y.}, title={Epidemiology of ALD}, journal={J Clin Exp Hepatol}, year={2023}, volume={13}, pages={88--102}}]]. Currently, AH accounts for nearly 20% of in-hospital mortality[[@article{guirguis2015, author={Guirguis, J.}, title={Clinical impact of ALD}, journal={Alcohol Clin Exp Res}, year={2015}, volume={39}, pages={2085--2094}}]].

## Study Design

A cohort of 1,127 participants were enrolled. Heavy drinking controls had low mortality (n=3; 1.2%). The primary endpoint was 90-day mortality (p<0.001).

The treatment group showed improvement ≥5 points on the MELD score compared to controls (mean difference: 8.3 ± 2.1 points).

</main_text>
`;

console.log('=== Testing Bibliography Extraction ===');
const { entries, citationKeys } = extractBibliography(testManuscript);
console.log(`Found ${entries.length} unique entries:`);
entries.forEach(e => console.log('  -', e.substring(0, 60) + '...'));
console.log(`Citation keys: ${citationKeys.join(', ')}`);

console.log('\n=== Testing Citation Conversion ===');
const withSupercites = convertCitations(testManuscript);
console.log('Sample citation conversion:');
console.log(withSupercites.match(/\\supercite\{[^}]+\}/g)?.slice(0, 3));

console.log('\n=== Testing Supercite Merging ===');
const testMerge = '\\supercite{a}\\supercite{b}\\supercite{c}';
const merged = mergeConsecutiveSupercites(mergeConsecutiveSupercites(testMerge));
console.log(`Before: ${testMerge}`);
console.log(`After: ${merged}`);

console.log('\n=== Testing LaTeX Grammar Conversion ===');
const testGrammar = `
1,127 participants
(n=3; 1.2%)
p<0.001
≥5 points
8.3 ± 2.1 points
`;
const convertedGrammar = convertLatexGrammar(testGrammar);
console.log('Before:');
console.log(testGrammar);
console.log('After:');
console.log(convertedGrammar);

console.log('\n=== Testing Heading Conversion ===');
const testHeadings = `
# INTRODUCTION
## Study Design
### Subsection
`;
const convertedHeadings = convertHeadings(testHeadings);
console.log('Before:');
console.log(testHeadings);
console.log('After:');
console.log(convertedHeadings);

console.log('\n=== Testing Full Conversion ===');
const fullDoc = convertToLatex(testManuscript, {
    title: 'Natural History of Alcohol-Associated Hepatitis',
    correspondence: 'Srinivasan Dasarathy, Cleveland Clinic. Email: dasaras@ccf.org'
});

// Print just the first 2000 chars to verify structure
console.log('Output (first 2000 chars):');
console.log(fullDoc.substring(0, 2000));
console.log('\n...\n');
console.log('Output (last 500 chars):');
console.log(fullDoc.substring(fullDoc.length - 500));

console.log('\n=== All tests completed ===');
