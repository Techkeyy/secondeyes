import type { ReactNode } from 'react';
import { WalletProvider } from '@/lib/wallet';
import { BackToTop } from '@/components/Motion';
import { SiteHeader } from '@/components/SiteHeader';

// The banner reads the server's mode on every request, never a build-time copy.
export const dynamic = 'force-dynamic';

export default function SiteLayout({ children }: { children: ReactNode }) {
  const testJudge = process.env.JUDGE_MODE === 'synthetic';
  return (
    <>
      {testJudge && (
        <div className="banner" role="status">
          Test judge, not NEAR AI. Verdicts on this site come from a development key, not a model.
        </div>
      )}
      <WalletProvider>
        <SiteHeader />
        <main>{children}</main>
        <BackToTop />
      </WalletProvider>
    </>
  );
}
