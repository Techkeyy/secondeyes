'use client';

import { useEffect, useRef, useState } from 'react';

export interface WalletOption {
  id: string;
  name: string;
  icon: string;
}

/** Our own wallet list, so the fastest wallet comes first and the wait after choosing is never silent. */
export function WalletPicker({ options, onChoose, onClose }: { options: WalletOption[]; onChoose: (id: string) => Promise<void>; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [opening, setOpening] = useState<WalletOption | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function choose(w: WalletOption) {
    setError('');
    setOpening(w);
    try {
      await onChoose(w.id);
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      setError(/reject|cancel|denied|closed/i.test(text) ? `${w.name} was closed before connecting. Nothing changed.` : `${w.name} could not connect: ${text}`);
      setOpening(null);
    }
  }

  return (
    <dialog ref={dialog} className="picker" onCancel={onClose} onClick={(e) => e.target === dialog.current && onClose()}>
      <div className="picker-body">
        <div className="picker-head">
          <h2>{opening ? `Opening ${opening.name}` : 'Pick a wallet'}</h2>
          <button className="picker-close" aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M3 3l10 10M13 3L3 13" />
            </svg>
          </button>
        </div>
        {opening ? (
          <div className="picker-wait" role="status">
            <span className="spinner" aria-hidden="true" />
            <p>Say yes in {opening.name}. It only shares your account name, and no money moves. A wallet can take a little while to load the first time.</p>
          </div>
        ) : (
          <>
            <p className="picker-lead">It holds your test money and asks before anything leaves it.</p>
            <ul className="picker-list">
              {options.map((w, i) => (
                <li key={w.id}>
                  <button onClick={() => choose(w)}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={w.icon} alt="" width="32" height="32" />
                    <span className="picker-name">{w.name}</span>
                    {i === 0 && <span className="picker-tag">Fastest</span>}
                    <svg className="picker-arrow" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 8h10M9 4l4 4-4 4" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
            {options.length === 0 && <p className="picker-lead">The wallet list could not be loaded. Check your connection and try again.</p>}
          </>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {!opening && (
          <p className="hint picker-foot">
            No wallet yet?{' '}
            <a href="https://wallet.intear.tech/" target="_blank" rel="noreferrer">
              Make one with Intear
            </a>
            . It takes a minute.
          </p>
        )}
      </div>
    </dialog>
  );
}
