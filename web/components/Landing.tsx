import { CONTRACT_ID, EXPLORER } from '@/lib/config';
import { Hero } from './Hero';
import { Scores } from './Scores';
import { Showcase } from './Showcase';
import { Story } from './Story';
import { Reveal, Torn } from './Motion';
import { TryButton } from './TryButton';

const TAPE = ['Scam invoice: refused', 'Real bill: paid', 'Same bill twice: refused', 'Your limits: enforced', 'Your money: yours'];

const QUESTIONS = [
  {
    q: 'Does it work with my own agent?',
    a: 'Yes. Apps that support MCP, such as Claude Desktop and Cursor, can plug it in as a tool, and anything else can run it as a command. Your budget page gives you the setup to copy. Your agent’s key stays on your machine.',
  },
  {
    q: 'Who holds the money?',
    a: 'A contract on the NEAR blockchain, not your agent and not us. Only you can close a budget, and closing sends back whatever is left.',
  },
  {
    q: 'What stops my agent from just saying yes?',
    a: 'The contract checks NEAR AI’s signature on every answer, so a forged, altered or reused yes is rejected. Your limits (per payment, in total, how many, until when) are checked first, whatever anyone says.',
  },
  {
    q: 'What can my agent actually do with its key?',
    a: 'Only ask to pay from that one budget. It cannot withdraw, change your limits or touch your wallet.',
  },
  {
    q: 'What can it not catch?',
    a: 'It cannot tell whether what your agent says is true. Under a broad instruction like “pay our suppliers”, a dishonest agent can still spend inside its budget, so name the payee and the amount. Your agent can also try several wordings and submit only the one that passes. It cannot see today’s date either. When unsure it refuses, so a real payment worded just like an earlier one may be refused. Say how many you expect.',
  },
];

export function Landing() {
  return (
    <>
      <Hero />

      <div className="tape" aria-hidden="true">
        <div className="tape-run">
          {[0, 1, 2, 3].map((n) => (
            <span key={n}>
              {TAPE.map((t) => (
                <span key={t} className="tape-item">
                  {t}
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <section className="band-cobalt">
        <div className="band-inner proof">
          <Reveal className="proof-copy">
            <h2>
              This <em>really</em> happened
            </h2>
            <p>A real agent, a real scam invoice and real test money. This is the actual record, read from the blockchain as you look at it. Click through the three attempts.</p>
          </Reveal>
          <Reveal delay={120}>
            <Showcase />
          </Reveal>
        </div>
      </section>

      <section id="how" className="band-paper">
        <Torn className="torn-top paper-edge" />
        <div className="band-inner">
          <Reveal>
            <h2>
              How it works, <em>without the homework</em>
            </h2>
          </Reveal>
          <Story />
        </div>
      </section>

      <section className="band-ink">
        <div className="band-inner score-layout">
          <Reveal>
            <h2>
              We tried to <em>fool it</em>
            </h2>
            <p>47 payments kept aside while we tuned it, three runs each, on the real judge, next to spending limits alone.</p>
            <p className="band-small">We wrote these cases ourselves and nobody adapted them to beat the judge. Treat this as a good early sign, not a guarantee.</p>
          </Reveal>
          <Scores />
        </div>
      </section>

      <section className="band-paper">
        <Torn className="torn-top paper-edge" />
        <div className="band-inner faq">
          <Reveal>
            <h2>
              The fine print, <em>if you want it</em>
            </h2>
            <p className="faq-lead">You do not need any of this to use it.</p>
          </Reveal>
          <div className="faq-list">
            {QUESTIONS.map(({ q, a }) => (
              <details key={q}>
                <summary>
                  {q}
                  <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                    <path d="M4 10h12" />
                    <path className="faq-plus" d="M10 4v12" />
                  </svg>
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="band-yellow closing">
        <Torn className="torn-top yellow-edge" />
        <div className="band-inner">
          <Reveal>
            <h2>Watch a scam get stopped</h2>
            <p>Two minutes, one wallet, free test money. You take back what is left at the end.</p>
            <TryButton label="Try it free" />
          </Reveal>
        </div>
      </section>

      <footer className="foot">
        <span>SecondEyes runs on NEAR testnet. Nothing here uses real money.</span>
        <a href={`${EXPLORER}/address/${CONTRACT_ID}`} target="_blank" rel="noreferrer">
          See the contract
        </a>
      </footer>
    </>
  );
}
