import { describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'
import { MODULE_PDF_TEMPLATE_SEEDS } from '@beaconhs/db/seed/pdf-templates'
import { expandRepeatMarkers } from '@beaconhs/email-render'

// CONTRACT TEST: every PDF document template must survive the visual designer.
//
// The designer (GrapesJS) parses `sourceHtml` with the browser's HTML parser
// before it can build a component tree, then re-serializes it on save. The HTML
// parser is not a pass-through: a text node sitting directly inside <table>,
// <thead> or <tbody> is *foster-parented* out of the table and re-emitted BEFORE
// it. So a raw `{{#if x}}` / `{{#each x}}` written between a <table> and its
// <tr> is silently relocated the first time someone opens the template in the
// designer — the block then wraps nothing, and the section prints empty.
//
// That is why repeats/conditions inside a table MUST be authored as
// `data-each` / `data-if` attributes on the <tr> itself (valid HTML, an
// attribute the parser cannot move); `expandRepeatMarkers` turns them into
// blocks at compile time, after the designer is done with the markup.
//
// Raw blocks are still fine OUTSIDE table internals (between tables, inside a
// <div>/<td>), where the parser leaves text nodes alone.

const TABLE_INTERNAL = new Set(['TABLE', 'THEAD', 'TBODY', 'TFOOT', 'TR'])

/** Parse + re-serialize exactly as the designer does before building components. */
function parseRoundTrip(html: string): { out: string; fostered: string[] } {
  const dom = new JSDOM('<!doctype html><body><div id="root"></div>')
  const root = dom.window.document.getElementById('root')!
  root.innerHTML = html

  // A handlebars token that ended up as a direct child of a table-internal
  // element, or immediately before a table it was meant to be inside, is proof
  // the parser moved it.
  const fostered: string[] = []
  const walker = dom.window.document.createTreeWalker(root, dom.window.NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? ''
    if (!/\{\{[#/]/.test(text)) continue
    const parent = node.parentElement
    if (parent && TABLE_INTERNAL.has(parent.tagName)) {
      fostered.push(text.trim().slice(0, 60))
    }
  }
  return { out: root.innerHTML, fostered }
}

/** Tokens/attributes that must still be present after the designer touches it. */
function markers(html: string) {
  return {
    each: [...html.matchAll(/data-each="([^"]+)"/g)].map((m) => m[1]!).sort(),
    if: [...html.matchAll(/data-if="([^"]+)"/g)].map((m) => m[1]!).sort(),
    blocks: [...html.matchAll(/\{\{([#/])(\w+)/g)].map((m) => `${m[1]}${m[2]}`).sort(),
    scalars: [...html.matchAll(/\{\{\{?\s*([a-zA-Z_][\w.]*)\s*\}?\}\}/g)].map((m) => m[1]!).sort(),
  }
}

describe('PDF templates survive the visual designer', () => {
  for (const seed of MODULE_PDF_TEMPLATE_SEEDS) {
    describe(seed.key, () => {
      it('keeps every handlebars block out of table-internal text position', () => {
        // A block token parked directly inside <table>/<tbody>/<tr> gets moved by
        // the HTML parser, so the designer would corrupt the template on open.
        expect(parseRoundTrip(seed.html).fostered).toEqual([])
      })

      it('round-trips every merge token and repeat marker unchanged', () => {
        const { out } = parseRoundTrip(seed.html)
        expect(markers(out)).toEqual(markers(seed.html))
      })

      it('still compiles to the same blocks after a designer round-trip', () => {
        const { out } = parseRoundTrip(seed.html)
        // expandRepeatMarkers is what turns the designer-safe attributes into
        // {{#each}}/{{#if}}; it must find the same set either way.
        const before = expandRepeatMarkers(seed.html)
        const after = expandRepeatMarkers(out)
        const blockSet = (html: string) =>
          [...html.matchAll(/\{\{([#/])(\w+)(?:\s+([\w.]+))?/g)]
            .map((m) => `${m[1]}${m[2]}${m[3] ? ` ${m[3]}` : ''}`)
            .sort()
        expect(blockSet(after)).toEqual(blockSet(before))
        expect(after).not.toContain('data-each=')
        expect(after).not.toContain('data-if=')
      })
    })
  }
})
