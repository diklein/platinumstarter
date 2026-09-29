import { cn } from '@/lib/utils'
import { HeroReveal } from './hero-reveal'

export function HeroBlock({ className }: { className?: string }) {
  return (
    <div className={cn('pt-24 pb-24 md:pb-32', className)}>
      <HeroReveal />
    </div>
  )
}
