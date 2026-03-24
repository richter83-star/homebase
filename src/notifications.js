import { getToken, onMessage } from 'firebase/messaging'
import { initMessaging } from './firebase.js'
import { updateFcmToken, removeFcmToken, getMembers } from './db.js'

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY

let _householdId = null
let _uid = null

export async function initNotifications(uid, householdId) {
  _uid = uid
  _householdId = householdId

  const messaging = await initMessaging()
  if (!messaging) return

  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: await navigator.serviceWorker.ready,
    })
    if (token) await updateFcmToken(householdId, uid, token)
  } catch (err) {
    console.warn('FCM init failed:', err)
  }

  onMessage(messaging, (payload) => {
    const { title, body } = payload.notification || {}
    if (title && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/icons/icon-192.svg' })
    }
  })
}

// Fan-out: POST to FCM HTTP API for each member token
async function sendToHousehold(title, body, excludeUid = null) {
  if (!_householdId) return
  const members = await getMembers(_householdId)
  const tokens = members
    .filter((m) => m.uid !== excludeUid && m.fcmToken)
    .map((m) => ({ uid: m.uid, token: m.fcmToken }))

  for (const { uid, token } of tokens) {
    try {
      const res = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `key=${import.meta.env.VITE_FIREBASE_SERVER_KEY}`,
        },
        body: JSON.stringify({
          to: token,
          notification: { title, body },
        }),
      })
      const data = await res.json()
      if (data.failure && data.results?.[0]?.error === 'NotRegistered') {
        await removeFcmToken(_householdId, uid)
      }
    } catch (err) {
      console.warn('FCM send failed for token:', err)
    }
  }
}

export async function notifyItemAdded(itemName, addedByName) {
  await sendToHousehold('New item added', `${addedByName} added "${itemName}"`, _uid)
}

export async function notifyBudgetAlert(percent, budget) {
  await sendToHousehold(
    'Budget alert',
    `Household has spent ${percent}% of $${budget} budget`
  )
}

export async function notifyRecurringItems(names) {
  if (!names.length) return
  const list = names.slice(0, 3).join(', ') + (names.length > 3 ? '…' : '')
  await sendToHousehold('Recurring items due', `Time to restock: ${list}`)
}
