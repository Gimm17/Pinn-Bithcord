/**
 * How the party client reaches its server.
 *
 * The desktop cannot use the browser's own `fetch` and `WebSocket`: WebView2
 * stamps every one of them with `Origin: http://tauri.localhost`, and the party
 * server's allowlist (`backend/config/config.go`, no wildcards) answers an
 * unknown origin with a 403 — the socket never even opens. Requests made in
 * Rust carry no Origin, exactly like the native Android client, so the desktop
 * goes through the Rust bridge instead.
 *
 * The browser keeps the plain implementations, moved here unchanged.
 */

import { isTauriDesktop } from '@/extension/useExtension';

export interface PartyResponse {
  status: number;
  body: string;
}

export interface PartyHandlers {
  onOpen(): void;
  onFrame(text: string): void;
  onClose(): void;
}

export interface PartyTransport {
  /** A JSON request to the party server. Rejects when the server is unreachable. */
  request(url: string, init: { method?: string; body?: string; headers?: Record<string, string> }): Promise<PartyResponse>;
  /** Opens the socket; frames arrive as strings, then onClose fires. */
  connect(url: string, token: string, handlers: PartyHandlers): void;
  send(text: string): void;
  close(): void;
}

type TauriGlobal = {
  core?: { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
  event?: { listen: (event: string, handler: (e: { payload: unknown }) => void) => Promise<() => void> };
};

function tauri(): TauriGlobal | null {
  if (typeof window === 'undefined') return null;
  return (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__ ?? null;
}

/** Frames arrive as `party-frame` events, closes as `party-closed` (src-tauri/src/party.rs). */
function desktopTransport(): PartyTransport {
  let unstoppers: (() => void)[] = [];
  // Connecting and closing are serialized: a retry must not register listeners
  // while its predecessor's are still live, or every frame is delivered twice.
  let chain: Promise<unknown> = Promise.resolve();

  const unlisten = () => {
    const held = unstoppers;
    unstoppers = [];
    held.forEach((stop) => stop());
  };

  return {
    async request(url, init) {
      const api = tauri();
      if (!api?.core?.invoke) throw new Error('Tauri invoke is not available');
      const response = (await api.core.invoke('bridge_party_http', {
        request: {
          url,
          method: init.method ?? 'GET',
          headers: init.headers ?? {},
          body: init.body ?? null,
        },
      })) as PartyResponse;
      return { status: response.status, body: response.body };
    },
    connect(url, token, handlers) {
      const api = tauri();
      if (!api?.core?.invoke) {
        handlers.onClose();
        return;
      }
      chain = chain.then(async () => {
        unlisten();
        // Listen before connecting: the welcome frame can arrive the moment the
        // handshake returns.
        if (api.event?.listen) {
          unstoppers.push(await api.event.listen('party-frame', (e) => handlers.onFrame(String(e.payload))));
          unstoppers.push(await api.event.listen('party-closed', () => handlers.onClose()));
        }
        try {
          // Resolves only once the handshake is done, so it stands in for onopen.
          await api.core!.invoke('bridge_party_connect', { url, token });
          handlers.onOpen();
        } catch {
          handlers.onClose();
        }
      });
    },
    send(text) {
      void tauri()?.core?.invoke('bridge_party_send', { text });
    },
    close() {
      chain = chain.then(async () => {
        unlisten();
        await tauri()?.core?.invoke('bridge_party_close').catch(() => undefined);
      });
    },
  };
}

function browserTransport(): PartyTransport {
  let socket: WebSocket | null = null;
  return {
    async request(url, init) {
      const response = await fetch(url, {
        method: init.method ?? 'GET',
        body: init.body,
        headers: init.headers,
      });
      return { status: response.status, body: await response.text() };
    },
    connect(url, token, handlers) {
      const ws = new WebSocket(url, ['bitchord.v1', `bitchord.token.${token}`]);
      socket = ws;
      ws.onopen = () => handlers.onOpen();
      ws.onmessage = (event) => handlers.onFrame(String(event.data));
      ws.onclose = () => {
        if (socket === ws) socket = null;
        handlers.onClose();
      };
    },
    send(text) {
      if (socket?.readyState === WebSocket.OPEN) socket.send(text);
    },
    close() {
      const held = socket;
      socket = null;
      if (held && held.readyState <= WebSocket.OPEN) held.close(1000, 'left');
    },
  };
}

let cached: PartyTransport | null = null;

export function partyTransport(): PartyTransport {
  cached ??= isTauriDesktop() ? desktopTransport() : browserTransport();
  return cached;
}
