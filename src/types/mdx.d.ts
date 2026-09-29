// Lets a route import an .mdx file directly (src/app/about/page.tsx). @types/mdx types
// the MDX runtime but does not declare the module shape of an imported .mdx file, so TS needs this.
declare module '*.mdx' {
  import type { MDXProps } from 'mdx/types'
  const MDXComponent: (props: MDXProps) => JSX.Element
  export default MDXComponent
}
