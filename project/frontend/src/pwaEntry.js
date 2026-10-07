export function isStandalonePwa() {
  return Boolean(
    window.navigator.standalone === true ||
      window.matchMedia?.('(display-mode: standalone)').matches,
  )
}

export function shouldRedirectPwaHome(pathname, standalone) {
  return standalone && (pathname === '/' || pathname === '')
}
