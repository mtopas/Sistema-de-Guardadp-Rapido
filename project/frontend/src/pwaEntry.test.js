import { describe, expect, it } from 'vitest'

import { shouldRedirectPwaHome } from './pwaEntry'

describe('shouldRedirectPwaHome', () => {
  it('redirects the installed PWA root to the mobile entry point', () => {
    expect(shouldRedirectPwaHome('/', true)).toBe(true)
  })

  it('does not redirect Safari browsing at the root', () => {
    expect(shouldRedirectPwaHome('/', false)).toBe(false)
  })

  it('does not redirect a direct mobile URL', () => {
    expect(shouldRedirectPwaHome('/mobile', true)).toBe(false)
  })
})
