/**
 * Firebase client SDK (browser / Next.js client components).
 *
 * Config comes from NEXT_PUBLIC_* env so the web SDK can run in the browser.
 * Import from here — never initializeApp in multiple places.
 *
 * @example
 * import { getFirebaseApp, isFirebaseConfigured } from "@/lib/firebase/client";
 * if (isFirebaseConfigured()) {
 *   const app = getFirebaseApp();
 * }
 */

import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.appId,
  );
}

/** Singleton Firebase app for the client. Throws if env is incomplete. */
export function getFirebaseApp(): FirebaseApp {
  if (!isFirebaseConfigured()) {
    throw new Error(
      "Firebase is not configured — set NEXT_PUBLIC_FIREBASE_* in .env.local",
    );
  }
  if (getApps().length) return getApp();
  return initializeApp(firebaseConfig);
}
