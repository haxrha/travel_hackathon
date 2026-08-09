/**
 * Firebase app + Firestore for server actions / route handlers.
 * Uses the same NEXT_PUBLIC_* web config (hackathon-friendly).
 * Ensure Firestore rules allow create/update on `trips` while testing.
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { isFirebaseConfigured } from "./client";

const SERVER_APP_NAME = "wayport-server";

function firebaseConfig() {
  return {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
}

function getServerApp(): FirebaseApp {
  if (!isFirebaseConfigured()) {
    throw new Error("Firebase is not configured — set NEXT_PUBLIC_FIREBASE_* in .env.local");
  }
  const existing = getApps().find((a) => a.name === SERVER_APP_NAME);
  if (existing) return existing;
  // Prefer named server app so we don't clash with a browser singleton.
  try {
    return initializeApp(firebaseConfig(), SERVER_APP_NAME);
  } catch {
    return getApps().length ? getApp() : initializeApp(firebaseConfig());
  }
}

export function getServerFirestore(): Firestore {
  return getFirestore(getServerApp());
}

export { isFirebaseConfigured };
