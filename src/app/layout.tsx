
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
  title: "PaperArchitect",
  description: "A Local-First, AI-Augmented IDE for Fiction",
};

import { RealtimeProvider } from "@/components/providers/RealtimeProvider";
import { ThemeProvider } from "@/components/theme-provider";
import { TaskQueueProvider } from "@/components/providers/TaskQueueProvider";
import { TaskQueueWidget } from "@/components/task-queue/TaskQueueWidget";

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
          <TaskQueueProvider>
            <ThemeProvider>
              {children}
              <TaskQueueWidget />
            </ThemeProvider>
          </TaskQueueProvider>
        </RealtimeProvider>
      </body>
    </html>
  );
}
