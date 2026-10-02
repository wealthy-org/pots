export default function StatsPage() {
  return (
    <section aria-labelledby="stats-title">
      <h1 id="stats-title" className="text-2xl font-bold">
        Stats
      </h1>
      <p className="mt-2 max-w-prose text-sm text-text-2">
        Protocol statistics appear here from indexed events once the indexer is live.
      </p>
    </section>
  )
}
