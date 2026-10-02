import { describeDataSource, type DataSourceInfo } from '@/lib/data-source'

export function DataSource({ source }: { source: DataSourceInfo }) {
  const { label, note } = describeDataSource(source)
  return (
    <div className="flex flex-col gap-0.5">
      <p className="font-mono text-xs text-text-2">{label}</p>
      {note ? <p className="text-xs text-text-2">{note}</p> : null}
    </div>
  )
}
