import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  onSnapshot,
  serverTimestamp,
  orderBy,
} from 'firebase/firestore'
import { db } from './firebase.js'

// ── Households ────────────────────────────────────────────────────────────────

function generateInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

export async function getUserHousehold(uid) {
  const snap = await getDocs(
    query(collection(db, 'households'), where('memberUids', 'array-contains', uid))
  )
  if (snap.empty) return null
  const docSnap = snap.docs[0]
  return { id: docSnap.id, ...docSnap.data() }
}

export async function createHousehold(user, name) {
  const inviteCode = generateInviteCode()
  const householdRef = await addDoc(collection(db, 'households'), {
    name,
    adminUid: user.uid,
    inviteCode,
    budget: null,
    createdAt: serverTimestamp(),
    memberUids: [user.uid],
  })
  await setDoc(doc(db, 'households', householdRef.id, 'members', user.uid), {
    name: user.displayName,
    email: user.email,
    photoURL: user.photoURL,
    fcmToken: null,
    joinedAt: serverTimestamp(),
  })
  const snap = await getDoc(householdRef)
  return { id: householdRef.id, ...snap.data() }
}

export async function joinHousehold(user, code) {
  const snap = await getDocs(
    query(collection(db, 'households'), where('inviteCode', '==', code.toUpperCase()))
  )
  if (snap.empty) return null
  const householdDoc = snap.docs[0]
  const householdId = householdDoc.id
  await updateDoc(doc(db, 'households', householdId), {
    memberUids: [...(householdDoc.data().memberUids || []), user.uid],
  })
  await setDoc(doc(db, 'households', householdId, 'members', user.uid), {
    name: user.displayName,
    email: user.email,
    photoURL: user.photoURL,
    fcmToken: null,
    joinedAt: serverTimestamp(),
  })
  return { id: householdId, ...householdDoc.data() }
}

export async function updateBudget(householdId, budget) {
  await updateDoc(doc(db, 'households', householdId), { budget: Number(budget) })
}

export async function regenerateInviteCode(householdId) {
  const code = generateInviteCode()
  await updateDoc(doc(db, 'households', householdId), { inviteCode: code })
  return code
}

export function watchHousehold(householdId, callback) {
  return onSnapshot(doc(db, 'households', householdId), (snap) => {
    callback({ id: snap.id, ...snap.data() })
  })
}

// ── Members ───────────────────────────────────────────────────────────────────

export function watchMembers(householdId, callback) {
  return onSnapshot(
    query(collection(db, 'households', householdId, 'members'), orderBy('joinedAt')),
    (snap) => callback(snap.docs.map((d) => ({ uid: d.id, ...d.data() })))
  )
}

export async function getMembers(householdId) {
  const snap = await getDocs(
    query(collection(db, 'households', householdId, 'members'), orderBy('joinedAt'))
  )
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() }))
}

export async function updateFcmToken(householdId, uid, token) {
  await updateDoc(doc(db, 'households', householdId, 'members', uid), { fcmToken: token })
}

export async function removeFcmToken(householdId, uid) {
  await updateDoc(doc(db, 'households', householdId, 'members', uid), { fcmToken: null })
}

// ── Items ─────────────────────────────────────────────────────────────────────

export function watchItems(householdId, callback) {
  return onSnapshot(
    query(collection(db, 'households', householdId, 'items'), orderBy('addedDate', 'desc')),
    (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  )
}

export async function addItem(householdId, uid, data) {
  return addDoc(collection(db, 'households', householdId, 'items'), {
    name: data.name,
    cat: data.cat || 'grocery',
    store: data.store || '',
    cost: data.cost ? Number(data.cost) : null,
    qty: data.qty ? Number(data.qty) : 1,
    notes: data.notes || '',
    expiryDays: data.expiryDays ? Number(data.expiryDays) : null,
    recurring: data.recurring || false,
    freqDays: data.freqDays ? Number(data.freqDays) : null,
    bought: false,
    boughtBy: null,
    addedBy: uid,
    addedDate: serverTimestamp(),
  })
}

export async function updateItem(householdId, itemId, data) {
  await updateDoc(doc(db, 'households', householdId, 'items', itemId), data)
}

export async function markBought(householdId, itemId, uid, bought) {
  await updateDoc(doc(db, 'households', householdId, 'items', itemId), {
    bought,
    boughtBy: bought ? uid : null,
  })
}

export async function deleteItem(householdId, itemId) {
  await deleteDoc(doc(db, 'households', householdId, 'items', itemId))
}

export async function resetAllItems(householdId) {
  const snap = await getDocs(collection(db, 'households', householdId, 'items'))
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)))
  await updateDoc(doc(db, 'households', householdId), { budget: null })
}

export async function resetStores(householdId) {
  const snap = await getDocs(collection(db, 'households', householdId, 'items'))
  await Promise.all(snap.docs.map((d) => updateDoc(d.ref, { store: '' })))
}

// ── Recurring items ───────────────────────────────────────────────────────────

export async function checkRecurringItems(householdId, uid) {
  const snap = await getDocs(
    query(
      collection(db, 'households', householdId, 'items'),
      where('bought', '==', true),
      where('recurring', '==', true)
    )
  )
  const now = Date.now()
  const readded = []
  for (const d of snap.docs) {
    const item = d.data()
    if (!item.addedDate || !item.freqDays) continue
    const addedMs = item.addedDate.toMillis?.() || item.addedDate
    if (addedMs + item.freqDays * 86400000 <= now) {
      await addItem(householdId, uid, { ...item, bought: false })
      readded.push(item.name)
    }
  }
  return readded
}

// ── Admin: transfer if admin leaves ──────────────────────────────────────────

export async function leaveHousehold(householdId, uid, isAdmin) {
  // Remove from memberUids array
  const householdSnap = await getDoc(doc(db, 'households', householdId))
  const data = householdSnap.data()
  const remaining = (data.memberUids || []).filter((id) => id !== uid)

  if (remaining.length === 0) {
    // Last member: delete household
    const itemsSnap = await getDocs(collection(db, 'households', householdId, 'items'))
    const membersSnap = await getDocs(collection(db, 'households', householdId, 'members'))
    await Promise.all([
      ...itemsSnap.docs.map((d) => deleteDoc(d.ref)),
      ...membersSnap.docs.map((d) => deleteDoc(d.ref)),
    ])
    await deleteDoc(doc(db, 'households', householdId))
    return
  }

  const updates = { memberUids: remaining }
  if (isAdmin) {
    // Transfer admin to earliest joiner among remaining
    const membersSnap = await getDocs(
      query(collection(db, 'households', householdId, 'members'), orderBy('joinedAt'))
    )
    const nextAdmin = membersSnap.docs.find((d) => d.id !== uid)
    if (nextAdmin) updates.adminUid = nextAdmin.id
  }

  await updateDoc(doc(db, 'households', householdId), updates)
  await deleteDoc(doc(db, 'households', householdId, 'members', uid))
}
