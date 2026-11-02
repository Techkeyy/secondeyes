import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { WalletProvider } from '@/lib/wallet';
import { WalletButton } from '@/components/WalletButton';
import { CONTRACT_ID, NETWORK } from '@/lib/config';
import './globals.css';

export const metadata: Metadata = {
  title: 'SecondEyes',
  description: 'A second pair of eyes on every payment your AI agent makes.',
};

// The banner reads the server's mode on every request, never a build-time copy.
export const dynamic = 'force-dynamic';

export default function RootLayout({ children }: { children: ReactNode }) {
  const testJudge = process.env.JUDGE_MODE === 'synthetic';
  return (
    <html lang="en">
      <body>
        {testJudge && (
          <div className="banner" role="status">
            TEST JUDGE, not NEAR AI. Verdicts on this site come from a development key, not a model.
          </div>
        )}
        <WalletProvider>
          <header className="top">
            <Link href="/" className="brand">
              SecondEyes
            </Link>
            <div className="top-right">
              <span className="chip" title={`Contract ${CONTRACT_ID}`}>
                {NETWORK}
              </span>
              <WalletButton />
            </div>
          </header>
          <main>{children}</main>
        </WalletProvider>
      </body>
    </html>
  );
}
