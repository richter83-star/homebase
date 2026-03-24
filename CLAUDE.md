# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Homebase is a mobile-first PWA for shared household shopping lists with real-time sync, Google Auth, and push notifications. Stack: Vite + vanilla JS, Firebase Auth, Firestore, FCM, Firebase Hosting.

## Development Commands

```bash
npm run dev        # Start Vite dev server (localhost:5173)
npm run build      # Production build → dist/
npm run preview    # Preview production build locally
firebase deploy    # Deploy to Firebase Hosting (requires firebase-tools)
```

Firebase Hosting deploy requires `firebase-tools` installed globally (`npm i -g firebase-tools`) and `firebase login`.

## Required Environment

Copy `.env` with these Firebase config vars (credentials provided by Bri):

```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_VAPID_KEY=
```

## Architecture

### Module Responsibilities

- `src/main.js` — app entry point; bootstraps auth, wires tabs, runs recurring-item check on load
- `src/auth.js` — Google sign-in, onAuthStateChanged, household membership check → create/join flow
- `src/db.js` — all Firestore reads/writes; exports onSnapshot listener for real-time list
- `src/notifications.js` — FCM token registration, client-side fan-out to member tokens via FCM HTTP API
- `src/ui/list.js` — shopping list tab: add/edit/delete/buy items, budget progress bar
- `src/ui/insights.js` — spend tracking and runout prediction tab
- `src/ui/house.js` — housemates, budget setting, invite code display, admin reset buttons
- `public/firebase-messaging-sw.js` — service worker: handles background push notifications and app-shell caching

### Firestore Data Model

```
households/{householdId}
  adminUid, inviteCode (6-char), budget, name, createdAt

households/{householdId}/members/{uid}
  name, email, photoURL, fcmToken, joinedAt

households/{householdId}/items/{itemId}
  name, cat ('grocery'|'cleaning'|'personal'|'other'), store, cost, qty,
  bought, boughtBy, addedBy, expiryDays, addedDate, notes, recurring, freqDays
```

### Key Patterns

**Auth flow**: Google sign-in → check `households` collection for membership → if none, show create/join screen. Invite code (6-char alphanumeric) stored on household doc; joining adds user to `members` subcollection.

**Real-time sync**: Firestore `onSnapshot` on items collection. Use optimistic UI (update DOM immediately, let Firestore confirm).

**Push notifications (client-side fan-out)**: On triggering events, read all `fcmToken` fields from `members` subcollection, POST to FCM HTTP API for each token. Handle stale tokens by catching send errors and removing them. No Cloud Functions required for MVP.

**Recurring items**: On app load, query all `bought: true, recurring: true` items; re-add as unbuought if `addedDate + freqDays <= now`.

**Offline**: Show offline banner on network loss; Firestore SDK queues writes automatically.

## UI Design

Replicate `homebase.html` exactly — do not redesign. Dark theme (`#0f1117` bg), mint green (`#7fff9a`) accent, Syne + DM Mono fonts. The HTML prototype is the source of truth for all UI, layout, and component design.

## Admin-Only Features

Reset buttons (House tab) require `uid === household.adminUid`. Both "Reset all data" and "Reset stores" require a confirmation dialog. If admin leaves, transfer `adminUid` to the next member by `joinedAt`.
