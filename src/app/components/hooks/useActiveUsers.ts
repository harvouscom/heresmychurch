import { useState, useEffect, useRef, useCallback } from "react";
import { getSupabase } from "../../lib/supabase";

const CHANNEL_NAME = "active-users";
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

type PresencePayload = { id?: string; isBot?: boolean; viewingState?: string | null };

function countPeopleAndBots(state: Record<string, PresencePayload[]>): { people: number; bots: number } {
  const peopleIds = new Set<string>();
  const botIds = new Set<string>();
  for (const key of Object.keys(state)) {
    const payloads = state[key];
    if (!Array.isArray(payloads) || payloads.length === 0) continue;
    const first = payloads[0] as PresencePayload | undefined;
    const id = first?.id;
    if (typeof id !== "string") continue;
    if (first?.isBot) botIds.add(id);
    else peopleIds.add(id);
  }
  return { people: peopleIds.size, bots: botIds.size };
}

function countByState(state: Record<string, PresencePayload[]>): Record<string, number> {
  const idsByState: Record<string, Set<string>> = {};
  for (const key of Object.keys(state)) {
    const payloads = state[key];
    if (!Array.isArray(payloads) || payloads.length === 0) continue;
    const first = payloads[0] as PresencePayload | undefined;
    if (first?.isBot) continue;
    const id = first?.id;
    const stateAbbrev = first?.viewingState;
    if (typeof id === "string" && stateAbbrev && typeof stateAbbrev === "string") {
      if (!idsByState[stateAbbrev]) idsByState[stateAbbrev] = new Set();
      idsByState[stateAbbrev].add(id);
    }
  }
  const byState: Record<string, number> = {};
  for (const [stateAbbrev, ids] of Object.entries(idsByState)) {
    byState[stateAbbrev] = ids.size;
  }
  return byState;
}

export function useActiveUsers(viewingState: string | null = null): {
  people: number;
  bots: number;
  byState: Record<string, number>;
} {
  const [counts, setCounts] = useState({ people: 0, bots: 0, byState: {} as Record<string, number> });
  const channelRef = useRef<ReturnType<ReturnType<typeof getSupabase>["channel"]> | null>(null);
  const viewingStateRef = useRef(viewingState);
  viewingStateRef.current = viewingState;

  const retrack = useCallback(() => {
    const ch = channelRef.current;
    if (!ch) return;
    ch.track({
      id: getOrCreateSessionId(),
      isBot: detectBot(),
      viewingState: viewingStateRef.current ?? null,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const supabase = getSupabase();
    const channel = supabase.channel(CHANNEL_NAME);

    const updateCount = () => {
      const state = channel.presenceState() as Record<string, PresencePayload[]>;
      const { people, bots } = countPeopleAndBots(state);
      const byState = countByState(state);
      setCounts({ people, bots, byState });
    };

    channel
      .on("presence", { event: "sync" }, updateCount)
      .on("presence", { event: "join" }, updateCount)
      .on("presence", { event: "leave" }, updateCount)
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;
        await channel.track({
          id: getOrCreateSessionId(),
          isBot: detectBot(),
          viewingState: viewingStateRef.current ?? null,
        });
      });

    channelRef.current = channel;

    // Re-announce presence when the tab becomes visible again (handles mobile
    // browsers that freeze WebSocket connections when backgrounded / screen locked).
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") retrack();
    };

    // Re-announce when the device comes back online (handles cellular drops,
    // WiFi→cellular handoff, airplane mode toggle, etc.).
    const onOnline = () => retrack();

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);

    // Periodic heartbeat to recover from silent WebSocket drops that don't
    // fire any browser events (common on cellular networks with aggressive NAT).
    const heartbeat = setInterval(retrack, 30_000);

    return () => {
      clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
      void channel.untrack().then(() => {
        supabase.removeChannel(channel);
      });
      channelRef.current = null;
    };
  }, [retrack]);

  // When viewingState changes, re-announce presence so our byState is accurate
  useEffect(() => {
    retrack();
  }, [viewingState, retrack]);

  return counts;
}
