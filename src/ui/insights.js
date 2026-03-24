let _items = []
let _household = null

export function initInsights(household) {
  _household = household
}

export function updateInsightsData(items, household) {
  _items = items
  _household = household
}

export function renderInsights() {
  renderSpendByCategory()
  renderTopStores()
  renderRunoutPredictions()
}

function renderSpendByCategory() {
  const el = document.querySelector('#spend-by-cat')
  if (!el) return

  const bycat = { grocery: 0, cleaning: 0, personal: 0, other: 0 }
  _items.filter((i) => i.bought && i.cost).forEach((i) => {
    bycat[i.cat] = (bycat[i.cat] || 0) + Number(i.cost) * (i.qty || 1)
  })

  const total = Object.values(bycat).reduce((a, b) => a + b, 0)
  if (total === 0) {
    el.innerHTML = '<p class="empty-msg">No spend data yet.</p>'
    return
  }

  el.innerHTML = Object.entries(bycat)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([cat, amt]) => {
      const pct = Math.round((amt / total) * 100)
      return `
        <div class="insight-row">
          <span class="insight-label">${capitalize(cat)}</span>
          <div class="insight-bar-wrap">
            <div class="insight-bar" style="width:${pct}%"></div>
          </div>
          <span class="insight-val">$${amt.toFixed(2)} (${pct}%)</span>
        </div>`
    })
    .join('')
}

function renderTopStores() {
  const el = document.querySelector('#top-stores')
  if (!el) return

  const stores = {}
  _items.filter((i) => i.bought && i.store).forEach((i) => {
    stores[i.store] = (stores[i.store] || 0) + 1
  })

  const sorted = Object.entries(stores).sort(([, a], [, b]) => b - a).slice(0, 5)
  if (!sorted.length) {
    el.innerHTML = '<p class="empty-msg">No store data yet.</p>'
    return
  }

  el.innerHTML = sorted
    .map(([store, count]) => `
      <div class="insight-row">
        <span class="insight-label">${esc(store)}</span>
        <span class="insight-val">${count} item${count !== 1 ? 's' : ''}</span>
      </div>`)
    .join('')
}

function renderRunoutPredictions() {
  const el = document.querySelector('#runout-predictions')
  if (!el) return

  // Items with expiryDays that have been bought — estimate runout
  const now = Date.now()
  const predictions = _items
    .filter((i) => i.bought && i.expiryDays && i.addedDate)
    .map((i) => {
      const addedMs = i.addedDate?.toMillis?.() || i.addedDate || now
      const expiresAt = addedMs + i.expiryDays * 86400000
      const daysLeft = Math.round((expiresAt - now) / 86400000)
      return { name: i.name, daysLeft }
    })
    .filter((p) => p.daysLeft <= 7)
    .sort((a, b) => a.daysLeft - b.daysLeft)

  if (!predictions.length) {
    el.innerHTML = '<p class="empty-msg">No items expiring soon.</p>'
    return
  }

  el.innerHTML = predictions
    .map(({ name, daysLeft }) => {
      const urgency = daysLeft <= 2 ? 'urgent' : daysLeft <= 4 ? 'warn' : ''
      const label = daysLeft <= 0 ? 'Expired' : daysLeft === 1 ? '1 day left' : `${daysLeft} days left`
      return `
        <div class="insight-row ${urgency}">
          <span class="insight-label">${esc(name)}</span>
          <span class="insight-val">${label}</span>
        </div>`
    })
    .join('')
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1) }
function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}
