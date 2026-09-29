// One window keydown listener for the app-level shortcuts (⌘K in command-menu, `g` in
// grid-overlay) instead of one per always-mounted component. Subscribers get the raw
// event and keep their own matching/guard logic; the listener attaches on the first
// subscription and detaches with the last. Overlay-scoped keys (Escape in an open
// modal, focus traps) stay where they are — they mount and unmount with their overlay.

type KeydownHandler = (e: KeyboardEvent) => void

const handlers = new Set<KeydownHandler>()

function dispatch(e: KeyboardEvent) {
  // Snapshot: a handler unsubscribing mid-dispatch must not skip the rest.
  for (const handler of [...handlers]) handler(e)
}

export function subscribeKeydown(handler: KeydownHandler): () => void {
  if (handlers.size === 0) window.addEventListener('keydown', dispatch)
  handlers.add(handler)
  return () => {
    handlers.delete(handler)
    if (handlers.size === 0) window.removeEventListener('keydown', dispatch)
  }
}
