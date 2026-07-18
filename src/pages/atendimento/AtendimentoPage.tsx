import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Search,
  Send,
  Hand,
  CheckCircle,
  MessageCircle,
  Bot,
  Headphones,
  RefreshCw,
  ArrowLeft,
  PanelRight,
  ChevronDown,
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

type StatusFilter = "all" | "pending" | "human" | "bot";

const POLL_INTERVAL_MS = 15000;

const STATUS_META: Record<string, { label: string; dot: string }> = {
  pending: { label: "Pendente", dot: "#ca8a04" },
  human:   { label: "Em atendimento", dot: "#2563eb" },
  bot:     { label: "Com o bot", dot: "#16a34a" },
};

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
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function waitingMin(iso: string) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

function msgTime(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

const AtendimentoPage: React.FC = () => {
  const { user } = useAuth();
  const isProfessional = user?.currentRole === "professional";

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [professionalFilter, setProfessionalFilter] = useState("all");

  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [showPatientPanel, setShowPatientPanel] = useState(false);

  const [draft, setDraft] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

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
    if (!selectedPhone) { setMessages([]); return; }
    setActionError("");
    fetchMessages(selectedPhone, { showSpinner: true });
    const id = setInterval(() => fetchMessages(selectedPhone), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [selectedPhone, fetchMessages]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
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

  // Unique professionals for filter
  const professionals = Array.from(
    new Set(conversations.map((c) => c.professional_name).filter(Boolean))
  ) as string[];

  const counts = {
    all: conversations.filter((c) => isProfessional || c.status !== "bot").length,
    pending: conversations.filter((c) => c.status === "pending").length,
    human: conversations.filter((c) => c.status === "human").length,
    bot: conversations.filter((c) => c.status === "bot").length,
  };

  const filteredConversations = conversations.filter((c) => {
    if (!isProfessional && c.status === "bot") return false;
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (professionalFilter !== "all" && c.professional_name !== professionalFilter) return false;
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

  const statusTabs: { key: StatusFilter; label: string; count?: number }[] = [
    { key: "all", label: "Todas" },
    { key: "pending", label: "Pendentes", count: counts.pending },
    { key: "human", label: "Em atendimento", count: counts.human },
    ...(isProfessional ? [{ key: "bot" as StatusFilter, label: "Pelo bot", count: counts.bot }] : []),
  ];

  // Waiting bar
  const lastMsg = messages[messages.length - 1];
  const isWaiting = !!(lastMsg && lastMsg.actor === "patient" && selected && selected.status !== "bot");
  const waitingMins = isWaiting && lastMsg ? waitingMin(lastMsg.created_at) : 0;

  const openCount = counts.pending + counts.human;

  return (
    <div className="-m-4 md:-m-6 flex overflow-hidden" style={{ height: "calc(100vh - 6rem)" }}>

      {/* ══════════════ SIDEBAR ══════════════ */}
      <div
        className={`flex flex-col border-r border-gray-200 bg-white ${
          mobileShowChat ? "hidden md:flex" : "flex w-full"
        }`}
        style={{ width: "400px", minWidth: "340px", flexShrink: 0 }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 pb-3.5 pt-[18px]">
          <div>
            <div className="text-[20px] font-bold leading-tight tracking-tight text-gray-900">
              Atendimento
            </div>
            <div className="mt-0.5 text-[12.5px] font-medium text-gray-700">
              {openCount === 1
                ? "1 conversa precisando de atenção"
                : `${openCount} conversas precisando de atenção`}
            </div>
          </div>
          <button
            onClick={fetchConversations}
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50"
          >
            <RefreshCw size={15} />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 pb-3.5">
          <div className="relative">
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            >
              <circle cx="11" cy="11" r="7" stroke="#9ca3af" strokeWidth="2" />
              <path d="M21 21l-4-4" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou número"
              className="h-[38px] w-full rounded-lg border border-gray-200 bg-gray-50 pl-[34px] pr-3 text-[13.5px] text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-300"
            />
          </div>
        </div>

        {/* Status tabs — underline style */}
        <div className="flex gap-[18px] border-b border-gray-200 px-5">
          {statusTabs.map((tab) => {
            const active = statusFilter === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                style={{
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: "10px 0 9px",
                  fontSize: "13.5px",
                  fontWeight: active ? 700 : 500,
                  color: active ? "#c11c22" : "#6b7280",
                  borderBottom: active ? "2px solid #c11c22" : "2px solid transparent",
                  whiteSpace: "nowrap",
                }}
              >
                {tab.label}
                {tab.count !== undefined && (
                  <span
                    style={{
                      marginLeft: "5px",
                      fontSize: "11.5px",
                      fontWeight: 600,
                      color: active ? "#c11c22" : "#9ca3af",
                    }}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Professional filter */}
        {professionals.length > 1 && (
          <div className="relative px-5 py-3">
            <select
              value={professionalFilter}
              onChange={(e) => setProfessionalFilter(e.target.value)}
              className="h-[38px] w-full appearance-none rounded-lg border border-gray-200 bg-gray-50 pl-3 pr-8 text-[13px] font-semibold text-gray-700 outline-none"
            >
              <option value="all">Todos os profissionais</option>
              {professionals.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <ChevronDown
              size={13}
              className="pointer-events-none absolute right-8 top-1/2 -translate-y-1/2 text-gray-500"
            />
          </div>
        )}

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto border-t border-gray-100">
          {isLoading ? (
            <div className="flex h-20 items-center justify-center text-sm text-gray-400">
              Carregando...
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="px-5 py-10 text-center text-[13.5px] text-gray-500">
              Nenhuma conversa encontrada.
            </div>
          ) : (
            filteredConversations.map((c) => {
              const isActive = c.phone === selectedPhone;
              const name = displayName(c);
              const meta = STATUS_META[c.status];
              const isPending = c.status === "pending";
              return (
                <div
                  key={c.phone}
                  onClick={() => selectConversation(c.phone)}
                  className="relative flex cursor-pointer items-start gap-3 border-b border-gray-100 px-5 py-3 transition-colors hover:bg-gray-50"
                  style={{ background: isActive ? "#fff8f8" : undefined }}
                >
                  {/* Accent bar */}
                  {isActive && (
                    <div
                      className="absolute bottom-0 left-0 top-0 w-[3px] rounded-r bg-[#c11c22]"
                    />
                  )}
                  {/* Avatar */}
                  <div
                    className="mt-[13px] flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[13.5px] font-bold text-gray-700"
                  >
                    {getInitials(name)}
                  </div>
                  {/* Content */}
                  <div className="min-w-0 flex-1 py-[13px] pr-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className="truncate text-[14.5px] font-semibold text-gray-900"
                      >
                        {name}
                      </span>
                      <span
                        className="shrink-0 text-[11px]"
                        style={{ color: "#9ca3af" }}
                      >
                        {relativeTime(c.last_message_at)}
                      </span>
                    </div>
                    <div
                      className="mt-[3px] flex items-center gap-[6px] text-[12px] text-gray-500"
                    >
                      <span className="truncate">{c.professional_name?.split(" ")[0]}</span>
                      <span
                        className="inline-block h-[6px] w-[6px] shrink-0 rounded-full"
                        style={{ background: meta?.dot }}
                      />
                      <span className="shrink-0">{meta?.label}</span>
                    </div>
                    {isPending && (
                      <div
                        className="mt-1 text-[11px] font-bold"
                        style={{ color: waitingMin(c.last_message_at) >= 5 ? "#c11c22" : "#ca8a04" }}
                      >
                        Sem resposta há {waitingMin(c.last_message_at)}{" "}
                        {waitingMin(c.last_message_at) === 1 ? "minuto" : "minutos"}
                      </div>
                    )}
                    <div className="mt-[5px] flex items-center justify-between gap-2">
                      <p className="truncate text-[13px] text-gray-500">{c.last_message}</p>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {error && (
          <div className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-600">
            {error}
          </div>
        )}
      </div>

      {/* ══════════════ CHAT PANEL ══════════════ */}
      {!selected ? (
        <div
          className="hidden flex-1 flex-col items-center justify-center gap-[10px] text-gray-400 md:flex"
          style={{ background: "#f9fafb" }}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
            <path
              d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"
              stroke="#d1d5db"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
          <div className="text-[14.5px]">Selecione uma conversa para começar</div>
        </div>
      ) : (
        <div
          className={`flex flex-1 min-h-0 min-w-0 ${mobileShowChat ? "flex" : "hidden md:flex"}`}
          style={{ background: "#f9fafb" }}
        >
          {/* Chat column */}
          <div className="flex flex-1 flex-col min-h-0 min-w-0" style={{ minWidth: 480 }}>
            {/* Chat header */}
            <div
              className="flex h-16 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-5"
            >
              {/* Back (mobile) */}
              <button
                onClick={() => setMobileShowChat(false)}
                className="mr-1 flex h-[34px] w-[34px] items-center justify-center rounded-lg border-none bg-transparent text-gray-600 hover:bg-gray-100 md:hidden"
              >
                <ArrowLeft size={19} />
              </button>
              {/* Avatar */}
              <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-gray-100 text-[13px] font-bold text-gray-700">
                {getInitials(displayName(selected))}
              </div>
              {/* Name + meta */}
              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="truncate text-[15px] font-bold text-gray-900">
                  {formatPhone(selected.phone)}
                </div>
                <div className="flex items-center gap-[6px] text-[11px] text-gray-500">
                  <span className="truncate">{selected.professional_name}</span>
                  <span
                    className="inline-block h-[5px] w-[5px] shrink-0 rounded-full"
                    style={{ background: STATUS_META[selected.status]?.dot }}
                  />
                  <span className="shrink-0">{STATUS_META[selected.status]?.label}</span>
                </div>
              </div>
              {/* Actions */}
              <div className="flex shrink-0 items-center gap-2">
                {(selected.status === "pending" || selected.status === "bot") && (
                  <button
                    onClick={handleTakeover}
                    disabled={actionLoading}
                    className="h-9 rounded-lg border border-[#c11c22] bg-white px-3.5 text-[13px] font-semibold text-[#c11c22] transition-colors hover:bg-[#fff5f5] disabled:opacity-60"
                  >
                    Assumir
                  </button>
                )}
                {selected.status === "human" && (
                  <button
                    onClick={handleRelease}
                    disabled={actionLoading}
                    className="h-9 rounded-lg border border-gray-300 bg-white px-3.5 text-[13px] font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
                  >
                    Concluir
                  </button>
                )}
                {/* Patient panel toggle */}
                <button
                  onClick={() => setShowPatientPanel((v) => !v)}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border transition-colors"
                  style={{
                    border: showPatientPanel ? "1px solid #c11c22" : "1px solid #e5e7eb",
                    background: showPatientPanel ? "#fff5f5" : "#fff",
                    color: showPatientPanel ? "#c11c22" : "#374151",
                  }}
                >
                  <PanelRight size={17} />
                </button>
              </div>
            </div>

            {/* Waiting bar */}
            {isWaiting && (
              <div
                className="flex shrink-0 items-center gap-[6px] border-b border-gray-200 px-5 py-[6px] text-[11.5px] font-semibold"
                style={{
                  background: waitingMins >= 5 ? "#fff5f5" : "#fef9c3",
                  color: waitingMins >= 5 ? "#c11c22" : "#ca8a04",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <circle
                    cx="12"
                    cy="12"
                    r="9"
                    stroke={waitingMins >= 5 ? "#c11c22" : "#ca8a04"}
                    strokeWidth="2"
                  />
                  <path
                    d="M12 7v5l3.5 2"
                    stroke={waitingMins >= 5 ? "#c11c22" : "#ca8a04"}
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
                Sem resposta há {waitingMins} {waitingMins === 1 ? "minuto" : "minutos"} · tempo médio de atendimento: 6 min
              </div>
            )}

            {/* Messages */}
            <div
              ref={scrollRef}
              className="flex flex-1 flex-col overflow-y-auto overflow-x-hidden"
              style={{ padding: "18px 0 6px" }}
            >
              <div
                className="flex w-full flex-1 flex-col justify-end"
                style={{ maxWidth: 840, padding: "0 24px", margin: "0 auto", boxSizing: "border-box" }}
              >
                {messagesLoading ? (
                  <div className="flex flex-1 items-center justify-center">
                    <p className="rounded-lg bg-white/70 px-4 py-2 text-sm text-gray-500 shadow-sm backdrop-blur">
                      Carregando histórico...
                    </p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center">
                    <p className="rounded-lg bg-white/70 px-4 py-2 text-sm text-gray-500 shadow-sm backdrop-blur">
                      Sem mensagens nesta conversa.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* "Hoje" separator */}
                    <div
                      className="mb-3.5 mt-0.5 self-center rounded-lg px-3.5 py-[5px] text-[11.5px] font-bold text-gray-600"
                      style={{ background: "#eef0f2" }}
                    >
                      Hoje
                    </div>

                    {messages.map((m, idx) => {
                      const isSystem = m.actor === "system";
                      const isPatient = m.actor === "patient";
                      const isBot = m.actor === "ai";
                      const isHuman = m.actor === "human";
                      const isOutgoing = isBot || isHuman;

                      const prev = messages[idx - 1];
                      const next = messages[idx + 1];
                      const showLabel = !isSystem && (!prev || prev.actor !== m.actor);
                      const isLastInGroup = !next || next.actor !== m.actor;

                      if (isSystem) {
                        return (
                          <div
                            key={m.id}
                            className="my-2.5 self-center rounded-lg px-3.5 py-[6px] text-[12px] font-semibold text-gray-500"
                            style={{ background: "#f3f4f6" }}
                          >
                            {m.text}
                          </div>
                        );
                      }

                      const baseR = 12;
                      const tailR = 4;
                      const borderRadius = isPatient
                        ? `${showLabel ? tailR : baseR}px ${baseR}px ${baseR}px ${isLastInGroup ? tailR : baseR}px`
                        : `${baseR}px ${showLabel ? tailR : baseR}px ${isLastInGroup ? tailR : baseR}px ${baseR}px`;

                      const bubbleBg = isPatient ? "#ffffff" : isBot ? "#eef2f7" : "#fff5f5";
                      const labelColor = isPatient ? "#6b7280" : isBot ? "#3b5169" : "#9a151a";
                      const senderLabel = isBot ? "Bot" : isHuman ? "Você" : "Paciente";

                      return (
                        <div
                          key={m.id}
                          className="flex w-full"
                          style={{ marginTop: showLabel && idx > 0 ? 10 : 2 }}
                        >
                          <div
                            style={{
                              maxWidth: "62%",
                              marginLeft: isPatient ? 0 : "auto",
                              padding: "9px 13px",
                              borderRadius,
                              background: bubbleBg,
                              border: isBot ? "1px solid #dbe3ec" : "1px solid #e5e7eb",
                              boxShadow: "0 1px 2px rgba(0,0,0,.04)",
                            }}
                          >
                            {showLabel && (
                              <div
                                className="mb-[3px] flex items-center gap-1 text-[10.5px] font-bold"
                                style={{ color: labelColor }}
                              >
                                {isHuman ? <Headphones size={10} /> : isBot ? <Bot size={10} /> : null}
                                {senderLabel}
                              </div>
                            )}
                            {m.text && (
                              <div className="whitespace-pre-wrap text-[14px] leading-[1.45] text-gray-900">
                                {m.text}
                              </div>
                            )}
                            <div className="mt-1 flex items-center justify-end gap-1">
                              <span className="text-[10.5px] text-gray-400">{msgTime(m.created_at)}</span>
                              {isOutgoing && (
                                <svg width="14" height="10" viewBox="0 0 16 11" fill="none">
                                  <path
                                    d="M1 5.5L4.5 9L11 1.5"
                                    stroke={isLastInGroup ? "#2563eb" : "#9ca3af"}
                                    strokeWidth="1.6"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                  <path
                                    d="M5.5 5.5L9 9L15.5 1.5"
                                    stroke={isLastInGroup ? "#2563eb" : "#9ca3af"}
                                    strokeWidth="1.6"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                    <div style={{ height: 8 }} />
                  </>
                )}
              </div>
            </div>

            {/* Composer */}
            <div className="shrink-0 border-t border-gray-200 bg-white py-3">
              <div className="mx-auto w-full px-6" style={{ maxWidth: 840, boxSizing: "border-box" }}>
                {actionError && <p className="mb-1.5 text-xs text-red-600">{actionError}</p>}
                {selected.status === "pending" ? (
                  <div className="flex items-center justify-center gap-3">
                    <p className="text-sm text-gray-500">Assuma a conversa para responder.</p>
                    <button
                      onClick={handleTakeover}
                      disabled={actionLoading}
                      className="flex items-center gap-1.5 rounded-lg bg-[#c11c22] px-4 py-2 text-sm font-semibold text-white hover:bg-[#9a151a] disabled:opacity-60"
                    >
                      <Hand size={13} />
                      Assumir
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSend} className="flex items-center gap-2">
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); handleSend(e); }
                      }}
                      placeholder="Digite sua resposta…"
                      className="h-11 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3.5 text-[14px] text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-300"
                    />
                    <button
                      type="submit"
                      disabled={actionLoading || !draft.trim()}
                      className="flex h-11 items-center gap-2 rounded-lg bg-[#c11c22] px-[18px] text-[14px] font-semibold text-white transition-colors hover:bg-[#9a151a] disabled:opacity-60"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M3 11l18-8-8 18-2-8-8-2z" stroke="white" strokeWidth="2" strokeLinejoin="round" fill="white" />
                      </svg>
                      Enviar
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>

          {/* Patient panel */}
          {showPatientPanel && (
            <div className="flex w-[300px] shrink-0 flex-col overflow-y-auto border-l border-gray-200 bg-white p-5">
              <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[.04em] text-gray-400">
                Paciente
              </div>
              <div className="text-[15px] font-bold text-gray-900">{displayName(selected)}</div>

              <div className="mt-2.5 flex flex-col gap-2">
                <div>
                  <span className="text-[11px] font-medium text-gray-400">Telefone</span>
                  <br />
                  <span className="text-[13px] font-semibold text-gray-900">
                    {formatPhone(selected.phone)}
                  </span>
                </div>
                {selected.professional_name && (
                  <div>
                    <span className="text-[11px] font-medium text-gray-400">Profissional</span>
                    <br />
                    <span className="text-[13px] font-semibold text-gray-900">
                      {selected.professional_name}
                    </span>
                  </div>
                )}
                {selected.assigned_to && (
                  <div>
                    <span className="text-[11px] font-medium text-gray-400">Atendente</span>
                    <br />
                    <span className="text-[13px] font-semibold text-gray-900">
                      {selected.assigned_to}
                    </span>
                  </div>
                )}
              </div>

              <div className="my-4 h-px bg-gray-100" />
              <div className="mb-2 text-[11px] font-bold uppercase tracking-[.04em] text-gray-400">
                Situação
              </div>
              <div className="flex items-center gap-1.5 text-[13px] font-semibold text-gray-900">
                <span
                  className="inline-block h-[6px] w-[6px] rounded-full"
                  style={{ background: STATUS_META[selected.status]?.dot }}
                />
                {STATUS_META[selected.status]?.label}
              </div>

              <div className="my-4 h-px bg-gray-100" />
              <div className="mb-2 text-[11px] font-bold uppercase tracking-[.04em] text-gray-400">
                Mensagens nesta conversa
              </div>
              <div className="flex flex-col gap-2 text-[12.5px]">
                <div className="flex justify-between">
                  <span className="text-gray-500">Total</span>
                  <span className="font-semibold text-gray-900">{messages.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Do paciente</span>
                  <span className="font-semibold text-gray-900">
                    {messages.filter((m) => m.actor === "patient").length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Do bot</span>
                  <span className="font-semibold text-gray-900">
                    {messages.filter((m) => m.actor === "ai").length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Da equipe</span>
                  <span className="font-semibold text-gray-900">
                    {messages.filter((m) => m.actor === "human").length}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AtendimentoPage;
