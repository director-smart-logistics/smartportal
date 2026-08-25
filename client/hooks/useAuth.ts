import { useFirebaseAuth } from "@/lib/context/FirebaseAuthContext";

export function useAuth() {
  return useFirebaseAuth();
}
