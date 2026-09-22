import React from 'react'
import { ProductCard } from './product-card'

/* TL;DR is a note-style ProductCard: the strip band labels the box the way Retired and
 * Updated do, so every chrome-labeled aside in an article is one component. */
export function TlDr({ children }: { children?: React.ReactNode }) {
  return <ProductCard strip="TL;DR">{children}</ProductCard>
}
