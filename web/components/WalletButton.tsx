'use client';

import { useState } from 'react';
import { useWallet } from '@/lib/wallet';

export function WalletButton() {
  const { accountId, ready, connect, disconnect } = useWallet();
  const [error, setError] = useState('');

  if (!ready) return <span className="muted">Loading wallet</span>;
  if (accountId) {
    return (
      <span className="wallet">
        <span className="mono clip" title={accountId}>
          {accountId}
        </span>
        <button className="link" onClick={() => disconnect()}>
          Disconnect
        </button>
      </span>
    );
  }
  return (
    <span className="wallet">
      <button className="primary small" onClick={() => connect().catch((e) => setError(e.message))}>
        Connect wallet
      </button>
      {error && <span className="error">{error}</span>}
    </span>
  );
}
