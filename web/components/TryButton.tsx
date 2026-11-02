'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/lib/wallet';

/** One click from anywhere: connect if needed, then straight to the product. */
export function TryButton({ label = 'Try it free' }: { label?: string }) {
  const { accountId, connect } = useWallet();
  const router = useRouter();
  const [error, setError] = useState('');

  async function go() {
    setError('');
    if (accountId) return router.push('/budgets');
    try {
      await connect();
      router.push('/budgets');
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      if (text !== 'cancelled') setError(text);
    }
  }

  return (
    <span className="try">
      <button className="try-button" onClick={go}>
        {label}
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 8h10M9 4l4 4-4 4" />
        </svg>
      </button>
      {error && (
        <span className="try-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
