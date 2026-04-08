import { useEffect, useRef, useState } from "react";

export type LiveEvent = {
  type: string;
  attrs?: Record<string, unknown>;
  name?: string;
  value?: number;
  labels?: Record<string, string>;
  receivedAt: number;
};

const MAX_EVENTS = 500;

export function useLiveFeed() {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    function connect() {
      const es = new EventSource("/api/live");
      esRef.current = es;

      es.onopen = () => setConnected(true);
      es.onerror = () => {
        setConnected(false);
        es.close();
        clearTimeout(reconnectRef.current);
        reconnectRef.current = setTimeout(connect, 3000);
      };

      const eventTypes = [
        "api_request",
        "tool_result",
        "user_prompt",
        "tool_decision",
        "api_error",
        "metric",
      ];

      for (const type of eventTypes) {
        es.addEventListener(type, (e: MessageEvent) => {
          try {
            const data = JSON.parse(e.data);
            const ev: LiveEvent = { type, receivedAt: Date.now(), ...data };
            setEvents((prev) => [ev, ...prev].slice(0, MAX_EVENTS));
          } catch {
            // ignore parse errors
          }
        });
      }
    }

    connect();
    return () => {
      clearTimeout(reconnectRef.current);
      esRef.current?.close();
    };
  }, []);

  return { events, connected };
}
