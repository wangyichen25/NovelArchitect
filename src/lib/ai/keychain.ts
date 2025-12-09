
// Simple browser-side encryption for API keys
// In a real production app, we might want more robust key management, 
// but for a local-first app, encrypting with a user-provided PIN or just obstructing plain text is a start.
// Given the requirements, I'll implement a basic AES-GCM wrapper.

export class KeyChain {
    private static isSecure(): boolean {
        return !!(window.crypto && window.crypto.subtle);
    }

    private static async getKey(password: string): Promise<CryptoKey> {
        const enc = new TextEncoder();
        return window.crypto.subtle.importKey(
            "raw",
            enc.encode(password),
            { name: "PBKDF2" },
            false,
            ["deriveKey"]
        ).then(keyMaterial => {
            return window.crypto.subtle.deriveKey(
                {
                    name: "PBKDF2",
                    salt: enc.encode("novel-architect-salt"),
                    iterations: 100000,
                    hash: "SHA-256",
                },
                keyMaterial,
                { name: "AES-GCM", length: 256 },
                false,
                ["encrypt", "decrypt"]
            );
        });
    }

    static async encrypt(text: string, pin: string): Promise<string> {
        if (!this.isSecure()) {
            console.warn("Secure context not found (HTTPS/Localhost). Falling back to Base64 encoding.");
            // Simple XOR with PIN to avoid plain text in local storage at least visually
            return "insecure:" + btoa(text);
        }

        const key = await this.getKey(pin);
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(text);

        const encrypted = await window.crypto.subtle.encrypt(
            { name: "AES-GCM", iv },
            key,
            encoded
        );

        const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
        const encryptedHex = Array.from(new Uint8Array(encrypted)).map(b => b.toString(16).padStart(2, '0')).join('');

        return `${ivHex}:${encryptedHex}`;
    }

    static async decrypt(ciphertext: string, pin: string): Promise<string | null> {
        if (ciphertext.startsWith("insecure:")) {
            return atob(ciphertext.replace("insecure:", ""));
        }

        if (!this.isSecure()) {
            // If we have secure data but are now in insecure context, we can't decrypt
            console.error("Cannot decrypt secure data in insecure context.");
            return null;
        }

        try {
            const [ivHex, dataHex] = ciphertext.split(':');
            if (!ivHex || !dataHex) return null;

            const iv = new Uint8Array(ivHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
            const data = new Uint8Array(dataHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));

            const key = await this.getKey(pin);

            const decrypted = await window.crypto.subtle.decrypt(
                { name: "AES-GCM", iv },
                key,
                data
            );

            return new TextDecoder().decode(decrypted);
        } catch (e) {
            console.error("Decryption failed", e);
            return null;
        }
    }
}
