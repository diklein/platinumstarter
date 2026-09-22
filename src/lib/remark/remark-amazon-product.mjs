/**
 * remark-amazon-product
 *
 * A remark plugin that rewrites bare Amazon product URLs (on their own line)
 * into <ProductCard asin="..." /> JSX flow elements (BLOG-03).
 *
 * Only rewrites block-level paragraphs whose sole child is a single Amazon URL.
 * Inline Amazon URLs within a paragraph of other text are left untouched.
 */

import { visit, SKIP } from 'unist-util-visit'

// Matches Amazon product URLs with /dp/ or /gp/product/ paths
// Captures the 10-character ASIN (uppercase alphanumeric)
const AMAZON_RE = /^https?:\/\/(?:www\.)?amazon\.[a-z.]+\/(?:dp|gp\/product)\/([A-Z0-9]{10})/i

export default function remarkAmazonProduct() {
  return function transformer(tree) {
    visit(tree, 'paragraph', (paragraphNode, index, parent) => {
      if (paragraphNode.children.length !== 1) return
      const child = paragraphNode.children[0]

      // The bare URL arrives as plain TEXT without remark-gfm, and as an autolink
      // (a link whose label IS its URL) with it, since gfm runs earlier in this
      // pipeline. Both are "a paragraph that is nothing but the link". A link the
      // author wrote by hand ([label](url), label differing) is left alone.
      let url = null
      if (child.type === 'text') {
        url = child.value.trim()
      } else if (
        child.type === 'link' &&
        child.children.length === 1 &&
        child.children[0].type === 'text' &&
        child.children[0].value.trim() === child.url.trim()
      ) {
        url = child.url.trim()
      }
      if (!url) return

      const match = AMAZON_RE.exec(url)
      if (!match) return

      const asin = match[1]

      const jsxNode = {
        type: 'mdxJsxFlowElement',
        name: 'ProductCard',
        attributes: [
          {
            type: 'mdxJsxAttribute',
            name: 'asin',
            value: asin,
          },
        ],
        children: [],
      }

      // Replace the paragraph with the ProductCard JSX node
      parent.children.splice(index, 1, jsxNode)

      // Return SKIP with the same index so visit doesn't recurse into the
      // new node and doesn't advance past it
      return [SKIP, index]
    })
  }
}
