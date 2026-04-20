/**
 * Skeleton rows that mimic the typeset LeaderboardTable, for use in
 * route-level loading.tsx and per-section <Suspense> fallbacks on the
 * rankings page.
 */
export function LeaderboardSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <ol aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <li
          key={i}
          className="border-b rule px-4 sm:px-8 py-5 md:py-6
                     grid grid-cols-[2.5rem_1fr_5rem] md:grid-cols-[4.5rem_1fr_7.5rem]
                     gap-x-3 md:gap-x-8 items-center"
        >
          <div className="skel h-[40px] w-[40px] md:h-[48px] md:w-[48px] rounded-[2px]" />
          <div className="flex flex-col gap-2 min-w-0">
            <div className="skel h-[22px] w-[52%] rounded-[2px]" />
            <div className="skel h-[12px] w-[38%] rounded-[2px]" />
            <div className="skel h-[11px] w-[68%] rounded-[2px]" />
          </div>
          <div className="skel h-[28px] w-full rounded-[2px] justify-self-end" />
        </li>
      ))}
    </ol>
  );
}

/** Lighter version for the profile ratings grid. */
export function ProfileGridSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div
      aria-hidden="true"
      className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10 py-8"
    >
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="border-t rule pt-6">
          <div className="flex justify-between mb-4">
            <div className="skel h-[14px] w-[140px] rounded-[2px]" />
            <div className="skel h-[14px] w-[80px] rounded-[2px]" />
          </div>
          <div className="flex justify-between items-center mb-5">
            <div className="skel h-[36px] w-[64px] rounded-[2px]" />
            <div className="skel h-[36px] w-[96px] rounded-[2px]" />
          </div>
          <div className="flex justify-between items-end gap-4">
            <div className="skel h-[12px] w-[56%] rounded-[2px]" />
            <div className="skel h-[40px] w-[160px] rounded-[2px]" />
          </div>
        </div>
      ))}
    </div>
  );
}
