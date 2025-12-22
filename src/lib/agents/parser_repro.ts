
import { cleanJSON, parseJSON } from './parser';

const failingOutput = `Based on the Current State, the "Sections Plan" explicitly marks the Integrated Introduction, Analysis of Trends, Racial/Ethnic Deep Dive, and Discussion sections as complete ([x]). The only remaining section with a 'todo' status ([ ]) is **References**.

Although the Manuscript Word Count (230) suggests ...

{
  "action": "finish",
  "parameters": {},
  "reasoning": "All sections are checked off."
}`;

console.log("Original text length:", failingOutput.length);

console.log("--- Testing cleanJSON ---");
try {
    const cleaned = cleanJSON(failingOutput);
    console.log("Cleaned text:", cleaned);
    console.log("Cleaned text length:", cleaned.length);
} catch (e) {
    console.error("cleanJSON Failed:", e);
}

console.log("\n--- Testing parseJSON ---");
try {
    const parsed = parseJSON(failingOutput);
    console.log("Parsed result:", parsed);
} catch (error) {
    console.error("parseJSON Failed (Expected):", error instanceof Error ? error.message : error);
}
