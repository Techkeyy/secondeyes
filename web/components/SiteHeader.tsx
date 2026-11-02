'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CONTRACT_ID, NETWORK } from '@/lib/config';
import { useWallet } from '@/lib/wallet';
import { StampInk } from './Stamp';
import { WalletButton } from './WalletButton';

export function SiteHeader() {
  const { accountId } = useWallet();
  const overHero = usePathname() === '/';
  return (
    <header className={overHero ? 'top over-hero' : 'top'}>
      <StampInk />
      <Link href="/" className="brand">
        <svg viewBox="0 0 32 20" width="32" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="8" cy="10" r="6.5" />
          <circle cx="24" cy="10" r="6.5" />
          <path d="M14.5 9q1.5-2 3 0" />
        </svg>
        SecondEyes
      </Link>
      <nav className="top-links">
        {NETWORK === 'testnet' && (
          <span className="net" title={`Contract ${CONTRACT_ID}`}>
            Test money only
          </span>
        )}
        {accountId && (
          <Link href="/budgets" className="quiet-link">
            Your budgets
          </Link>
        )}
        <WalletButton />
      </nav>
    </header>
  );
}
