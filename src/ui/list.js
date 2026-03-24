import { addItem, updateItem, markBought, deleteItem, watchItems } from '../db.js'
import { notifyItemAdded, notifyBudgetAlert } from '../notifications.js'

let _householdId = null
let _uid = null
let _userName = null
let _household = null
let _items = []
let _unsubItems = null

const CATS = ['grocery', 'cleaning', 'personal', 'other']
const CAT_ICONS = { grocery: '🛒', cleaning: '🧹', personal: '🧴', other: '📦' }

export function initList(user, household) {
  _uid = user.uid
  _userName = user.displayName
  _householdId = household.id
  _household = household
  _items = []

  if (_unsubItems) _unsubItems()
  _unsubItems = watchItems(_householdId, (items) => {
    _items = items
    renderList()
    updateBudgetBar()
  })

  setupListEvents()
}

export function updateHouseholdData(household) {
  _household = household
  updateBudgetBar()
}

export function teardownList() {
  if (_unsubItems) { _unsubItems(); _unsubItems = null }
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderList() {
  const filter = document.querySelector('#cat-filter')?.value || 'all'
  const search = document.querySelector('#search-input')?.value?.toLowerCase() || ''
  const showBought = document.querySelector('#show-bought')?.checked ?? false

  let items = _items.filter((item) => {
    if (!showBought && item.bought) return false
    if (filter !== 'all' && item.cat !== filter) return false
    if (search && !item.name.toLowerCase().includes(search)) return false
    return true
  })

  const container = document.querySelector('#item-list')
  if (!container) return

  if (items.length === 0) {
    container.innerHTML = '<p class="empty-msg">No items yet. Add something above!</p>'
    return
  }

  // Group: unbought first, then bought
  const unbought = items.filter((i) => !i.bought)
  const bought = items.filter((i) => i.bought)

  container.innerHTML = [
    ...unbought.map(renderItem),
    bought.length && !showBought ? '' :
      bought.map(renderItem).join(''),
  ].flat().join('')

  container.querySelectorAll('.item-check').forEach((cb) => {
    cb.addEventListener('change', async (e) => {
      const id = e.target.dataset.id
      await markBought(_householdId, id, _uid, e.target.checked)
    })
  })

  container.querySelectorAll('.item-delete').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.dataset.id
      await deleteItem(_householdId, id)
    })
  })

  container.querySelectorAll('.item-edit').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = e.target.dataset.id
      openEditModal(id)
    })
  })
}

function renderItem(item) {
  const costStr = item.cost ? `$${Number(item.cost).toFixed(2)}` : ''
  const storeStr = item.store ? `<span class="item-store">${esc(item.store)}</span>` : ''
  const qtyStr = item.qty && item.qty > 1 ? `×${item.qty}` : ''
  const recurStr = item.recurring ? '<span class="item-badge">↻</span>' : ''
  return `
    <div class="item-row ${item.bought ? 'item-bought' : ''}" data-id="${item.id}">
      <label class="item-check-wrap">
        <input type="checkbox" class="item-check" data-id="${item.id}" ${item.bought ? 'checked' : ''}>
        <span class="checkmark"></span>
      </label>
      <div class="item-info">
        <span class="item-name">${CAT_ICONS[item.cat] || ''} ${esc(item.name)} ${qtyStr} ${recurStr}</span>
        <span class="item-meta">${storeStr}${costStr}</span>
      </div>
      <div class="item-actions">
        <button class="item-edit icon-btn" data-id="${item.id}" title="Edit">✏️</button>
        <button class="item-delete icon-btn" data-id="${item.id}" title="Delete">🗑️</button>
      </div>
    </div>`
}

function updateBudgetBar() {
  const budget = _household?.budget
  const barWrap = document.querySelector('#budget-bar-wrap')
  if (!budget) {
    if (barWrap) barWrap.style.display = 'none'
    return
  }
  if (barWrap) barWrap.style.display = ''

  const spent = _items
    .filter((i) => i.bought && i.cost)
    .reduce((sum, i) => sum + Number(i.cost) * (i.qty || 1), 0)

  const pct = Math.min(100, Math.round((spent / budget) * 100))
  const bar = document.querySelector('#budget-bar')
  const label = document.querySelector('#budget-label')
  if (bar) {
    bar.style.width = pct + '%'
    bar.style.background = pct >= 90 ? '#ff6b6b' : pct >= 75 ? '#ffd166' : '#7fff9a'
  }
  if (label) label.textContent = `$${spent.toFixed(2)} / $${budget} (${pct}%)`

  // Notify on threshold
  if (pct >= 90) notifyBudgetAlert(90, budget)
  else if (pct >= 75) notifyBudgetAlert(75, budget)
}

// ── Add item ──────────────────────────────────────────────────────────────────

function setupListEvents() {
  const addForm = document.querySelector('#add-item-form')
  if (addForm && !addForm.dataset.bound) {
    addForm.dataset.bound = '1'
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault()
      const data = getFormData(addForm)
      if (!data.name.trim()) return
      const ref = await addItem(_householdId, _uid, data)
      addForm.reset()
      await notifyItemAdded(data.name, _userName)
    })
  }

  const catFilter = document.querySelector('#cat-filter')
  if (catFilter && !catFilter.dataset.bound) {
    catFilter.dataset.bound = '1'
    catFilter.addEventListener('change', renderList)
  }

  const searchInput = document.querySelector('#search-input')
  if (searchInput && !searchInput.dataset.bound) {
    searchInput.dataset.bound = '1'
    searchInput.addEventListener('input', renderList)
  }

  const showBought = document.querySelector('#show-bought')
  if (showBought && !showBought.dataset.bound) {
    showBought.dataset.bound = '1'
    showBought.addEventListener('change', renderList)
  }
}

// ── Edit modal ────────────────────────────────────────────────────────────────

function openEditModal(itemId) {
  const item = _items.find((i) => i.id === itemId)
  if (!item) return

  const modal = document.querySelector('#edit-modal')
  const form = document.querySelector('#edit-item-form')
  if (!modal || !form) return

  form.querySelector('[name=name]').value = item.name || ''
  form.querySelector('[name=cat]').value = item.cat || 'grocery'
  form.querySelector('[name=store]').value = item.store || ''
  form.querySelector('[name=cost]').value = item.cost || ''
  form.querySelector('[name=qty]').value = item.qty || 1
  form.querySelector('[name=notes]').value = item.notes || ''
  form.querySelector('[name=expiryDays]').value = item.expiryDays || ''
  form.querySelector('[name=recurring]').checked = item.recurring || false
  form.querySelector('[name=freqDays]').value = item.freqDays || ''
  form.dataset.itemId = itemId

  modal.classList.add('open')
}

function getFormData(form) {
  const fd = new FormData(form)
  return {
    name: fd.get('name') || '',
    cat: fd.get('cat') || 'grocery',
    store: fd.get('store') || '',
    cost: fd.get('cost') || null,
    qty: fd.get('qty') || 1,
    notes: fd.get('notes') || '',
    expiryDays: fd.get('expiryDays') || null,
    recurring: form.querySelector('[name=recurring]')?.checked || false,
    freqDays: fd.get('freqDays') || null,
  }
}

export function setupEditModal() {
  const modal = document.querySelector('#edit-modal')
  const form = document.querySelector('#edit-item-form')
  const closeBtn = document.querySelector('#edit-modal-close')

  if (!modal || !form) return

  closeBtn?.addEventListener('click', () => modal.classList.remove('open'))
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open') })

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const itemId = form.dataset.itemId
    if (!itemId) return
    const data = getFormData(form)
    await updateItem(_householdId, itemId, data)
    modal.classList.remove('open')
  })
}

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}
