import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
  UserCredential,
} from "firebase/auth";
import { auth } from "./config";

export type { FirebaseUser };

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: "select_account",
});

export interface AuthUser {
  id: string;
  email: string | null;
  fullName: string | null;
  photoURL: string | null;
  role: string;
  emailVerified: boolean;
  createdAt: string | null;
}

export async function signInWithGoogle(): Promise<UserCredential> {
  return signInWithPopup(auth, googleProvider);
}

export async function signInWithGoogleRedirect(): Promise<void> {
  return signInWithRedirect(auth, googleProvider);
}

export async function getGoogleRedirectResult(): Promise<UserCredential | null> {
  return getRedirectResult(auth);
}

export async function signOut(): Promise<void> {
  return firebaseSignOut(auth);
}

export async function getIdToken(forceRefresh = false): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdToken(forceRefresh);
}

export async function getIdTokenResult() {
  const user = auth.currentUser;
  if (!user) return null;
  return user.getIdTokenResult();
}

export function getCurrentUser(): FirebaseUser | null {
  return auth.currentUser;
}

export function onAuthChange(callback: (user: FirebaseUser | null) => void): () => void {
  return onAuthStateChanged(auth, callback);
}

export async function mapFirebaseUserToAuthUser(
  firebaseUser: FirebaseUser | null
): Promise<AuthUser | null> {
  if (!firebaseUser) return null;

  const tokenResult = await firebaseUser.getIdTokenResult();

  return {
    id: firebaseUser.uid,
    email: firebaseUser.email,
    fullName: firebaseUser.displayName,
    photoURL: firebaseUser.photoURL,
    role: (tokenResult.claims.role as string) || "AGENT",
    emailVerified: firebaseUser.emailVerified,
    createdAt: firebaseUser.metadata.creationTime || null,
  };
}
