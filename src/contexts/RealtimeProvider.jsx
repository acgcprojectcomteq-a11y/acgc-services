import { createContext, useContext, useEffect, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "@/contexts/AuthContext";
import { getRealtimeClientId } from "@/lib/realtimeClientId";

const RealtimeContext = createContext({ connected: false });
const REALTIME_FALLBACK_INTERVAL_MS = 10_000;

const getRealtimeUrl = () => {
  const configuredUrl = import.meta.env.VITE_REALTIME_URL?.trim();
  if (configuredUrl) return configuredUrl;
  if (!import.meta.env.DEV || typeof window === "undefined") return "";
  return `${window.location.protocol === "https:" ? "https:" : "http:"}//${window.location.hostname}:5000`;
};

export function RealtimeProvider({ children }) {
  const { user, loading } = useAuth();
  const [connected, setConnected] = useState(false);
  const accountId = user?._id || user?.id;
  const staffAccessSignature = JSON.stringify(user?.staff_access || {});

  useEffect(() => {
    const token = localStorage.getItem("token");
    const clientId = getRealtimeClientId();
    const realtimeUrl = getRealtimeUrl();
    if (loading || !accountId || !token) {
      setConnected(false);
      return undefined;
    }

    const publishToPages = (detail) => {
      window.dispatchEvent(new CustomEvent("acgc:realtime", { detail }));
    };
    if (!realtimeUrl) {
      setConnected(false);
      const fallbackInterval = window.setInterval(() => {
        publishToPages({ area: "all", action: "reconcile", timestamp: new Date().toISOString() });
      }, REALTIME_FALLBACK_INTERVAL_MS);
      const reconcileOnFocus = () => {
        if (document.visibilityState === "visible") {
          publishToPages({ area: "all", action: "reconcile", timestamp: new Date().toISOString() });
        }
      };
      window.addEventListener("focus", reconcileOnFocus);
      document.addEventListener("visibilitychange", reconcileOnFocus);
      return () => {
        window.clearInterval(fallbackInterval);
        window.removeEventListener("focus", reconcileOnFocus);
        document.removeEventListener("visibilitychange", reconcileOnFocus);
      };
    }

    const socket = io(realtimeUrl, {
      auth: { token, clientId },
      withCredentials: true,
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 10000,
    });
    const seenEventIds = new Set();
    let fallbackInterval = null;
    const stopFallback = () => {
      if (fallbackInterval) window.clearInterval(fallbackInterval);
      fallbackInterval = null;
    };
    const startFallback = () => {
      if (fallbackInterval || socket.connected) return;
      fallbackInterval = window.setInterval(() => {
        publishToPages({ area: "all", action: "reconcile", timestamp: new Date().toISOString() });
      }, REALTIME_FALLBACK_INTERVAL_MS);
    };
    const handleReady = () => {
      publishToPages({ area: "all", action: "reconcile", timestamp: new Date().toISOString() });
    };
    const handleChange = (event) => {
      if (!event || typeof event !== "object") return;
      if (event.originClientId && event.originClientId === clientId) return;
      const eventKey = event.id ? `${event.id}:${event.area || ""}` : "";
      if (eventKey && seenEventIds.has(eventKey)) return;
      if (event.id) {
        seenEventIds.add(eventKey);
        if (seenEventIds.size > 500) seenEventIds.delete(seenEventIds.values().next().value);
      }
      publishToPages(event);
    };

    socket.on("connect", () => {
      stopFallback();
      setConnected(true);
    });
    socket.on("disconnect", () => {
      setConnected(false);
      startFallback();
    });
    socket.on("connect_error", () => {
      setConnected(false);
      startFallback();
    });
    socket.on("realtime:ready", handleReady);
    socket.on("realtime:changed", handleChange);
    startFallback();

    const reconcileOnFocus = () => {
      if (document.visibilityState === "visible" && !socket.connected) {
        publishToPages({ area: "all", action: "reconcile", timestamp: new Date().toISOString() });
      }
    };
    window.addEventListener("focus", reconcileOnFocus);
    document.addEventListener("visibilitychange", reconcileOnFocus);

    return () => {
      socket.off("realtime:ready", handleReady);
      socket.off("realtime:changed", handleChange);
      socket.disconnect();
      stopFallback();
      window.removeEventListener("focus", reconcileOnFocus);
      document.removeEventListener("visibilitychange", reconcileOnFocus);
      setConnected(false);
    };
  }, [accountId, loading, user?.role, staffAccessSignature]);

  return (
    <RealtimeContext.Provider value={{ connected }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export const useRealtimeStatus = () => useContext(RealtimeContext);
