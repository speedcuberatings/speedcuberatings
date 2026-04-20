export default function Loading() {
  return (
    <section className="mx-auto max-w-[1200px] px-4 sm:px-8">
      <header className="pt-12 pb-10 border-b rule">
        <div className="skel h-[14px] w-[180px] rounded-[2px]" />
        <div className="mt-5 skel h-[96px] w-[70%] rounded-[2px]" />
        <div className="mt-5 skel h-[16px] w-[52%] rounded-[2px]" />
      </header>
      <div className="pt-10 pb-2 flex items-center justify-between">
        <div className="skel h-[14px] w-[140px] rounded-[2px]" />
        <div className="skel h-[32px] w-[160px] rounded-[2px]" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10 py-8">
        {Array.from({ length: 6 }).map((_, i) => (
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
    </section>
  );
}
