import Link from 'next/link';

export const metadata = {
  title: 'About the ratings',
  description:
    'How Speedcube Ratings works: the rating model, data sources, and scope.',
};

export default function AboutPage() {
  return (
    <article className="mx-auto max-w-[72ch] px-4 sm:px-8 py-16">
      <h1
        className="font-display leading-[0.98] text-[var(--color-ink)]
                   text-[clamp(2.5rem,6vw,4.25rem)]"
        style={{
          fontVariationSettings: '"opsz" 144, "SOFT" 50, "wght" 420',
          letterSpacing: '-0.03em',
        }}
      >
        A different way to read the{' '}
        <span className="italic text-[var(--color-accent)]">leaderboard</span>.
      </h1>

      <div
        className="mt-10 space-y-6 text-[17px] leading-[1.7] text-[var(--color-ink-soft)]
                   font-body [&_strong]:text-[var(--color-ink)] [&_strong]:font-semibold"
      >
        <p>
          The rating model on this site was designed by{' '}
          <strong>James Macdiarmid</strong> and laid out in his video{' '}
          <a
            href="https://www.youtube.com/watch?v=2lU-d6OUU3Q"
            className="ink-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            <em>Our ranking system is broken. Let&rsquo;s fix it!</em>
          </a>
          . This project is an implementation of the spec he described there.
        </p>
        <p>
          The official WCA rankings capture something important: a single best
          performance. Records live there. But a single solve is a narrow lens —
          it says little about who is performing well <em>right now</em>. This
          site is an attempt at that second view: a{' '}
          <strong>performance rating</strong> per competitor per event, updated
          hourly from the public WCA export. The inputs are real. The
          interpretation follows James&rsquo;s spec.
        </p>

        <h2
          className="pt-6 font-display text-[1.75rem] text-[var(--color-ink)]"
          style={{
            fontVariationSettings: '"opsz" 72, "SOFT" 30, "wght" 500',
            letterSpacing: '-0.015em',
          }}
        >
          How a rating is computed
        </h2>
        <ol className="list-decimal pl-5 space-y-3 marker:text-[var(--color-accent)]">
          <li>Every competition result from the last 24 months is considered.</li>
          <li>
            Each result is normalised into a Kinch-style score:{' '}
            <code className="font-mono text-[15px]">
              100 × (WR / your_result)
            </code>
            . The world-record holder scores 100.
          </li>
          <li>
            A bonus of up to <strong>+15%</strong> is applied for context: was it
            a final, a medal, a record, a championship? The spec's maximum is
            used rarely — only for results like a world-record win in a World
            Championship final.
          </li>
          <li>
            Results are weighted by{' '}
            <code className="font-mono text-[15px]">0.99 ^ days_since</code>.
            Recent solves count for more.
          </li>
          <li>
            If a competitor hasn't competed in more than 90 days, their rating
            decays by{' '}
            <code className="font-mono text-[15px]">0.995 ^ (days − 90)</code>.
            They drop off the list after 24 months of inactivity.
          </li>
          <li>A minimum of 3 results per event is required to appear.</li>
        </ol>

        <h2
          className="pt-6 font-display text-[1.75rem] text-[var(--color-ink)]"
          style={{
            fontVariationSettings: '"opsz" 72, "SOFT" 30, "wght" 500',
            letterSpacing: '-0.015em',
          }}
        >
          Data freshness
        </h2>
        <p>
          We poll the WCA results export hourly. When a new export is published,
          we re-ingest the data and recompute every rating. The inactivity decay
          refreshes on every tick, so ratings are always current to the day.
        </p>

        <h2
          className="pt-6 font-display text-[1.75rem] text-[var(--color-ink)]"
          style={{
            fontVariationSettings: '"opsz" 72, "SOFT" 30, "wght" 500',
            letterSpacing: '-0.015em',
          }}
        >
          Scope
        </h2>
        <p>
          17 currently-active WCA events are rated. Discontinued events are
          listed but not scored. Ratings are per event; there is no cross-event
          aggregate — skill looks different in 3×3 than in multi-blind, and we
          don't pretend otherwise.
        </p>

        <h2
          className="pt-6 font-display text-[1.75rem] text-[var(--color-ink)]"
          style={{
            fontVariationSettings: '"opsz" 72, "SOFT" 30, "wght" 500',
            letterSpacing: '-0.015em',
          }}
        >
          Credits and data
        </h2>
        <p>
          The rating model is by{' '}
          <a
            href="https://www.youtube.com/watch?v=2lU-d6OUU3Q"
            className="ink-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            James Macdiarmid
          </a>
          . The competition data is maintained by the{' '}
          <a
            href="https://worldcubeassociation.org/results"
            className="ink-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            World Cube Association
          </a>{' '}
          and used under the terms of its public results export. This site is
          not affiliated with or endorsed by the WCA. The implementation is{' '}
          <a
            href="https://github.com/speedcuberatings/speedcuberatings"
            className="ink-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            open source
          </a>
          .
        </p>
      </div>

      <div className="pt-12">
        <Link
          href="/rankings/333"
          className="ink-link eyebrow !tracking-[0.18em]"
        >
          ← back to rankings
        </Link>
      </div>
    </article>
  );
}
