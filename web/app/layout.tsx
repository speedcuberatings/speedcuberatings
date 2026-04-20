import type { Metadata } from 'next';
import Link from 'next/link';
import { Fraunces, Manrope, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import '@cubing/icons';
import { RandomFavicon } from '@/components/RandomFavicon';

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-display',
  weight: ['300', '400', '500', '600', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
});

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-body',
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

const jbMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'SCR — Speedcube Ratings',
    template: '%s · SCR',
  },
  description:
    'A performance-rating leaderboard for the speedcubing community, derived from official WCA results.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${manrope.variable} ${jbMono.variable}`}
    >
      <body>
        <RandomFavicon />
        <div className="relative z-10 flex min-h-dvh flex-col">
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}

function SiteHeader() {
  return (
    <header className="border-b rule">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-8 pt-8 pb-6 flex items-start justify-between gap-6">
        <Link
          href="/"
          className="group block"
          aria-label="Speedcube Ratings — Home"
        >
          <span
            className="block font-display leading-none text-[var(--color-ink)]
                       text-[2rem] sm:text-[2.75rem] tracking-[-0.03em]"
            style={{ fontVariationSettings: '"opsz" 144, "SOFT" 40, "wght" 520' }}
          >
            Speedcube
            <span className="italic text-[var(--color-accent)]"> Ratings</span>
          </span>
          <span className="eyebrow mt-2 block">
            An independent leaderboard · based on WCA results
          </span>
        </Link>
        <nav
          aria-label="Primary"
          className="hidden sm:flex items-center gap-6 pt-3 text-[13px] tracking-[0.04em] text-[var(--color-muted)]"
        >
          <Link href="/rankings/333" className="hover:text-[var(--color-ink)] transition-colors">
            Rankings
          </Link>
          <Link href="/about" className="hover:text-[var(--color-ink)] transition-colors">
            About
          </Link>
          <a
            href="https://github.com/speedcuberatings/speedcuberatings"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--color-ink)] transition-colors"
          >
            Source
          </a>
        </nav>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t rule mt-24">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-8 py-10 text-[13px] text-[var(--color-muted)]">
        <p className="max-w-[64ch] leading-relaxed">
          Rating model by{' '}
          <a
            href="https://www.youtube.com/watch?v=2lU-d6OUU3Q"
            className="ink-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            James Macdiarmid
          </a>
          . Based on competition results maintained by the World Cube
          Association, published at{' '}
          <a
            href="https://worldcubeassociation.org/results"
            className="ink-link"
            target="_blank"
            rel="noopener noreferrer"
          >
            worldcubeassociation.org/results
          </a>
          . Ratings computed independently; not affiliated with the WCA.
        </p>
      </div>
    </footer>
  );
}
