/**
 * Static-reader / draft backup: open your local app (e.g. http://localhost:5173),
 * DevTools → Console, paste this entire file, Enter.
 * Downloads panui-localStorage-export.json with all keys starting with panui:
 */
;(function exportPanuiLocalStorage() {
  const out = {}
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k != null && k.startsWith('panui:')) out[k] = localStorage.getItem(k)
  }
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'panui-localStorage-export.json'
  a.click()
  URL.revokeObjectURL(a.href)
  console.log('Exported', Object.keys(out).length, 'panui:* keys')
})()
