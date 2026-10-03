/** The one number a page is about, larger than the grid of counters below it. */
export function LeadStat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-md border border-line bg-bg-elev px-4 py-4">
      <p className="text-[11px] font-semibold tracking-[0.16em] text-text-3 uppercase">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold break-words text-gold sm:text-3xl">
        {value}
      </p>
      {note ? <p className="mt-1 text-xs text-text-2">{note}</p> : null}
    </div>
  )
}
