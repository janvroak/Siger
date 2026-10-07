"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { clearToken, getToken } from "@/lib/auth";
import { ApiError, getCurrentUser, type User, type UserRole } from "@/lib/api";

type AuthState = {
  token: string | null;
  user: User | null;
  error: string;
};

/**
 * Load the signed-in user, redirecting to /login when there is no valid token
 * and to /dashboard when the user lacks the required role.
 */
export function useAuthedUser(requiredRole?: UserRole): AuthState {
  const router = useRouter();
  const [state, setState] = useState<AuthState>({
    token: null,
    user: null,
    error: "",
  });

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    const activeToken = token;

    async function loadUser() {
      try {
        const user = await getCurrentUser(activeToken);
        if (requiredRole && user.role !== requiredRole) {
          router.replace("/dashboard");
          return;
        }
        setState({ token: activeToken, user, error: "" });
      } catch (caughtError) {
        if (caughtError instanceof ApiError && caughtError.status === 401) {
          clearToken();
          router.replace("/login");
          return;
        }
        setState({ token: null, user: null, error: "Unable to load your account." });
      }
    }

    void loadUser();
  }, [router, requiredRole]);

  return state;
}
