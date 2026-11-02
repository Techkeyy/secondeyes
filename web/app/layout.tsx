import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Sans_Condensed, Newsreader } from 'next/font/google';
import './globals.css';
import './print.css';

const sans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-sans' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono' });
const stamp = IBM_Plex_Sans_Condensed({ subsets: ['latin'], weight: '700', variable: '--font-stamp' });
const serif = Newsreader({ subsets: ['latin'], variable: '--font-serif' });

export const metadata: Metadata = {
  title: 'SecondEyes',
  description: 'Your AI agent pays the bills. SecondEyes checks every payment against what you wrote before any money moves.',
};

// Only what every page shares. The site header lives in (site)/layout.tsx: the invoice pages stand for
// someone else's website, and the demo agent reads every word on them.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${stamp.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
