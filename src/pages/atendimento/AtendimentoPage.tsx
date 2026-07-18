import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Search,
  Send,
  Hand,
  CheckCircle,
  MessageCircle,
  Bot,
  Headphones,
  Phone,
  RefreshCw,
  ArrowLeft,
} from "lucide-react";
import { fetchWithAuth, getApiUrl } from "../../utils/apiHelpers";
import { useAuth } from "../../contexts/AuthContext";

type Conversation = {
  phone: string;
  patient_name: string | null;
  professional_id: number | null;
  professional_name: string | null;
  status: "pending" | "human" | "bot";
  last_message: string;
  last_message_at: string;
  assigned_to: string | null;
};

type Message = {
  id: number;
  direction: string;
  actor: "patient" | "ai" | "human" | string;
  actor_id: number | null;
  intent: string | null;
  step: string | null;
  text: string;
  created_at: string;
};

type LabelFilter = "all" | "pending" | "human" | "bot";

const POLL_INTERVAL_MS = 15000;

const AVATAR_COLORS = [
  "bg-rose-400",
  "bg-violet-400",
  "bg-sky-500",
  "bg-amber-400",
  "bg-emerald-500",
  "bg-pink-400",
  "bg-indigo-400",
  "bg-teal-500",
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatPhone(digits: string) {
  const d = String(digits || "").replace(/\D/g, "");
  const local = d.length > 11 && d.startsWith("55") ? d.slice(2) : d;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return digits;
}

function relativeTime(iso: string) {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function msgTime(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

const LABELS: { key: LabelFilter; label: string; activeClass: string }[] = [
  { key: "all", label: "Todas", activeClass: "bg-gray-200 text-gray-800 border-gray-300" },
  { key: "pending", label: "Pendentes", activeClass: "bg-amber-100 text-amber-800 border-amber-300" },
  { key: "human", label: "Em atendimento", activeClass: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  { key: "bot", label: "Bot", activeClass: "bg-sky-100 text-sky-800 border-sky-300" },
];

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending: { label: "Pendente", cls: "bg-amber-100 text-amber-700 border border-amber-200" },
  human: { label: "Atendimento", cls: "bg-emerald-100 text-emerald-700 border border-emerald-200" },
  bot: { label: "Bot", cls: "bg-sky-100 text-sky-700 border border-sky-200" },
};

const AtendimentoPage: React.FC = () => {
  const { user } = useAuth();
  const isProfessional = user?.currentRole === "professional";

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [labelFilter, setLabelFilter] = useState<LabelFilter>("all");

  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  // Mobile: show chat panel on top of list
  const [mobileShowChat, setMobileShowChat] = useState(false);

  const [draft, setDraft] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const selected = conversations.find((c) => c.phone === selectedPhone) ?? null;
  const apiUrl = getApiUrl();

  const fetchConversations = useCallback(async () => {
    try {
      setError("");
      const res = await fetchWithAuth(`${apiUrl}/webhook/whatsapp/conversations`, { method: "GET" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Erro ao carregar conversas");
      }
      setConversations(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar conversas");
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl]);

  const fetchMessages = useCallback(
    async (phone: string, { showSpinner = false } = {}) => {
      try {
        if (showSpinner) setMessagesLoading(true);
        const res = await fetchWithAuth(
          `${apiUrl}/webhook/whatsapp/conversation?phone=${encodeURIComponent(phone)}`,
          { method: "GET" }
        );
        if (!res.ok) throw new Error("Erro ao carregar a conversa");
        setMessages(await res.json());
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Erro ao carregar a conversa");
      } finally {
        if (showSpinner) setMessagesLoading(false);
      }
    },
    [apiUrl]
  );

  useEffect(() => {
    fetchConversations();
    const id = setInterval(fetchConversations, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchConversations]);

  useEffect(() => {
    if (!selectedPhone) {
      setMessages([]);
      return;
    }
    setActionError("");
    fetchMessages(selectedPhone, { showSpinner: true });
    const id = setInterval(() => fetchMessages(selectedPhone), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [selectedPhone, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const callAction = async (path: string, body: Record<string, unknown>) => {
    setActionLoading(true);
    setActionError("");
    try {
      const res = await fetchWithAuth(`${apiUrl}/webhook/whatsapp/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) throw new Error(data.message || "Não foi possível concluir a ação");
      return true;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Erro na ação");
      return false;
    } finally {
      setActionLoading(false);
    }
  };

  const handleTakeover = async () => {
    if (!selectedPhone) return;
    if (await callAction("takeover", { phone: selectedPhone }))
      await Promise.all([fetchConversations(), fetchMessages(selectedPhone)]);
  };

  const handleRelease = async () => {
    if (!selectedPhone) return;
    if (await callAction("release", { phone: selectedPhone }))
      await Promise.all([fetchConversations(), fetchMessages(selectedPhone)]);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!selectedPhone || !text) return;
    if (await callAction("send", { phone: selectedPhone, text })) {
      setDraft("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      await fetchMessages(selectedPhone);
    }
  };

  const selectConversation = (phone: string) => {
    setSelectedPhone(phone);
    setMobileShowChat(true);
  };

  const displayName = (c: Conversation) => c.patient_name || formatPhone(c.phone);

  const filteredConversations = conversations.filter((c) => {
    if (c.status === "bot" && !isProfessional) return false;
    if (labelFilter !== "all" && c.status !== labelFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        displayName(c).toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        (c.last_message || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const counts: Record<LabelFilter, number> = {
    all: conversations.filter((c) => isProfessional || c.status !== "bot").length,
    pending: conversations.filter((c) => c.status === "pending").length,
    human: conversations.filter((c) => c.status === "human").length,
    bot: conversations.filter((c) => c.status === "bot").length,
  };

  const visibleLabels = isProfessional ? LABELS : LABELS.filter((l) => l.key !== "bot");

  // Escapa o padding do MainLayout (p-4 md:p-6) e ocupa toda a altura disponível após a navbar (h-24 = 6rem)
  return (
    <div
      className="-m-4 md:-m-6 flex overflow-hidden"
      style={{ height: "calc(100vh - 6rem)" }}
    >
      {/* ═══════════ SIDEBAR ═══════════ */}
      <div
        className={`flex w-full flex-col border-r border-gray-200 bg-white md:w-[340px] md:flex-shrink-0 ${
          mobileShowChat ? "hidden md:flex" : "flex"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between bg-[#f0f2f5] px-4 py-3">
          <div className="flex items-center gap-2">
            <MessageCircle size={20} className="text-[#c11c22]" />
            <span className="font-semibold text-gray-700">Atendimento</span>
          </div>
          <button
            onClick={fetchConversations}
            title="Atualizar"
            className="rounded-full p-1.5 text-gray-500 transition-colors hover:bg-gray-200"
          >
            <RefreshCw size={15} />
          </button>
        </div>

        {/* Search */}
        <div className="bg-white px-3 pb-2 pt-2">
          <div className="flex items-center gap-2 rounded-lg bg-[#f0f2f5] px-3 py-1.5">
            <Search size={15} className="shrink-0 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar conversa..."
              className="w-full bg-transparent text-sm text-gray-700 placeholder-gray-400 outline-none"
            />
          </div>
        </div>

        {/* Etiquetas */}
        <div
          className="flex gap-1.5 overflow-x-auto bg-white px-3 pb-2.5"
          style={{ scrollbarWidth: "none" }}
        >
          {visibleLabels.map((l) => {
            const isActive = labelFilter === l.key;
            const count = counts[l.key];
            return (
              <button
                key={l.key}
                onClick={() => setLabelFilter(l.key)}
                className={`flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all ${
                  isActive
                    ? l.activeClass
                    : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
                }`}
              >
                {l.label}
                {count > 0 && (
                  <span
                    className={`rounded-full px-1.5 text-[10px] font-bold leading-tight ${
                      isActive ? "bg-white/70" : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="border-b border-gray-100" />

        {/* Lista de conversas */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex h-20 items-center justify-center">
              <p className="text-sm text-gray-400">Carregando...</p>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex h-24 flex-col items-center justify-center gap-2">
              <MessageCircle size={28} className="text-gray-300" />
              <p className="text-sm text-gray-400">Nenhuma conversa encontrada.</p>
            </div>
          ) : (
            filteredConversations.map((c) => {
              const isActive = c.phone === selectedPhone;
              const name = displayName(c);
              const badge = STATUS_BADGE[c.status];
              return (
                <button
                  key={c.phone}
                  onClick={() => selectConversation(c.phone)}
                  className={`flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-left transition-colors ${
                    isActive ? "bg-[#f0f2f5]" : "hover:bg-[#f5f6f6]"
                  }`}
                >
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${getAvatarColor(name)}`}
                  >
                    {getInitials(name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-[14px] font-[500] text-gray-900">{name}</span>
                      <span className="shrink-0 text-[11px] text-gray-400">
                        {relativeTime(c.last_message_at)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <p className="min-w-0 flex-1 truncate text-[12px] text-gray-500">
                        {c.last_message}
                      </p>
                      {badge && (
                        <span
                          className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium leading-tight ${badge.cls}`}
                        >
                          {badge.label}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {error && (
          <div className="border-t border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">
            {error}
          </div>
        )}
      </div>

      {/* ═══════════ PAINEL DE CHAT ═══════════ */}
      {!selected ? (
        <div
          className="hidden flex-1 flex-col items-center justify-center md:flex"
          style={{ backgroundColor: "#f0f2f5" }}
        >
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white shadow-md">
              <MessageCircle size={40} className="text-gray-300" />
            </div>
            <div>
              <p className="text-xl font-light text-gray-600">Atendimento</p>
              <p className="mt-1 text-sm text-gray-400">
                Selecione uma conversa para começar
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div
          className={`flex flex-1 flex-col overflow-hidden ${
            mobileShowChat ? "flex" : "hidden md:flex"
          }`}
        >
          {/* Header do chat */}
          <div className="flex items-center justify-between border-b border-gray-200 bg-[#f0f2f5] px-4 py-2.5">
            <div className="flex items-center gap-3">
              {/* Voltar (mobile) */}
              <button
                onClick={() => setMobileShowChat(false)}
                className="mr-1 rounded-full p-1 text-gray-500 hover:bg-gray-200 md:hidden"
              >
                <ArrowLeft size={18} />
              </button>
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${getAvatarColor(displayName(selected))}`}
              >
                {getInitials(displayName(selected))}
              </div>
              <div>
                <p className="text-[14px] font-semibold text-gray-900">{displayName(selected)}</p>
                <p className="flex items-center gap-1 text-[11px] text-gray-500">
                  <Phone size={9} />
                  {formatPhone(selected.phone)}
                  {selected.professional_name && ` · ${selected.professional_name}`}
                  {selected.assigned_to && ` · ${selected.assigned_to}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {(() => {
                const badge = STATUS_BADGE[selected.status];
                return badge ? (
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge.cls}`}>
                    {badge.label}
                  </span>
                ) : null;
              })()}
              {selected.status === "pending" && (
                <button
                  onClick={handleTakeover}
                  disabled={actionLoading}
                  className="flex items-center gap-1.5 rounded-full bg-[#c11c22] px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-[#9a151a] disabled:opacity-60"
                >
                  <Hand size={14} />
                  Assumir
                </button>
              )}
              {selected.status === "human" && (
                <button
                  onClick={handleRelease}
                  disabled={actionLoading}
                  className="flex items-center gap-1.5 rounded-full border border-emerald-300 bg-white px-4 py-1.5 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-60"
                >
                  <CheckCircle size={14} />
                  Concluir
                </button>
              )}
            </div>
          </div>

          {/* Mensagens */}
          <div
            className="flex-1 overflow-y-auto px-6 py-4"
            style={{ backgroundColor: "#efeae2" }}
          >
            {messagesLoading ? (
              <div className="flex h-full items-center justify-center">
                <p className="rounded-lg bg-white/70 px-4 py-2 text-sm text-gray-500 shadow-sm backdrop-blur">
                  Carregando histórico...
                </p>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <p className="rounded-lg bg-white/70 px-4 py-2 text-sm text-gray-500 shadow-sm backdrop-blur">
                  Sem mensagens nesta conversa.
                </p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {messages.map((m, idx) => {
                  const isPatient = m.actor === "patient";
                  const isHuman = m.actor === "human";
                  const prevActor = idx > 0 ? messages[idx - 1].actor : null;
                  const showLabel = !isPatient && prevActor !== m.actor;
                  const gap = prevActor !== m.actor && idx > 0;
                  return (
                    <div
                      key={m.id}
                      className={`flex ${isPatient ? "justify-start" : "justify-end"} ${gap ? "mt-3" : ""}`}
                    >
                      <div
                        className={`relative max-w-[65%] rounded-xl px-3 py-1.5 shadow-sm ${
                          isPatient
                            ? "rounded-tl-sm bg-white text-gray-800"
                            : isHuman
                            ? "rounded-tr-sm bg-[#d9fdd3] text-gray-800"
                            : "rounded-tr-sm bg-[#dbeafe] text-gray-800"
                        }`}
                      >
                        {showLabel && (
                          <p
                            className={`mb-0.5 flex items-center gap-1 text-[11px] font-semibold ${
                              isHuman ? "text-[#06a700]" : "text-blue-600"
                            }`}
                          >
                            {isHuman ? (
                              <>
                                <Headphones size={10} /> Atendente
                              </>
                            ) : (
                              <>
                                <Bot size={10} /> Bot
                              </>
                            )}
                          </p>
                        )}
                        <p className="whitespace-pre-wrap break-words text-[13.5px] leading-[1.45]">
                          {m.text}
                        </p>
                        <p className="mt-0.5 select-none text-right text-[10px] text-gray-400">
                          {msgTime(m.created_at)}
                        </p>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="border-t border-gray-200 bg-[#f0f2f5] px-4 py-2.5">
            {actionError && <p className="mb-1.5 text-xs text-red-600">{actionError}</p>}
            {selected.status === "pending" ? (
              <div className="flex items-center justify-center gap-3 py-1">
                <p className="text-sm text-gray-500">Assuma a conversa para responder.</p>
                <button
                  onClick={handleTakeover}
                  disabled={actionLoading}
                  className="flex items-center gap-1.5 rounded-full bg-[#c11c22] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#9a151a] disabled:opacity-60"
                >
                  <Hand size={13} />
                  Assumir
                </button>
              </div>
            ) : (
              <form onSubmit={handleSend} className="flex items-end gap-3">
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = Math.min(e.target.scrollHeight, 100) + "px";
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend(e);
                    }
                  }}
                  placeholder="Digite uma mensagem"
                  rows={1}
                  className="flex-1 resize-none rounded-xl border-0 bg-white px-4 py-2.5 text-[13.5px] text-gray-800 placeholder-gray-400 shadow-sm outline-none"
                  style={{ minHeight: "42px", maxHeight: "100px" }}
                />
                <button
                  type="submit"
                  disabled={actionLoading || !draft.trim()}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#c11c22] text-white shadow-sm transition-colors hover:bg-[#9a151a] disabled:opacity-50"
                >
                  <Send size={16} />
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AtendimentoPage;
