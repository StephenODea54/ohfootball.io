/** A row of numbers about the state, such as the number of programs. */
export function RegionStats({ stats }: { stats: { value: string; label: string }[] }) {
  return (
    <dl className="mt-12 grid grid-cols-2 border-y sm:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="flex flex-col-reverse px-6 py-6 text-center sm:[&:not(:first-child)]:border-l"
        >
          <dt className="mt-1 text-muted-fg text-sm/5">{stat.label}</dt>
          <dd className="font-semibold text-3xl/9 text-fg">{stat.value}</dd>
        </div>
      ))}
    </dl>
  )
}
