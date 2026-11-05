/**
 * Live "N people with you now" counts: one global Durable Object (replaces Supabase Realtime presence).
 *
 * Uses hibernating WebSockets, so idle connections cost nothing. "ping" is answered by the runtime
 * without waking the object. Client messages schedule a debounced alarm that counts visitors and
 * broadcasts `{people, bots, byState}`. While anyone is connected, a slower alarm sweeps out sockets
 * that went silent, which is how dropped phones and laptops leave the count.
 */
import { DurableObject } from "cloudflare:workers";

const BROADCAST_DEBOUNCE_MS = 1_500;
const SWEEP_INTERVAL_MS = 15_000;
/** Clients ping every 30 s, but browsers throttle hidden tabs' timers to once a minute, so stay above that. */
const SILENT_LIMIT_MS = 75_000;
/** High enough for a church or office behind one IP; stops one client filling the room. */
const MAX_SOCKETS_PER_IP = 50;
const MAX_MESSAGE_CHARS = 300;
const ID_RE = /^[A-Za-z0-9-]{1,64}$/;
/** Broadcast to every visitor as a map key, so only a region code may get through. */
const STATE_RE = /^[A-Z0-9-]{1,10}$/;

type Visitor = {
  id: string | null;
  isBot: boolean;
  viewingState: string | null;
  lastMessageAt: number;
  /** Hasn't received counts yet. */
  fresh: boolean;
};

async function hashIp(ip: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  return Array.from(new Uint8Array(digest).slice(0, 12), (b) => b.toString(16).padStart(2, "0")).join("");
}

export class PresenceRoom extends DurableObject {
  /** In memory only: after hibernation the next alarm rebroadcasts once, which is harmless. */
  private lastPayload: string | null = null;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env as never);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request: Request): Promise<Response> {
    const ipTag = await hashIp(request.headers.get("cf-connecting-ip") || "unknown");
    if (this.ctx.getWebSockets(ipTag).length >= MAX_SOCKETS_PER_IP) {
      return new Response("Too many connections", { status: 429 });
    }
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [ipTag]);
    const visitor: Visitor = { id: null, isBot: false, viewingState: null, lastMessageAt: Date.now(), fresh: true };
    server.serializeAttachment(visitor);
    await this.scheduleAlarm(SWEEP_INTERVAL_MS);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string" || message.length > MAX_MESSAGE_CHARS) {
      ws.close(1008, "Invalid message");
      return;
    }
    let body: any;
    try {
      body = JSON.parse(message);
    } catch {
      ws.close(1008, "Invalid message");
      return;
    }
    if (body?.type !== "track" || typeof body.id !== "string" || !ID_RE.test(body.id)) {
      ws.close(1008, "Invalid message");
      return;
    }
    const prev = ws.deserializeAttachment() as Visitor;
    const viewingState = typeof body.viewingState === "string" && STATE_RE.test(body.viewingState) ? body.viewingState : null;
    ws.serializeAttachment({
      id: body.id,
      isBot: body.isBot === true,
      viewingState,
      lastMessageAt: Date.now(),
      fresh: prev?.fresh ?? true,
    } satisfies Visitor);
    await this.scheduleAlarm(BROADCAST_DEBOUNCE_MS);
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code);
    } catch {
      /* already closed */
    }
    await this.scheduleAlarm(BROADCAST_DEBOUNCE_MS);
  }

  async webSocketError(): Promise<void> {
    await this.scheduleAlarm(BROADCAST_DEBOUNCE_MS);
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    const open: Array<{ ws: WebSocket; visitor: Visitor }> = [];
    for (const ws of this.ctx.getWebSockets()) {
      const visitor = ws.deserializeAttachment() as Visitor;
      const lastPing = this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? 0;
      if (now - Math.max(visitor.lastMessageAt, lastPing) > SILENT_LIMIT_MS) {
        try {
          ws.close(1001, "Silent too long");
        } catch {
          /* already closed */
        }
        continue;
      }
      open.push({ ws, visitor });
    }

    // Unique ids, so a visitor with several tabs counts once.
    const people = new Set<string>();
    const bots = new Set<string>();
    const idsByState = new Map<string, Set<string>>();
    for (const { visitor } of open) {
      if (!visitor.id) continue;
      (visitor.isBot ? bots : people).add(visitor.id);
      if (!visitor.isBot && visitor.viewingState) {
        const ids = idsByState.get(visitor.viewingState) ?? new Set<string>();
        ids.add(visitor.id);
        idsByState.set(visitor.viewingState, ids);
      }
    }
    const byState: Record<string, number> = {};
    for (const [state, ids] of idsByState) byState[state] = ids.size;
    const payload = JSON.stringify({ people: people.size, bots: bots.size, byState });

    const changed = payload !== this.lastPayload;
    this.lastPayload = payload;
    for (const { ws, visitor } of open) {
      if (!changed && !(visitor.fresh && visitor.id)) continue;
      try {
        ws.send(payload);
        if (visitor.fresh && visitor.id) ws.serializeAttachment({ ...visitor, fresh: false });
      } catch {
        /* closing; the next sweep drops it */
      }
    }

    if (open.length) await this.ctx.storage.setAlarm(now + SWEEP_INTERVAL_MS);
  }

  /** Moves the alarm earlier if needed, never later, so constant messages can't starve a broadcast. */
  private async scheduleAlarm(delayMs: number): Promise<void> {
    const target = Date.now() + delayMs;
    const current = await this.ctx.storage.getAlarm();
    if (current === null || current > target) await this.ctx.storage.setAlarm(target);
  }
}

const ALLOWED_ORIGIN = [
  /^https:\/\/(www\.)?heresmychurch\.com$/,
  // Workers Builds previews of the site.
  /^https:\/\/([a-z0-9-]+-)?heresmychurch\.[a-z0-9-]+\.workers\.dev$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
];

/** Handles GET /presence: checks the request, then hands the upgrade to the single global room. */
export function handlePresence(request: Request, room: DurableObjectNamespace): Promise<Response> | Response {
  const origin = request.headers.get("Origin") || "";
  if (!ALLOWED_ORIGIN.some((re) => re.test(origin))) return new Response("Forbidden", { status: 403 });
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return new Response("Expected a WebSocket", { status: 426 });
  }
  return room.get(room.idFromName("global")).fetch(request);
}
