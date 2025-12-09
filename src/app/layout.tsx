
import type { Metadata } from "next";
// For now relying on standard sans/serif logic in Tailwind config or globals, 
// but keeping the imports if I decide to use them later.
// Actually, let's remove the Geist font for now and use standard system fonts as configured in globals.css 
// or if I want to use google fonts I can add them. 
// For "Premium" feel, I'll stick to the cleanest setup.

import "./globals.css";

export const metadata: Metadata = {
  title: "NovelArchitect",
  description: "A Local-First, AI-Augmented IDE for Fiction",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      {/* Defaulting to dark mode for premium feel as per instructions */}
      <body
        className="antialiased min-h-screen bg-background text-foreground"
      >
        {children}
      </body>
    </html>
  );
}
