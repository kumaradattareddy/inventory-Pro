export function saveScroll(key: string) {
  if (typeof window !== 'undefined') {
    sessionStorage.setItem(key, String(window.scrollY))
  }
}

export function restoreScroll(key: string) {
  if (typeof window !== 'undefined') {
    const y = sessionStorage.getItem(key)
    if (y) {
      requestAnimationFrame(() => {
        window.scrollTo(0, Number(y))
      })
    }
  }
}
