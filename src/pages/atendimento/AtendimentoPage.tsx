import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  MessageCircle,
  Send,
  Hand,
  CheckCircle,
  Clock,
  User,
  Bot,
  Headphones,
  RefreshCw,
} from "lucide-react";
import { fetchWithAuth, getApiUrl } from "../../utils/apiHelpers";

type Conversation = {
  phone: string;
  patient_name: string | null;
  professional_id: number | null;
  professional_name: string | null;
  status: "pending" | "human";
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

const POLL_INTERVAL_MS = 15000;

const formatPhone = (digits: string) => {
  const d = String(digits || "").replace(/\D/g, "");
  const local = d.length > 11 && d.startsWith("55") ? d.slice(2) : d;
  if (local.length === 11) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  if (local.length === 10) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  return digits;
};

const relativeTime = (iso: string) => {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return `há ${days} d`;
};

const actorLabel = (actor: string) => {
  if (actor === "patient") return "Paciente";
  if (actor === "human") return "Atendente";
  return "Bot";
};

const AtendimentoPage: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedPhone, setSelectedPhone] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const [draft, setDraft] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const selected = conversations.find((c) => c.phone === selectedPhone) || null;

  const apiUrl = getApiUrl();

  const fetchConversations = useCallback(async () => {
    try {
      setError("");
      const response = await fetchWithAuth(`${apiUrl}/webhook/whatsapp/conversations`, {
        method: "GET",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || "Erro ao carregar conversas");
      }
      setConversations(await response.json());
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
        const response = await fetchWithAuth(
          `${apiUrl}/webhook/whatsapp/conversation?phone=${encodeURIComponent(phone)}`,
          { method: "GET" }
        );
        if (!response.ok) throw new Error("Erro ao carregar a conversa");
        setMessages(await response.json());
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Erro ao carregar a conversa");
      } finally {
        if (showSpinner) setMessagesLoading(false);
      }
    },
    [apiUrl]
  );

  // Lista de conversas: carga inicial + polling leve.
  useEffect(() => {
    fetchConversations();
    const id = setInterval(fetchConversations, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchConversations]);

  // Histórico da conversa aberta: carga ao selecionar + polling enquanto aberta.
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

  // Rola para a última mensagem quando o histórico muda.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const callAction = async (path: string, body: Record<string, unknown>) => {
    setActionLoading(true);
    setActionError("");
    try {
      const response = await fetchWithAuth(`${apiUrl}/webhook/whatsapp/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.ok === false) {
        throw new Error(data.message || "Não foi possível concluir a ação");
      }
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
    if (await callAction("takeover", { phone: selectedPhone })) {
      await Promise.all([fetchConversations(), fetchMessages(selectedPhone)]);
    }
  };

  const handleRelease = async () => {
    if (!selectedPhone) return;
    if (await callAction("release", { phone: selectedPhone })) {
      await Promise.all([fetchConversations(), fetchMessages(selectedPhone)]);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!selectedPhone || !text) return;
    if (await callAction("send", { phone: selectedPhone, text })) {
      setDraft("");
      await fetchMessages(selectedPhone);
    }
  };

  const pending = conversations.filter((c) => c.status === "pending");
  const inService = conversations.filter((c) => c.status === "human");

  const displayName = (c: Conversation) => c.patient_name || formatPhone(c.phone);

  const renderList = (title: string, items: Conversation[], emptyText: string) => (
    <div>
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-gray-700">
        {title}
        <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-700">
          {items.length}
        </span>
      </h3>
      <div className="space-y-2">
        {items.length === 0 && <p className="px-1 text-xs text-gray-400">{emptyText}</p>}
        {items.map((c) => {
          const active = c.phone === selectedPhone;
          return (
            <button
              key={c.phone}
              onClick={() => setSelectedPhone(c.phone)}
              className={`w-full rounded-md border p-3 text-left transition-colors ${
                active
                  ? "border-red-300 bg-red-50"
                  : "border-gray-200 bg-white hover:bg-gray-50"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium text-gray-800">{displayName(c)}</span>
                <span className="flex shrink-0 items-center gap-1 text-xs text-gray-400">
                  <Clock size={12} />
                  {relativeTime(c.last_message_at)}
                </span>
              </div>
              {c.professional_name && (
                <p className="mt-0.5 text-xs text-gray-500">Profissional: {c.professional_name}</p>
              )}
              <p className="mt-1 truncate text-sm text-gray-600">{c.last_message}</p>
              {c.assigned_to && (
                <p className="mt-1 text-xs text-emerald-600">Atendendo: {c.assigned_to}</p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-800">
          <MessageCircle className="text-cyan-500" />
          Atendimento
        </h1>
        <button
          onClick={fetchConversations}
          className="flex items-center gap-1 rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
        >
          <RefreshCw size={14} />
          Atualizar
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Coluna de listas */}
        <div className="space-y-6 lg:col-span-1">
          {isLoading ? (
            <p className="text-sm text-gray-500">Carregando conversas...</p>
          ) : (
            <>
              {renderList("Pendentes", pending, "Nenhuma conversa pendente.")}
              {renderList("Em atendimento", inService, "Nenhuma conversa em atendimento.")}
            </>
          )}
        </div>

        {/* Painel da conversa */}
        <div className="lg:col-span-2">
          {!selected ? (
            <div className="flex h-80 items-center justify-center rounded-md border border-dashed border-gray-300 text-sm text-gray-400">
              Selecione uma conversa para ver o histórico.
            </div>
          ) : (
            <div className="flex h-[36rem] flex-col rounded-md border border-gray-200 bg-white">
              {/* Cabeçalho */}
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <div>
                  <p className="font-semibold text-gray-800">{displayName(selected)}</p>
                  <p className="text-xs text-gray-500">
                    {formatPhone(selected.phone)}
                    {selected.professional_name && ` · ${selected.professional_name}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {selected.status === "pending" ? (
                    <button
                      onClick={handleTakeover}
                      disabled={actionLoading}
                      className="flex items-center gap-1 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                    >
                      <Hand size={14} />
                      Assumir
                    </button>
                  ) : (
                    <button
                      onClick={handleRelease}
                      disabled={actionLoading}
                      className="flex items-center gap-1 rounded-md border border-emerald-300 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                    >
                      <CheckCircle size={14} />
                      Concluir
                    </button>
                  )}
                </div>
              </div>

              {/* Histórico */}
              <div className="flex-1 space-y-3 overflow-y-auto bg-gray-50 px-4 py-3">
                {messagesLoading ? (
                  <p className="text-sm text-gray-400">Carregando histórico...</p>
                ) : messages.length === 0 ? (
                  <p className="text-sm text-gray-400">Sem mensagens nesta conversa.</p>
                ) : (
                  messages.map((m) => {
                    const isPatient = m.actor === "patient";
                    const Icon = m.actor === "patient" ? User : m.actor === "human" ? Headphones : Bot;
                    return (
                      <div
                        key={m.id}
                        className={`flex ${isPatient ? "justify-start" : "justify-end"}`}
                      >
                        <div
                          className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                            isPatient
                              ? "bg-white text-gray-800 shadow-sm"
                              : m.actor === "human"
                              ? "bg-red-600 text-white"
                              : "bg-cyan-100 text-cyan-900"
                          }`}
                        >
                          <div className="mb-0.5 flex items-center gap-1 text-[11px] opacity-80">
                            <Icon size={11} />
                            {actorLabel(m.actor)}
                          </div>
                          <p className="whitespace-pre-wrap break-words">{m.text}</p>
                          <div className="mt-1 text-right text-[10px] opacity-70">
                            {new Date(m.created_at).toLocaleString("pt-BR")}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Composer */}
              <form onSubmit={handleSend} className="border-t border-gray-100 p-3">
                {actionError && (
                  <p className="mb-2 text-xs text-red-600">{actionError}</p>
                )}
                {selected.status === "pending" ? (
                  <p className="text-center text-xs text-gray-400">
                    Assuma a conversa para poder responder.
                  </p>
                ) : (
                  <div className="flex items-end gap-2">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSend(e);
                        }
                      }}
                      placeholder="Digite sua resposta..."
                      rows={1}
                      className="flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={actionLoading || !draft.trim()}
                      className="flex items-center gap-1 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                    >
                      <Send size={14} />
                      Enviar
                    </button>
                  </div>
                )}
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AtendimentoPage;
