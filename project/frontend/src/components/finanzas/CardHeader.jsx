export default function CardHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between mb-3 gap-3">
      <div className="min-w-0">
        <div className="label">{subtitle}</div>
        <div
          className="serif text-[15px] font-semibold mt-0.5 italic truncate"
          style={{ color: 'var(--text)' }}
        >
          {title}
        </div>
      </div>
      {action && <div className="flex-shrink-0 flex items-center gap-1">{action}</div>}
    </div>
  )
}
