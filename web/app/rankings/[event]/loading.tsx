import { EventPicker } from '@/components/EventPicker';
import { LeaderboardSkeleton } from '@/components/Skeletons';
import { getEvents } from '@/lib/queries';

export const revalidate = 300;

export default async function Loading() {
  const events = await getEvents();

  return (
    <>
      <EventPicker items={events} />
      <section className="mx-auto max-w-[1200px] px-4 sm:px-8">
        <header className="pt-12 pb-8">
          <div className="skel h-[80px] w-[62%] rounded-[2px]" />
          <div className="mt-5 skel h-[16px] w-[48%] rounded-[2px]" />
        </header>
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5 pb-6 border-b rule">
          <div className="flex gap-3">
            <div className="skel h-[36px] w-[220px] rounded-[2px]" />
          </div>
          <div className="flex items-center gap-4">
            <div className="skel h-[34px] w-[160px] rounded-[2px]" />
            <div className="skel h-[12px] w-[180px] rounded-[2px]" />
          </div>
        </div>
        <LeaderboardSkeleton rows={12} />
      </section>
    </>
  );
}
