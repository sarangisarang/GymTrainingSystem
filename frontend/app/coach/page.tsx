"use client";

import { useEffect, useRef, useState } from "react";
import Protected from "@/components/Protected";
import { getApiBase, getToken } from "@/lib/api";

type CoachSource = { tag: string; label: string };

type CoachMeta = {
  confidence: number;
  sources: CoachSource[];
  low_confidence: boolean;
  warnings: string[];
};

type Message = {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  meta?: CoachMeta;
};

const STORAGE_KEY = "gym_coach_messages";

// Server emits a trailing SSE line `data: @@@META{json}` with the validated
// confidence + cited sources. Kept in sync with backend ai_coach.py.
const META_SENTINEL = "@@@META";

function loadMessages(): Message[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveMessages(msgs: Message[]) {
  const toSave = msgs.filter((m) => !m.streaming);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
}

const SUGGESTED_QUESTIONS = [
  "Wie ist mein Trainingsfortschritt in den letzten Wochen?",
  "Welche Muskeln vernachlässige ich?",
  "Warum stagniere ich beim Bankdrücken?",
  "Wie viel Volumen mache ich pro Woche?",
  "Bin ich übertrainiert?",
  "Was soll ich als nächstes verbessern?",
];

export default function CoachPage() {
  return (
    <Protected>
      <CoachInner />
    </Protected>
  );
}

function CoachInner() {
  const INITIAL_MESSAGE: Message = {
    role: "assistant",
    content:
      "Hallo! Ich bin dein persönlicher KI-Trainer 💪\n\nIch analysiere deine Trainingsdaten und gebe dir konkrete, personalisierte Empfehlungen. Stell mir eine Frage über dein Training!",
  };

  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = loadMessages();
    return saved.length > 0 ? saved : [INITIAL_MESSAGE];
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Persist to localStorage whenever messages change (skip streaming state)
  useEffect(() => {
    if (messages.some((m) => m.streaming)) return;
    saveMessages(messages);
  }, [messages]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setLoading(true);

    const assistantIndex = messages.length + 1;

    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "", streaming: true },
    ]);

    try {
      const base = getApiBase();
      const token = getToken();
      const res = await fetch(`${base}/ai/coach`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: trimmed }),
      });

      if (!res.ok) {
        const err = await res.text();
        let detail = err;
        try {
          detail = JSON.parse(err)?.detail ?? err;
        } catch {}
        setMessages((prev) =>
          prev.map((m, i) =>
            i === prev.length - 1
              ? { role: "assistant", content: `⚠️ Fehler: ${detail}`, streaming: false }
              : m
          )
        );
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let meta: CoachMeta | undefined;

      if (!reader) throw new Error("No response body");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") break;
          if (data.startsWith(META_SENTINEL)) {
            try {
              meta = JSON.parse(data.slice(META_SENTINEL.length));
            } catch {}
            continue;
          }
          fullText += data;
          setMessages((prev) =>
            prev.map((m, i) =>
              i === prev.length - 1
                ? { ...m, content: fullText, streaming: true }
                : m
            )
          );
        }
      }

      setMessages((prev) =>
        prev.map((m, i) =>
          i === prev.length - 1 ? { ...m, streaming: false, meta } : m
        )
      );
    } catch (e: unknown) {
      setMessages((prev) =>
        prev.map((m, i) =>
          i === prev.length - 1
            ? {
                role: "assistant",
                content: `⚠️ Verbindungsfehler: ${e instanceof Error ? e.message : "Unbekannter Fehler"}`,
                streaming: false,
              }
            : m
        )
      );
    } finally {
      setLoading(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  return (
    <div className="flex h-[calc(100vh-80px)] flex-col">
      {/* Header */}
      <div className="card mb-4 flex items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/20 text-2xl">
            🤖
          </div>
          <div>
            <h1 className="h1">KI-Coach</h1>
            <p className="muted mt-0.5">
              Personalisierte Empfehlungen basierend auf deinen Trainingsdaten
            </p>
          </div>
        </div>
        <button
          type="button"
          className="btn-ghost text-sm text-neutral-500 hover:text-red-400"
          onClick={() => {
            localStorage.removeItem(STORAGE_KEY);
            setMessages([INITIAL_MESSAGE]);
          }}
        >
          Chat löschen
        </button>
      </div>

      {/* Suggested questions — only shown at start */}
      {messages.length === 1 && (
        <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SUGGESTED_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-3 text-left text-sm text-neutral-300 transition hover:border-indigo-500/50 hover:bg-indigo-500/10 hover:text-neutral-100"
              onClick={() => sendMessage(q)}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {msg.role === "assistant" && (
              <div className="mr-3 mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-indigo-500/20 text-sm">
                🤖
              </div>
            )}
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-indigo-600 text-white"
                  : "border border-neutral-800 bg-neutral-900 text-neutral-100"
              }`}
            >
              <MessageContent content={msg.content} streaming={msg.streaming} />
              {msg.role === "assistant" && !msg.streaming && msg.meta && (
                <CoachMetaFooter meta={msg.meta} />
              )}
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {loading && messages[messages.length - 1]?.content === "" && (
          <div className="flex justify-start">
            <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-500/20 text-sm">
              🤖
            </div>
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 px-4 py-3">
              <span className="flex gap-1">
                <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-400" style={{ animationDelay: "0ms" }} />
                <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-400" style={{ animationDelay: "150ms" }} />
                <span className="h-2 w-2 animate-bounce rounded-full bg-indigo-400" style={{ animationDelay: "300ms" }} />
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="mt-4 flex gap-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-3">
        <textarea
          ref={textareaRef}
          className="flex-1 resize-none bg-transparent text-sm text-neutral-100 placeholder-neutral-500 outline-none"
          rows={2}
          placeholder="Frag deinen KI-Coach… (Enter zum Senden, Shift+Enter für neue Zeile)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />
        <button
          type="button"
          className="self-end rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40"
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || loading}
        >
          {loading ? "…" : "Senden"}
        </button>
      </div>
    </div>
  );
}

function MessageContent({
  content,
  streaming,
}: {
  content: string;
  streaming?: boolean;
}) {
  if (!content) return null;

  const lines = content.split("\n");
  return (
    <>
      {lines.map((line, i) => (
        <span key={i}>
          {line}
          {i < lines.length - 1 && <br />}
        </span>
      ))}
      {streaming && (
        <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-indigo-400" />
      )}
    </>
  );
}

function CoachMetaFooter({ meta }: { meta: CoachMeta }) {
  const { confidence, sources, low_confidence } = meta;

  const tone =
    confidence >= 75
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
      : confidence >= 50
        ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
        : "border-red-500/40 bg-red-500/10 text-red-300";

  return (
    <div className="mt-3 space-y-2 border-t border-neutral-800 pt-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}
          title="Wie stark die Antwort durch deine Trainingsdaten gedeckt ist."
        >
          🎯 Konfidenz: {confidence}%
        </span>
        {sources.length > 0 && (
          <span className="text-xs text-neutral-500">
            Quellen:{" "}
            {sources.map((s, i) => (
              <span key={s.tag}>
                <span className="text-neutral-400">
                  {s.tag} · {s.label}
                </span>
                {i < sources.length - 1 ? ", " : ""}
              </span>
            ))}
          </span>
        )}
      </div>
      {low_confidence && (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-300/90">
          ⚠️ Diese Antwort ist möglicherweise nicht vollständig durch deine
          Trainingsdaten gedeckt. Bitte kritisch prüfen, bevor du sie umsetzt.
        </p>
      )}
    </div>
  );
}
