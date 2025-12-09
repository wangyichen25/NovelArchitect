
export class AhoCorasick {
    private trie: any = {};
    private failure: any = {};
    private outputs: Record<number, number[]> = {}; // Map NodeID -> Keyword Indices
    private keywords: string[] = [];

    constructor(keywords: string[]) {
        this.keywords = keywords;
        this.build(keywords);
    }

    private build(keywords: string[]) {
        this.trie = { next: {}, id: 0 };
        this.outputs = {};
        let state = 0;

        // Build Trie
        keywords.forEach((word, index) => {
            let node = this.trie;
            for (const char of word.toLowerCase()) {
                if (!node.next[char]) {
                    node.next[char] = { next: {}, id: ++state };
                }
                node = node.next[char];
            }
            if (!this.outputs[node.id]) this.outputs[node.id] = [];
            this.outputs[node.id].push(index); // Store Index
        });

        // Build Failure Links (BFS)
        const queue: any[] = [];
        for (const char in this.trie.next) {
            const nextNode = this.trie.next[char];
            this.failure[nextNode.id] = this.trie;
            queue.push(nextNode);
        }

        while (queue.length > 0) {
            const curr = queue.shift();
            for (const char in curr.next) {
                const child = curr.next[char];
                let failureNode = this.failure[curr.id];

                while (failureNode && !failureNode.next[char]) {
                    failureNode = (failureNode === this.trie) ? null : this.failure[failureNode.id];
                }

                this.failure[child.id] = failureNode ? failureNode.next[char] : this.trie;

                // Merge outputs (Indices only)
                if (this.outputs[this.failure[child.id].id]) {
                    if (!this.outputs[child.id]) this.outputs[child.id] = [];
                    // Avoid duplicates if possible, though Set is slower than array push for small nums
                    const failures = this.outputs[this.failure[child.id].id];
                    // We can just push, duplicates might exist if multiple aliases match same thing? 
                    // Set is safer.
                    failures.forEach(f => {
                        if (!this.outputs[child.id].includes(f)) this.outputs[child.id].push(f);
                    });
                }

                queue.push(child);
            }
        }
    }

    public search(text: string): { start: number, end: number, word: string }[] {
        let node = this.trie;
        const matches: { start: number, end: number, word: string }[] = [];
        const lowerText = text.toLowerCase();

        for (let i = 0; i < lowerText.length; i++) {
            const char = lowerText[i];
            while (node && !node.next[char]) {
                node = (node === this.trie) ? null : this.failure[node.id];
            }
            node = node ? node.next[char] : this.trie;

            if (this.outputs[node.id]) {
                const indices = this.outputs[node.id];
                for (let j = 0; j < indices.length; j++) {
                    const word = this.keywords[indices[j]];
                    matches.push({
                        start: i - word.length + 1,
                        end: i + 1,
                        word
                    });
                }
            }
        }
        return matches;
    }
}
