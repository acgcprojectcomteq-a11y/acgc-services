/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  login as loginApi,
  register as registerApi,
  getMe,
  adminExists as adminExistsApi,
  updateProfile as updateProfileApi,
} from "@/api/auth";
import { normalizeUserProfile } from "@/lib/userProfile";
import { recordActivity } from "@/lib/activityLog";
import { subscribeToRealtime } from "@/lib/realtimeEvents";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(() => {
    const storedUser = localStorage.getItem("user");
    return storedUser ? normalizeUserProfile(JSON.parse(storedUser)) : null;
  });
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [adminExists, setAdminExists] = useState(null);
  const [adminLoading, setAdminLoading] = useState(true);
  const [adminError, setAdminError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const adminStatusFetching = useRef(false);
  const authInitializationStarted = useRef(false);
  const refreshUserRequestRef = useRef(null);

  const setToken = (token) => {
    if (token) {
      localStorage.setItem("token", token);
    } else {
      localStorage.removeItem("token");
    }
  };

  const setUserAndPersist = (userData) => {
    if (userData) {
      localStorage.setItem("user", JSON.stringify(userData));
      setUser(userData);
    } else {
      localStorage.removeItem("user");
      setUser(null);
    }
  };

  const clearAuth = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setUser(null);
    setAdminExists(null);
    setAdminError("");
    setAuthError("");
  }, []);

  useEffect(() => {
    const handleSessionRevoked = () => {
      clearAuth();
      setLogoutLoading(true);
      navigate("/login", { replace: true, state: null });
      window.setTimeout(() => setLogoutLoading(false), 3000);
    };
    window.addEventListener("auth:session-revoked", handleSessionRevoked);
    return () => window.removeEventListener("auth:session-revoked", handleSessionRevoked);
  }, [clearAuth, navigate]);

  const normalizeAndPersistUser = (userData) => {
    const normalized = normalizeUserProfile(userData);
    setUserAndPersist(normalized);
    return normalized;
  };

  const loadUser = async () => {
    const token = localStorage.getItem("token");
    if (!token) {
      setUserAndPersist(null);
      return;
    }

    try {
      const response = await getMe();
      normalizeAndPersistUser(response.user);
    } catch (error) {
      const status = error.response?.status;
      const message = error.data?.message || error.message || "";

      if (!(status === 401 || status === 404 || /invalid|expired|not found/i.test(message))) {
        console.error("Failed to load current user", error);
      }

      if (
        status === 401 ||
        status === 404 ||
        /invalid|expired|not found/i.test(message)
      ) {
        setToken(null);
        setUserAndPersist(null);
      }
    }
  };

  const refreshUser = useCallback(() => {
    if (refreshUserRequestRef.current) return refreshUserRequestRef.current;

    const request = (async () => {
      try {
        const response = await getMe();
        const normalized = normalizeUserProfile(response.user);
        const serialized = JSON.stringify(normalized);
        localStorage.setItem("user", serialized);
        setUser((current) => JSON.stringify(current) === serialized ? current : normalized);
        return normalized;
      } catch (error) {
        const status = error.response?.status;
        const message = error.data?.message || error.message || "";

        if (!(status === 401 || status === 404 || /invalid|expired|not found/i.test(message))) {
          console.error("Failed to refresh current user", error);
        }

        throw error;
      }
    })();
    refreshUserRequestRef.current = request.finally(() => {
      refreshUserRequestRef.current = null;
    });
    return refreshUserRequestRef.current;
  }, []);

  const accountId = user?._id || user?.id;
  useEffect(() => {
    if (!accountId || loading) return undefined;
    return subscribeToRealtime("profile", () => {
      refreshUser().catch(() => {});
    });
  }, [accountId, loading, refreshUser]);

  const loadAdminStatus = async () => {
    if (adminStatusFetching.current) {
      return;
    }

    adminStatusFetching.current = true;
    setAdminLoading(true);
    setAdminError("");

    try {
      const response = await adminExistsApi();
      if (response && typeof response.exists !== "undefined") {
        setAdminExists(response.exists === true);
      } else {
        setAdminError("Unexpected admin status response from server.");
        setAdminExists(null);
      }
    } catch (error) {
      console.error("Failed to load admin status", error);
      setAdminError(error.data?.message || error.message || "Unable to check admin status.");
      setAdminExists(null);
    } finally {
      adminStatusFetching.current = false;
      setAdminLoading(false);
    }
  };

  const refreshAdminStatus = async () => {
    if (adminLoading || adminStatusFetching.current) return;
    await loadAdminStatus();
  };

  useEffect(() => {
    if (authInitializationStarted.current) return;
    authInitializationStarted.current = true;

    const initAuth = async () => {
      setLoading(true);
      try {
        await loadUser();
      } finally {
        setLoading(false);
        void loadAdminStatus();
      }
    };

    initAuth();
  }, []);

  const login = async ({ identifier, password }) => {
    if (loginLoading) {
      throw new Error("Login is already in progress.");
    }

    setAuthError("");
    setLoginLoading(true);
    try {
      const response = await loginApi({ identifier, password });
      setToken(response.token);
      const userProfile = normalizeAndPersistUser(response.user);
      if (userProfile.role === "admin" || userProfile.role === "super_admin") {
        recordActivity(userProfile, "Logged in", "Authentication");
      }
      return { ...response, user: userProfile };
    } finally {
      setLoginLoading(false);
    }
  };

  const register = async (payload) => {
    setAuthError("");
    return registerApi(payload);
  };

  const updateProfile = async (payload) => {
    setAuthError("");
    const response = await updateProfileApi(payload);
    const userProfile = normalizeAndPersistUser(response.user);
    return { ...response, user: userProfile };
  };

  const logout = () => {
    recordActivity(user, "Logged out", "Authentication");
    clearAuth();
    setLogoutLoading(true);
    if (typeof window !== "undefined") {
      navigate("/login", { replace: true, state: null });
      window.setTimeout(() => setLogoutLoading(false), 3000);
    }
  };

  const value = {
    user,
    loading,
    adminExists,
    adminLoading,
    adminError,
    login,
    register,
    updateProfile,
    refreshUser,
    logout,
    refreshAdminStatus,
    loginLoading,
    logoutLoading,
    authError,
    setAuthError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
