'use client';

import { useState } from 'react';
import { useWallet } from '@/lib/wallet';

export function WalletButton() {
  const { accountId, ready, restoring, connect, disconnect } = useWallet();
  const [error, setError] = useState('');

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
  if (restoring || !ready) return <span className="net">{restoring ? 'Finding your wallet' : 'Loading wallets'}</span>;
  return (
    <span className="wallet">
      <button
        className="on-desk small"
        onClick={() => {
          setError('');
          connect().catch((e) => e.message !== 'cancelled' && setError(e.message));
        }}
      >
        Connect
      </button>
      {error && <span className="error-on-desk">{error}</span>}
    </span>
  );
}
