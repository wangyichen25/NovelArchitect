
import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-serif",
});

export const metadata: Metadata = {
  title: "NovelArchitect",
  description: "A Local-First, AI-Augmented IDE for Fiction",
};

import { RealtimeProvider } from "@/components/providers/RealtimeProvider";
import { ThemeProvider } from "@/components/theme-provider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      {/* Defaulting to dark mode for premium feel as per instructions */}
      <body
        className={`${inter.variable} ${playfair.variable} antialiased min-h-screen bg-background text-foreground font-sans selection:bg-primary/20`}
      >
        <RealtimeProvider>
          <ThemeProvider>
            {children}
          </ThemeProvider>
        </RealtimeProvider>
      </body>
    </html>
  );
}
