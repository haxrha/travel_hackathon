import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Outfit, IBM_Plex_Sans } from "next/font/google";
import { isDemoMode } from "@/lib/demo";
import "./globals.css";

const display = Outfit({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const sans = IBM_Plex_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "WAYPORT — Autonomous Travel Operating System",
  description:
    "WAYPORT is the autonomous operating system for travel. Tell it where you want to go — it plans, books, optimizes, monitors, and manages the entire trip for you.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const content = isDemoMode() ? (
    children
  ) : (
    <ClerkProvider
      appearance={{
        variables: {
          colorBackground: "#0a0f1c",
          colorPrimary: "#ffffff",
        },
        elements: {
          card: "wp-glass",
          formButtonPrimary: "wp-cta",
        },
      }}
    >
      {children}
    </ClerkProvider>
  );

  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full" suppressHydrationWarning>
        {content}
      </body>
    </html>
  );
}
