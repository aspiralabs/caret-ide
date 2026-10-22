/** The blue dot on a project or session tab whose Claude session is waiting on the user. */
export default function AwaitingDot(): JSX.Element {
  return (
    <span
      title="Claude is waiting for your input"
      aria-label="Waiting for your input"
      className="h-2 w-2 shrink-0 rounded-full bg-ink-accent"
    />
  )
}
