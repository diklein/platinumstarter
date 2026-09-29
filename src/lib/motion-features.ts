// Loaded ASYNC by <LazyMotion features={...}> in providers.tsx — this module is the
// split point that keeps motion's dom-animation feature bundle (~30KB gz) out of the
// pre-FCP critical path. Nothing animates during a cold load (the hero reveal is pure
// CSS), so the features arriving a beat after hydration changes nothing visible; m.*
// components render static until then by LazyMotion's design.
export { domAnimation as default } from 'motion/react'
