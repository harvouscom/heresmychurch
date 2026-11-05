import { useState, useEffect, useRef, useCallback } from "react";

const PRESENCE_STORAGE_KEY = "hmc-presence-id";

const BOT_UA_PATTERNS = [
  /googlebot/i,
  /bingbot/i,
  /slurp/i,
  /duckduckbot/i,
  /baiduspider/i,
  /yandexbot/i,
  /facebookexternalhit/i,
  /twitterbot/i,
  /rogerbot/i,
  /linkedinbot/i,
  /embedly/i,
  /quora link preview/i,
  /showyoubot/i,
  /outbrain/i,
  /pinterest/i,
  /slackbot/i,
  /vkshare/i,
  /w3c_validator/i,
  /redditbot/i,
  /applebot/i,
  /whatsapp/i,
  /flipboard/i,
  /tumblr/i,
  /bitlybot/i,
  /skypeuripreview/i,
  /nuzzel/i,
  /discordbot/i,
  /qwantify/i,
  /pinterestbot/i,
  /bitrix link preview/i,
  /xing-contenttabreceiver/i,
  /chrome-lighthouse/i,
  /telegrambot/i,
  /phantomjs/i,
  /headlesschrome/i,
  /headlessfirefox/i,
  /selenium/i,
  /puppeteer/i,
  /playwright/i,
];

function getOrCreateSessionId(): string {
  if (typeof localStorage === "undefined") return crypto.randomUUID?.() ?? "ssr";
  let id = localStorage.getItem(PRESENCE_STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID?.() ?? `fallback-${Date.now()}`;
    localStorage.setItem(PRESENCE_STORAGE_KEY, id);
  }
  return id;
}

function detectBot(): boolean {
  if (typeof navigator === "undefined") return false;
  if (navigator.webdriver === true) return true;
  const ua = navigator.userAgent ?? "";
  if (BOT_UA_PATTERNS.some((p) => p.test(ua))) return true;
  if (Array.isArray(navigator.languages) && navigator.languages.length === 0) return true;
  return false;
}

type Counts = { people: number; bots: number; byState: Record<string, number> };

const PING_INTERVAL_MS = 30_000;
/** Two missed pongs: the connection is dead even if the browser hasn't noticed. */
const PONG_TIMEOUT_MS = 70_000;
const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

function presenceUrl(): string {
  const base = ((import.meta.env.VITE_HMC_API_BASE_URL as string | undefined) || "https://api.heresmychurch.com").replace(/\/$/, "");
  return `${base.replace(/^http/, "ws")}/presence`;
}

function isCounts(v: any): v is Counts {
  return !!v && typeof v.people === "number" && typeof v.bots === "number" && !!v.byState && typeof v.byState === "object";
}

export function useActiveUsers(viewingState: string | null = null): Counts {
  const [counts, setCounts] = useState<Counts>({ people: 0, bots: 0, byState: {} });
  const socketRef = useRef<WebSocket | null>(null);
  const viewingStateRef = useRef(viewingState);
  viewingStateRef.current = viewingState;

  const track = useCallback(() => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        type: "track",
        id: getOrCreateSessionId(),
        isBot: detectBot(),
        viewingState: viewingStateRef.current ?? null,
      }),
    );
  }, []);

  useEffect(() => {
    if (typeof WebSocket === "undefined") return;
    let disposed = false;
    let failures = 0;
    let lastPongAt = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer !== undefined) return;
      const ceiling = Math.min(RECONNECT_MAX_MS, RECONNECT_MIN_MS * 2 ** failures);
      failures += 1;
      // Jittered so a deploy or outage doesn't reconnect every visitor at the same moment.
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined;
        connect();
      }, ceiling / 2 + Math.random() * (ceiling / 2));
    };

    const connect = () => {
      if (disposed) return;
      let ws: WebSocket;
      try {
        ws = new WebSocket(presenceUrl());
      } catch {
        scheduleReconnect();
        return;
      }
      socketRef.current = ws;
      ws.onopen = () => {
        failures = 0;
        lastPongAt = Date.now();
        track();
      };
      ws.onmessage = (event) => {
        lastPongAt = Date.now();
        if (event.data === "pong" || typeof event.data !== "string") return;
        try {
          const next = JSON.parse(event.data);
          if (isCounts(next)) setCounts(next);
        } catch {
          /* ignore a malformed frame */
        }
      };
      ws.onclose = () => {
        if (socketRef.current === ws) socketRef.current = null;
        scheduleReconnect();
      };
      ws.onerror = () => ws.close();
    };

    // Re-announce, or reconnect straight away, when a frozen tab or dropped network comes back
    // (mobile browsers freeze sockets when backgrounded; cellular handoffs drop them silently).
    const revive = () => {
      const ws = socketRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        track();
      } else if (!ws) {
        if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
        failures = 0;
        connect();
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") revive();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", revive);

    const heartbeat = setInterval(() => {
      const ws = socketRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      if (Date.now() - lastPongAt > PONG_TIMEOUT_MS) {
        ws.close();
        return;
      }
      ws.send("ping");
    }, PING_INTERVAL_MS);

    connect();

    return () => {
      disposed = true;
      clearInterval(heartbeat);
      if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", revive);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [track]);

  // When viewingState changes, re-announce presence so our byState is accurate
  useEffect(() => {
    track();
  }, [viewingState, track]);

  return counts;
}
