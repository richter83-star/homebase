import {
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { auth } from './firebase.js'
import { getUserHousehold, createHousehold, joinHousehold } from './db.js'
import { initNotifications } from './notifications.js'

const provider = new GoogleAuthProvider()

export async function signIn() {
  await signInWithPopup(auth, provider)
}

export async function signOutUser() {
  await signOut(auth)
}

export function watchAuth(onAuthed, onUnauthed) {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      const household = await getUserHousehold(user.uid)
      if (household) {
        await initNotifications(user.uid, household.id)
        onAuthed(user, household)
      } else {
        onAuthed(user, null)
      }
    } else {
      onUnauthed()
    }
  })
}

export async function handleCreateHousehold(user, name) {
  const household = await createHousehold(user, name)
  await initNotifications(user.uid, household.id)
  return household
}

export async function handleJoinHousehold(user, code) {
  const household = await joinHousehold(user, code)
  if (!household) throw new Error('Invalid invite code')
  await initNotifications(user.uid, household.id)
  return household
}
