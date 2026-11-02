'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { NearConnector } from '@hot-labs/near-connect';
import { WalletPicker, type WalletOption } from '@/components/WalletPicker';
import { CONTRACT_ID, NETWORK } from './config';
import { provider } from './near';
import { callThroughNightly, nightlyExtension } from './nightly';

interface WalletState {
  accountId: string | null;
  /** False until the saved wallet session (if any) has been looked up. */
  ready: boolean;
  /** True while a wallet connected on an earlier visit is still coming back. */
  restoring: boolean;
  /** Opens the wallet picker. Resolves once signed in, rejects if the user backs out. */
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** Signs and sends one function call to the contract through the user's wallet. Returns the outcome. */
  call: (method: string, args: Record<string, unknown>, deposit: bigint, tgas: number) => Promise<unknown>;
}

const WalletContext = createContext<WalletState | null>(null);
const SESSION_WAIT_MS = 3000;
const SAVED_WALLET_KEY = 'selected-wallet'; // where near-connect remembers the chosen wallet
// Intear loads fastest, so a first-time visitor should meet it first.
const WALLET_ORDER = ['intear-wallet', 'meteor-wallet'];

const rank = (id: string) => (WALLET_ORDER.includes(id) ? WALLET_ORDER.indexOf(id) : WALLET_ORDER.length);

export function WalletProvider({ children }: { children: ReactNode }) {
  const connector = useRef<NearConnector | null>(null);
  const pending = useRef<{ resolve: () => void; reject: (e: Error) => void } | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [picker, setPicker] = useState<WalletOption[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRestoring(!!localStorage.getItem(SAVED_WALLET_KEY));
    // near-connect touches window, localStorage and IndexedDB, so it is loaded in the browser only.
    import('@hot-labs/near-connect').then(async ({ NearConnector }) => {
      if (cancelled) return;
      const c = new NearConnector({
        network: NETWORK,
        features: { signAndSendTransaction: true },
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
      restore.finally(() => !cancelled && setRestoring(false));
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
    const options = c.availableWallets
      .map((w) => ({ id: w.manifest.id, name: w.manifest.name, icon: w.manifest.icon }))
      .sort((a, b) => rank(a.id) - rank(b.id));
    setPicker(options);
    return new Promise<void>((resolve, reject) => {
      pending.current = { resolve, reject };
    });
  }, []);

  const choose = useCallback(async (walletId: string) => {
    await connector.current!.connect({ walletId });
    setPicker(null);
    pending.current?.resolve();
    pending.current = null;
  }, []);

  const dismiss = useCallback(() => {
    setPicker(null);
    pending.current?.reject(new Error('cancelled'));
    pending.current = null;
  }, []);

  const disconnect = useCallback(async () => {
    await connector.current?.disconnect();
  }, []);

  const call = useCallback(
    async (method: string, args: Record<string, unknown>, deposit: bigint, tgas: number) => {
      const wallet = await connector.current!.wallet();
      const nightly = NETWORK === 'testnet' && wallet.manifest.id === 'nightly-wallet' ? nightlyExtension() : undefined;
      if (nightly) return callThroughNightly(nightly, provider, CONTRACT_ID, method, args, deposit, tgas);
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

  return (
    <WalletContext.Provider value={{ accountId, ready, restoring, connect, disconnect, call }}>
      {children}
      {picker && <WalletPicker options={picker} onChoose={choose} onClose={dismiss} />}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used inside WalletProvider');
  return ctx;
}
