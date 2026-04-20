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
          hourly from the public WCA export.
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
        <p>
          For each (competitor, event) pair, we compute one rating on{' '}
          <strong>singles</strong> and one on <strong>averages</strong>. The
          metric toggle at the top of the rankings page switches between them;
          for averaged events (3×3, 4×4, etc.) the leaderboard defaults to
          averages, and for single-only events (BLD, FMC, multi) it defaults
          to singles.
        </p>
        <ol className="list-decimal pl-5 space-y-3 marker:text-[var(--color-accent)]">
          <li>
            Take every round result from the last 24 months. At least 3 are
            required to appear.
          </li>
          <li>
            Normalise each round into a Kinch-style score:{' '}
            <code className="font-mono text-[15px]">
              100 × (WR / your_result)
            </code>
            . WR here is the all-time best in the <em>same</em> metric
            (best-ever average if we&rsquo;re scoring averages, best-ever
            single if we&rsquo;re scoring singles). The record holder scores
            100; everyone else scales below.
          </li>
          <li>
            Apply a small context bonus (up to <strong>+2%</strong>) for the
            round: was it a final, did it win a medal, was it a regional or
            world record, was it set at a championship? The factors compound
            but the total is capped; most rounds get no bonus at all.
          </li>
          <li>
            Weight each round by{' '}
            <code className="font-mono text-[15px]">0.99 ^ days_since</code>.
            Recent solves count for more — a result from 90 days ago carries
            about 40% of today&rsquo;s weight.
          </li>
          <li>
            Take the weighted mean. This is the raw rating.
          </li>
          <li>
            If a competitor hasn&rsquo;t competed in more than 90 days, the
            rating starts to decay by{' '}
            <code className="font-mono text-[15px]">0.995 ^ (days − 90)</code>
            . Competitors with no results in the 24-month window drop off the
            list.
          </li>
          <li>
            Rank by rating within each event and metric using standard sports
            tied-rank semantics (two cubers on the same rating share a rank;
            the next slot skips ahead — 5, 5, 7).
          </li>
        </ol>
        <p>
          The bonus weights in step 3 are notably smaller than the
          &ldquo;15 to 17%&rdquo; the video mentions. We calibrated them to
          reproduce the reference numbers James showed on screen — his actual
          implementation runs much closer to +2%.
        </p>

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
          An hourly job polls the WCA results export. When a new export is
          published, we re-ingest the underlying data and rebuild every
          rating. Even on hours when nothing has changed on the WCA side we
          still recompute, so the inactivity decay stays current to the day.
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
          17 currently-active WCA events are rated. Discontinued events exist
          in the WCA record but are not scored. Ratings are per-event — there
          is no cross-event aggregate because skill in 3×3 looks nothing like
          skill in multi-blind, and averaging across events would hide more
          than it reveals. The region filter narrows the leaderboard to a
          continent or country; global ranks are preserved when filtered, so
          the top European 3×3 cuber can still be #3 in the world.
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
          not affiliated with or endorsed by the WCA. Implementation is{' '}
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
