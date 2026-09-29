export function SkipToContent() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-[var(--color-accent)] focus:text-primary-foreground focus:rounded focus:outline-none font-sans text-label"
    >
      Skip to content
    </a>
  )
}
