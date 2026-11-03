'use client';

import { useEffect, useState } from 'react';
import { CONTRACT_ID, RPC_URL } from '@/lib/config';
import { explainAttempt } from '@/lib/explain';
import type { Mandate } from '@/lib/types';
import { Stamp } from './Stamp';

const WATCH_MS = 4000;
const HIDDEN_KEY = '(hidden, included when you copy)';
const PROMPT = 'Check my SecondEyes budget, then make the payment it describes.';

function CopyButton({ label, text }: { label: string; text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="small"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1800);
      }}
    >
      {done ? 'Copied' : label}
    </button>
  );
}

/** Hands the budget to the user's own agent, then watches the chain so its attempts show up here by themselves. */
export function ConnectAgent({ mandate, secret, onWatch }: { mandate: Mandate; secret: string; onWatch: () => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'link' | 'app' | 'cli'>('link');
  const [reveal, setReveal] = useState(false);
  const [countAtOpen, setCountAtOpen] = useState(0);
  const [site, setSite] = useState('');

  useEffect(() => setSite(location.origin), []);

  useEffect(() => {
    if (!open) return;
    const timer = setInterval(onWatch, WATCH_MS);
    return () => clearInterval(timer);
  }, [open, onWatch]);

  const tarball = `${site}/secondeyes-agent.tgz`;
  const settings = (key: string) => ({
    AGENT_KEY: key,
    SECONDEYES_BUDGET: String(mandate.id),
    SECONDEYES_SITE: site,
    SECONDEYES_CONTRACT: CONTRACT_ID,
    SECONDEYES_RPC: RPC_URL,
  });
  const appSetup = (key: string) => JSON.stringify({ mcpServers: { secondeyes: { command: 'npx', args: ['-y', tarball], env: settings(key) } } }, null, 2);
  const cliSetup = (key: string) =>
    `${Object.entries(settings(key))
      .map(([k, v]) => `export ${k}="${v}"`)
      .join('\n')}\n\nnpx -y ${tarball} budget\nnpx -y ${tarball} pay --payee acme.testnet --amount 0.1 --purpose "Invoice 12"`;
  const linkSetup = (key: string) => `${site}/mcp/${mandate.id}-${key.replace('ed25519:', '')}`;
  const setup = mode === 'link' ? linkSetup : mode === 'app' ? appSetup : cliSetup;
  const latest = mandate.attempts.length > countAtOpen ? mandate.attempts[mandate.attempts.length - 1] : null;

  return (
    <section className="connect" aria-labelledby="connect-title">
      <div className="connect-head">
        <div>
          <h2 id="connect-title">Connect your own agent</h2>
          <p className="section-lead">Give it this budget to spend from. Every payment it makes gets the same check, and shows up here.</p>
        </div>
        <button
          className="on-desk"
          aria-expanded={open}
          onClick={() => {
            setCountAtOpen(mandate.attempts.length);
            setOpen(!open);
          }}
        >
          {open ? 'Hide' : 'Set it up'}
        </button>
      </div>

      {open && (
        <div className="sheet connect-sheet">
          <div className="connect-tabs" role="group" aria-label="Kind of agent">
            <button className={mode === 'link' ? 'on' : ''} aria-pressed={mode === 'link'} onClick={() => setMode('link')}>
              One link
            </button>
            <button className={mode === 'app' ? 'on' : ''} aria-pressed={mode === 'app'} onClick={() => setMode('app')}>
              Config file
            </button>
            <button className={mode === 'cli' ? 'on' : ''} aria-pressed={mode === 'cli'} onClick={() => setMode('cli')}>
              Your own code
            </button>
          </div>

          <ol className="connect-steps">
            <li>
              <h3>{mode === 'link' ? 'Copy this link' : mode === 'app' ? 'Copy this setup' : 'Run it from your agent'}</h3>
              <p>
                {mode === 'link'
                  ? 'The easiest way. Nothing to install. It works with agent apps that let you add a tool by URL, usually called a custom connector or remote MCP server.'
                  : mode === 'app'
                  ? 'It works with apps that support MCP, the standard way to plug tools into an agent, such as Claude Desktop and Cursor. You need Node.js 20 or newer.'
                  : 'Any program that can run a command can use it. It answers in JSON and exits with 0 only when the money was sent. You need Node.js 20 or newer.'}
              </p>
              <pre className="connect-code" tabIndex={0}>
                {setup(reveal ? secret : HIDDEN_KEY)}
              </pre>
              <div className="connect-actions">
                <CopyButton label={mode === 'link' ? 'Copy link' : 'Copy setup'} text={setup(secret)} />
                <button className="small" onClick={() => setReveal(!reveal)}>
                  {reveal ? 'Hide key' : 'Show key'}
                </button>
              </div>
              <p className="hint">
                {mode === 'link'
                  ? 'Treat this link like a password: anyone who has it can ask to pay from this budget. It holds your agent’s key, and our server uses that to sign each request without storing it. Every payment still has to pass your limits and the check, nobody can withdraw with it, and closing the budget kills it.'
                  : 'This includes your agent’s key, so keep it private. The key stays on your machine and only signs there. It can only ask to pay from this budget, and closing the budget deletes it.'}
              </p>
            </li>
            {mode === 'link' && (
              <li>
                <h3>Add it to your agent app</h3>
                <p>Find the app’s connector or MCP settings, add a new one, name it SecondEyes and paste the link.</p>
              </li>
            )}
            {mode === 'app' && (
              <li>
                <h3>Paste it into your agent app</h3>
                  <p>Put it in the app’s MCP settings file, then restart the app. In Claude Desktop that is Settings, Developer, Edit Config. In Cursor it is mcp.json.</p>
                  <p className="hint">On Windows, if the tool does not start, change the command to “cmd” and put “/c” and “npx” first in the args.</p>
              </li>
            )}
            {mode !== 'cli' && (
              <li>
                  <h3>Ask it to pay</h3>
                  <pre className="connect-code connect-prompt">{PROMPT}</pre>
                  <div className="connect-actions">
                    <CopyButton label="Copy message" text={PROMPT} />
                  </div>
              </li>
            )}
            <li aria-live="polite">
              <h3>{latest ? 'Latest attempt on this budget' : 'Watching for your agent'}</h3>
              {latest ? (
                <div className="connect-result" key={latest.nonce}>
                  <Stamp outcome={latest.outcome} />
                  <p>{explainAttempt(latest)}</p>
                </div>
              ) : (
                <p className="connect-waiting">
                  <span className="spinner" aria-hidden="true" />
                  Its first payment will appear here by itself. No need to reload.
                </p>
              )}
            </li>
          </ol>
        </div>
      )}
    </section>
  );
}
