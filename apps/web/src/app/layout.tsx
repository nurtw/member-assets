import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

/**
 * Font variables are named generically rather than after the typeface, so that
 * replacing Geist is a change here alone and not a search across every consumer.
 * DESIGN.md §6 — components consume semantic tokens, never concrete values.
 */
const sans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const mono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "NURTW Membership and Vehicle Verification",
    template: "%s · NURTW",
  },
  description:
    "Membership, vehicle declaration, and verification services of the National Union of Road Transport Workers.",
  /**
   * The System is not a public directory (PRD §2.2). Indexing is refused at the
   * document level as well as by robots.txt, so that a verification result page
   * reached by QR scan cannot accumulate in a search index and become the
   * browsable listing the PRD forbids.
   */
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
