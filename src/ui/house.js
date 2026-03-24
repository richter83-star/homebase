import { updateBudget, regenerateInviteCode, resetAllItems, resetStores, leaveHousehold, watchMembers } from '../db.js'
import { signOutUser } from '../auth.js'

let _household = null
let _uid = null
let _unsubMembers = null

export function initHouse(user, household) {
  _uid = user.uid
  _household = household

  if (_unsubMembers) _unsubMembers()
  _unsubMembers = watchMembers(household.id, renderMembers)

  renderHouseInfo()
  setupHouseEvents()
}

export function updateHouseData(household) {
  _household = household
  renderHouseInfo()
}

export function teardownHouse() {
  if (_unsubMembers) { _unsubMembers(); _unsubMembers = null }
}

function renderHouseInfo() {
  const nameEl = document.querySelector('#house-name')
  if (nameEl) nameEl.textContent = _household?.name || 'My Household'

  const codeEl = document.querySelector('#invite-code')
  if (codeEl) codeEl.textContent = _household?.inviteCode || '——'

  const budgetEl = document.querySelector('#budget-display')
  if (budgetEl) budgetEl.textContent = _household?.budget ? `$${_household.budget}` : 'Not set'

  const isAdmin = _uid === _household?.adminUid
  document.querySelectorAll('.admin-only').forEach((el) => {
    el.style.display = isAdmin ? '' : 'none'
  })
}

function renderMembers(members) {
  const el = document.querySelector('#members-list')
  if (!el) return
  el.innerHTML = members
    .map((m) => `
      <div class="member-row">
        ${m.photoURL ? `<img class="member-avatar" src="${esc(m.photoURL)}" alt="">` : '<div class="member-avatar-placeholder"></div>'}
        <div class="member-info">
          <span class="member-name">${esc(m.name || m.email)}</span>
          <span class="member-email">${esc(m.email || '')}</span>
        </div>
        ${m.uid === _household?.adminUid ? '<span class="member-badge">Admin</span>' : ''}
      </div>`)
    .join('')
}

function setupHouseEvents() {
  // Budget form
  const budgetForm = document.querySelector('#budget-form')
  if (budgetForm && !budgetForm.dataset.bound) {
    budgetForm.dataset.bound = '1'
    budgetForm.addEventListener('submit', async (e) => {
      e.preventDefault()
      const val = budgetForm.querySelector('[name=budget]')?.value
      if (!val) return
      await updateBudget(_household.id, val)
      budgetForm.reset()
    })
  }

  // Copy invite code
  const copyBtn = document.querySelector('#copy-invite-code')
  if (copyBtn && !copyBtn.dataset.bound) {
    copyBtn.dataset.bound = '1'
    copyBtn.addEventListener('click', () => {
      const code = _household?.inviteCode
      if (!code) return
      navigator.clipboard.writeText(code).then(() => {
        copyBtn.textContent = 'Copied!'
        setTimeout(() => (copyBtn.textContent = 'Copy'), 2000)
      })
    })
  }

  // Regenerate invite code (admin)
  const regenBtn = document.querySelector('#regen-invite-code')
  if (regenBtn && !regenBtn.dataset.bound) {
    regenBtn.dataset.bound = '1'
    regenBtn.addEventListener('click', async () => {
      if (!confirm('Generate a new invite code? The old one will stop working.')) return
      await regenerateInviteCode(_household.id)
    })
  }

  // Reset all data (admin)
  const resetAllBtn = document.querySelector('#reset-all-btn')
  if (resetAllBtn && !resetAllBtn.dataset.bound) {
    resetAllBtn.dataset.bound = '1'
    resetAllBtn.addEventListener('click', async () => {
      if (!confirm('Delete ALL items and reset budget? This cannot be undone.')) return
      if (!confirm('Are you sure? This will permanently delete all shopping list data.')) return
      await resetAllItems(_household.id)
    })
  }

  // Reset stores (admin)
  const resetStoresBtn = document.querySelector('#reset-stores-btn')
  if (resetStoresBtn && !resetStoresBtn.dataset.bound) {
    resetStoresBtn.dataset.bound = '1'
    resetStoresBtn.addEventListener('click', async () => {
      if (!confirm('Clear all store tags from items?')) return
      await resetStores(_household.id)
    })
  }

  // Sign out
  const signOutBtn = document.querySelector('#sign-out-btn')
  if (signOutBtn && !signOutBtn.dataset.bound) {
    signOutBtn.dataset.bound = '1'
    signOutBtn.addEventListener('click', async () => {
      if (!confirm('Sign out?')) return
      await signOutUser()
    })
  }

  // Leave household
  const leaveBtn = document.querySelector('#leave-household-btn')
  if (leaveBtn && !leaveBtn.dataset.bound) {
    leaveBtn.dataset.bound = '1'
    leaveBtn.addEventListener('click', async () => {
      if (!confirm('Leave this household?')) return
      const isAdmin = _uid === _household?.adminUid
      await leaveHousehold(_household.id, _uid, isAdmin)
      // Auth state change will re-route to create/join screen
    })
  }
}

function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}
