'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { NearConnector } from '@hot-labs/near-connect';
import { CONTRACT_ID, NETWORK } from './config';

interface WalletState {
  accountId: string | null;
  /** False until the saved wallet session (if any) has been looked up. */
  ready: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** Signs and sends one function call to the contract through the user's wallet. Returns the outcome. */
  call: (method: string, args: Record<string, unknown>, deposit: bigint, tgas: number) => Promise<unknown>;
}

const WalletContext = createContext<WalletState | null>(null);
const SESSION_WAIT_MS = 3000;

export function WalletProvider({ children }: { children: ReactNode }) {
  const connector = useRef<NearConnector | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // near-connect touches window, localStorage and IndexedDB, so it is loaded in the browser only.
    import('@hot-labs/near-connect').then(async ({ NearConnector }) => {
      if (cancelled) return;
      const c = new NearConnector({
        network: NETWORK,
        features: { signAndSendTransaction: true },
        // On testnet, Nightly's extension never finishes sending after approval and nothing reaches the chain.
        excludedWallets: NETWORK === 'testnet' ? ['nightly-wallet'] : [],
      });
      connector.current = c;
      c.on('wallet:signIn', (t) => setAccountId(t.accounts[0]?.accountId ?? null));
      c.on('wallet:signOut', () => setAccountId(null));
      // Looking up a saved session downloads that wallet's script, which can take over a minute.
      // Keep the connect buttons usable meanwhile; a session found later still signs the user in.
      const restore = c.getConnectedWallet().then(
        ({ accounts }) => {
          if (!cancelled) setAccountId(accounts[0].accountId);
        },
        () => {}, // no saved session
      );
      await Promise.race([restore, new Promise((r) => setTimeout(r, SESSION_WAIT_MS))]);
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
      connector.current?.removeAllListeners();
    };
  }, []);

  const connect = useCallback(async () => {
    const c = connector.current;
    if (!c) throw new Error('The wallet connector is still loading. Try again in a moment.');
    await c.whenManifestLoaded;
    await c.connect();
  }, []);

  const disconnect = useCallback(async () => {
    await connector.current?.disconnect();
  }, []);

  const call = useCallback(
    async (method: string, args: Record<string, unknown>, deposit: bigint, tgas: number) => {
      const wallet = await connector.current!.wallet();
      return wallet.signAndSendTransaction({
        network: NETWORK,
        receiverId: CONTRACT_ID,
        actions: [
          {
            type: 'FunctionCall',
            params: { methodName: method, args, gas: (BigInt(tgas) * 10n ** 12n).toString(), deposit: deposit.toString() },
          },
        ],
      });
    },
    [],
  );

  return <WalletContext.Provider value={{ accountId, ready, connect, disconnect, call }}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used inside WalletProvider');
  return ctx;
}
