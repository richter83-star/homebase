import './style.css'
import { watchAuth, signIn, handleCreateHousehold, handleJoinHousehold } from './auth.js'

// Register service worker and pass Firebase config to it
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/firebase-messaging-sw.js').then((reg) => {
    reg.active?.postMessage({
      type: 'FIREBASE_CONFIG',
      config: {
        apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
        authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
        projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
        storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
        appId: import.meta.env.VITE_FIREBASE_APP_ID,
      },
    })
  })
}
import { watchHousehold, watchItems, checkRecurringItems } from './db.js'
import { initList, updateHouseholdData, teardownList, setupEditModal } from './ui/list.js'
import { initInsights, updateInsightsData, renderInsights } from './ui/insights.js'
import { initHouse, updateHouseData, teardownHouse } from './ui/house.js'
import { notifyRecurringItems } from './notifications.js'

let _unsubHousehold = null
let _unsubItems = null
let _activeTab = 'list'
let _currentUser = null
let _currentHousehold = null
let _items = []

// ── Bootstrap ─────────────────────────────────────────────────────────────────

watchAuth(onAuthed, onUnauthed)
setupNetworkBanner()
document.querySelector('#sign-in-btn')?.addEventListener('click', async () => {
  try {
    await signIn()
  } catch (err) {
    if (err.code !== 'auth/popup-closed-by-user' && err.code !== 'auth/cancelled-popup-request') {
      alert('Sign-in failed: ' + (err.message || err.code))
    }
  }
})

async function onAuthed(user, household) {
  _currentUser = user
  if (!household) {
    showScreen('join-screen')
    setupJoinScreen(user)
    return
  }
  await enterApp(user, household)
}

function onUnauthed() {
  teardownApp()
  showScreen('auth-screen')
}

// ── App init ──────────────────────────────────────────────────────────────────

async function enterApp(user, household) {
  _currentHousehold = household
  showScreen('app-screen')
  setupTabs()
  setupEditModal()

  initList(user, household)
  initInsights(household)
  initHouse(user, household)

  // Real-time household updates
  if (_unsubHousehold) _unsubHousehold()
  _unsubHousehold = watchHousehold(household.id, (h) => {
    _currentHousehold = h
    updateHouseholdData(h)
    updateHouseData(h)
  })

  // Real-time items for insights cross-tab sharing
  if (_unsubItems) _unsubItems()
  _unsubItems = watchItems(household.id, (items) => {
    _items = items
    updateInsightsData(items, _currentHousehold)
    if (_activeTab === 'insights') renderInsights()
  })

  // Check recurring items on load
  const readded = await checkRecurringItems(household.id, user.uid)
  if (readded.length) await notifyRecurringItems(readded)

  showTab('list')
}

function teardownApp() {
  if (_unsubHousehold) { _unsubHousehold(); _unsubHousehold = null }
  if (_unsubItems) { _unsubItems(); _unsubItems = null }
  teardownList()
  teardownHouse()
  _currentHousehold = null
  _items = []
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    if (btn.dataset.bound) return
    btn.dataset.bound = '1'
    btn.addEventListener('click', () => showTab(btn.dataset.tab))
  })
}

function showTab(tab) {
  _activeTab = tab
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tab)
  })
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.dataset.tab === tab)
  })
  if (tab === 'insights') renderInsights()
}

// ── Screens ───────────────────────────────────────────────────────────────────

function showScreen(id) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'))
  document.querySelector(`#${id}`)?.classList.add('active')
}

// ── Create / join ─────────────────────────────────────────────────────────────

function setupJoinScreen(user) {
  const createForm = document.querySelector('#create-household-form')
  if (createForm && !createForm.dataset.bound) {
    createForm.dataset.bound = '1'
    createForm.addEventListener('submit', async (e) => {
      e.preventDefault()
      const name = createForm.querySelector('[name=household-name]')?.value?.trim()
      if (!name) return
      setLoading(true)
      try {
        const household = await handleCreateHousehold(user, name)
        await enterApp(user, household)
      } catch (err) {
        showError('create-error', err.message)
      } finally {
        setLoading(false)
      }
    })
  }

  const joinForm = document.querySelector('#join-household-form')
  if (joinForm && !joinForm.dataset.bound) {
    joinForm.dataset.bound = '1'
    joinForm.addEventListener('submit', async (e) => {
      e.preventDefault()
      const code = joinForm.querySelector('[name=invite-code]')?.value?.trim()
      if (!code) return
      setLoading(true)
      try {
        const household = await handleJoinHousehold(user, code)
        await enterApp(user, household)
      } catch (err) {
        showError('join-error', err.message)
      } finally {
        setLoading(false)
      }
    })
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function setLoading(on) {
  document.querySelectorAll('button[type=submit]').forEach((btn) => {
    btn.disabled = on
  })
}

function showError(elId, msg) {
  const el = document.querySelector(`#${elId}`)
  if (el) { el.textContent = msg; el.style.display = '' }
  setTimeout(() => { if (el) el.style.display = 'none' }, 4000)
}

function setupNetworkBanner() {
  const banner = document.querySelector('#offline-banner')
  if (!banner) return
  window.addEventListener('offline', () => banner.classList.add('show'))
  window.addEventListener('online', () => banner.classList.remove('show'))
}
