OBJECTIVE:
Build "Homebase" — a mobile-first PWA for shared household shopping lists 
with real-time sync, Google auth, Firebase backend, and true push notifications.

STACK:
- Vite + vanilla JS (no framework — keep it lean for PWA)
- Firebase Auth (Google sign-in only)
- Firestore (real-time database)
- Firebase Cloud Messaging (FCM) for push notifications
- Firebase Hosting (deployment)
- Service Worker for PWA + background push

DESIGN REFERENCE:
Existing HTML prototype exists at homebase.html — use it for all UI, 
colors, layout, and component design. Dark theme (#0f1117 bg), 
Syne + DM Mono fonts, mint green (#7fff9a) accent. Do not redesign — 
replicate the existing UI exactly and wire it to Firebase.

PROJECT STRUCTURE:
homebase/
├── public/
│   ├── index.html
│   ├── manifest.json
│   └── firebase-messaging-sw.js   ← service worker for background push
├── src/
│   ├── main.js
│   ├── auth.js          ← Google sign-in, session
│   ├── db.js            ← all Firestore reads/writes
│   ├── notifications.js ← FCM token registration + push logic
│   ├── ui/
│   │   ├── list.js      ← shopping list tab
│   │   ├── insights.js  ← spend + predictions tab
│   │   └── house.js     ← housemates + budget + settings tab
│   └── style.css
├── .env                 ← Firebase config (gitignored)
├── vite.config.js
└── package.json

FIRESTORE DATA MODEL:

households/{householdId}
  - name: string
  - adminUid: string
  - inviteCode: string (6-char alphanumeric, generated on creation)
  - budget: number
  - createdAt: timestamp

households/{householdId}/members/{uid}
  - name: string
  - email: string
  - photoURL: string
  - fcmToken: string        ← updated on each login
  - joinedAt: timestamp

households/{householdId}/items/{itemId}
  - name: string
  - cat: 'grocery'|'cleaning'|'personal'|'other'
  - store: string
  - cost: number
  - qty: number
  - bought: boolean
  - boughtBy: uid|null
  - addedBy: uid
  - expiryDays: number|null
  - addedDate: timestamp
  - notes: string
  - recurring: boolean
  - freqDays: number|null

FEATURES TO BUILD:

1. AUTH FLOW
   - Google sign-in button on launch
   - After auth: check if user belongs to a household
   - If yes: load household, go to app
   - If no: show two options:
     a) "Create a household" → generates invite code, user becomes admin
     b) "Join with invite code" → 6-char input, validates against Firestore

2. INVITE CODE SYSTEM
   - Admin sees their invite code in House tab (copyable)
   - New user enters code → added to household members collection
   - Code never expires (admin can regenerate if needed)

3. REAL-TIME LIST
   - Firestore onSnapshot listener on items collection
   - All housemates see changes instantly
   - Optimistic UI updates (update locally then confirm)

4. PUSH NOTIFICATIONS (FCM)
   - On login: request permission, save FCM token to member doc
   - Triggers (use Firebase Cloud Functions OR client-side fan-out):
     a) Housemate adds item → notify all other members
     b) Item expiring in ≤2 days → daily check, notify all
     c) Runout prediction → notify all
     d) Budget hits 90% → notify all
   - Use client-side fan-out for MVP (no Cloud Functions needed):
     When user adds item, read all member FCM tokens from Firestore,
     call FCM HTTP API directly with each token
   - firebase-messaging-sw.js handles background notifications

5. RESET BUTTONS (in House tab, admin only)
   - "Reset all data" → deletes all items, resets budget to null
   - "Reset stores" → sets store:'' on all items
   - Both require confirmation dialog before executing

6. RECURRING ITEMS
   - On app load: check all bought recurring items
   - If (addedDate + freqDays) <= now → re-add as new unbuying item
   - Send push notification to household

7. BUDGET
   - Stored on household doc
   - Budget progress bar on list screen (same as prototype)
   - Alert notifications at 75% and 90%

8. PWA
   - manifest.json: name, icons, theme_color #0f1117, display standalone
   - Service worker: cache app shell for offline
   - "Add to Home Screen" banner on first visit

EDGE CASES:
- User loses internet → show offline banner, queue writes
- FCM token stale → catch errors on send, remove bad tokens
- Two users edit same item simultaneously → last-write-wins (Firestore default)
- User tries invalid invite code → clear error message
- Admin leaves household → transfer admin to next member

ENV VARIABLES NEEDED (.env):
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_VAPID_KEY=

SUCCESS CRITERIA:
- Bri logs in on phone A, Oscar logs in on phone B
- Bri adds "Oat Milk" → Oscar's phone gets a push notification 
  within 5 seconds, list updates in real-time
- Oscar marks it bought → Bri's list updates instantly
- Both can see budget progress, store tags, recurring items
- App works offline (reads cached, writes queue)

START HERE:
1. Scaffold the Vite project
2. Set up Firebase project config
3. Build auth flow (Google sign-in → household create/join)
4. Wire Firestore real-time list
5. Add FCM push notifications last

Bri will provide Firebase project credentials via .env after setup.