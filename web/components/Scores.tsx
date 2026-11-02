'use client';

import { CountUp, useInView } from './Motion';

const ROWS = [
  { title: 'Scam and bad payments that got paid', note: 'Lower is better', bars: [{ name: 'SecondEyes', n: 0, of: 90, lead: true }, { name: 'Limits alone', n: 69, of: 90 }] },
  { title: 'Honest payments that got paid', note: 'Higher is better', bars: [{ name: 'SecondEyes', n: 51, of: 51, lead: true }, { name: 'Limits alone', n: 51, of: 51 }] },
];

export function Scores() {
  const [ref, seen] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className={seen ? 'scores-v seen' : 'scores-v'}>
      {ROWS.map((row) => (
        <div key={row.title} className="score-row">
          <p className="score-title">
            {row.title} <span>{row.note}</span>
          </p>
          {row.bars.map((b) => (
            <div key={b.name} className={b.lead ? 'score-bar ours' : 'score-bar'}>
              <span className="score-name">{b.name}</span>
              <span className="score-track">
                <span className="score-fill" style={{ transform: `scaleX(${seen ? b.n / b.of : 0})` }} />
              </span>
              <span className="score-num">
                <CountUp to={b.n} /> of {b.of}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
