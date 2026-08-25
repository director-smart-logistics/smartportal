export { app, auth, db, storage, dbSP2 } from "./config";
export {
  signInWithGoogle,
  signInWithGoogleRedirect,
  getGoogleRedirectResult,
  signOut,
  getIdToken,
  getIdTokenResult,
  getCurrentUser,
  onAuthChange,
  mapFirebaseUserToAuthUser,
  type AuthUser,
  type FirebaseUser,
} from "./auth";
export {
  apiRequest,
  apiGet,
  apiPost,
  apiPut,
  apiPatch,
  apiDelete,
  apiPaginated,
} from "./api";
