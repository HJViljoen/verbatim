// Verbatim voices — the hero of an evidence-led card. The quote is the subject;
// the claim beneath it is the annotation, not the headline (Redesign Spec §1:
// "in their own words"). Shared by Market, Competitive, and the Dashboard.
export function Quotes({ items }: { items: string[] }) {
  if (items.length === 0) return null
  return (
    <div className="space-y-2">
      {items.map((q, i) => (
        <blockquote
          key={i}
          className="border-l-2 border-primary/30 pl-3 text-[15px] italic leading-snug text-foreground/85"
        >
          {q}
        </blockquote>
      ))}
    </div>
  )
}
