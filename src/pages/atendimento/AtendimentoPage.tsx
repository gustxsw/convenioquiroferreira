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
  Image as ImageIcon,
  Link2,
  FileText,
  Mic,
  Video,
  Download,
  Pencil,
  Play,
  Pause,
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
  media_type?: string | null;
  media_url?: string | null;
  media_mime?: string | null;
  created_at: string;
};

type Attachment = {
  id: number;
  media_type: string | null;
  media_url: string;
  media_mime: string | null;
  caption: string | null;
  actor: string;
  created_at: string;
};

type LinkItem = {
  id: number;
  url: string;
  label: string;
  actor: string;
  created_at: string;
};

type Attachments = {
  midias: Attachment[];
  documentos: Attachment[];
  links: LinkItem[];
};

// Preferências do paciente: o que já está decidido na prática não vira pergunta
// na conversa. Podem ser marcadas aqui ou aprendidas do histórico de consultas.
type PrefDimension = "service" | "location" | "modality" | "period";

type PrefMetaEntry = {
  source: "manual" | "auto";
  updated_at: string;
  by?: number;
  evidence?: string;
};

type Preferences = {
  service_id: number | null;
  service_name: string | null;
  location_id: number | null;
  location_name: string | null;
  modality: "presencial" | "online" | null;
  // Com serviço preferido, a modalidade vem dele — não dá para marcar as duas
  // em contradição.
  modality_locked: boolean;
  period: "manha" | "tarde" | null;
  meta: Partial<Record<PrefDimension, PrefMetaEntry>>;
};

type PreferencesResponse = {
  professional_id: number | null;
  preferences: Preferences | null;
  options: {
    services: { id: number; name: string | null; online: boolean }[];
    locations: { id: number; name: string | null; city: string | null }[];
  };
};

type StatusFilter = "all" | "pending" | "human" | "bot";
type PanelTab = "paciente" | "anexos";
type AnexoTab = "midias" | "links" | "docs";

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

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

// Ícone por tipo de mídia, para o que não tem miniatura visual (áudio, vídeo, doc).
const mediaIcon = (type: string | null) => {
  if (type === "audio") return <Mic size={18} />;
  if (type === "video") return <Video size={18} />;
  return <FileText size={18} />;
};

// A mídia recebida no WhatsApp vai pro Cloudinary sem nome nem extensão (o
// public_id é aleatório), então baixar direto da URL dá um arquivo tipo "abc123"
// que médico/secretária não conseguem abrir. Aqui reconstruímos um nome legível
// com a extensão certa a partir do mimetype.
const MIME_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/zip": "zip",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/amr": "amr",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
};

const isUrlLike = (s: string) => /^https?:\/\//i.test(s) || /^www\./i.test(s);

// Aceita tanto Attachment (painel lateral, legenda em `caption`) quanto Message
// (bolha do chat, legenda em `text`).
type MediaLike = {
  media_type?: string | null;
  media_url: string;
  media_mime?: string | null;
  caption?: string | null;
  text?: string | null;
  created_at: string;
};

function attachmentFilename(item: MediaLike): string {
  const mime = (item.media_mime || "").split(";")[0].trim().toLowerCase();
  let ext = MIME_EXT[mime] || "";
  // Fallback: extensão que porventura já esteja na própria URL.
  if (!ext) {
    const m = item.media_url.split("?")[0].match(/\.([a-z0-9]{2,5})$/i);
    if (m) ext = m[1].toLowerCase();
  }

  const typeLabel =
    item.media_type === "audio" ? "audio"
    : item.media_type === "video" ? "video"
    : item.media_type === "image" || item.media_type === "sticker" ? "imagem"
    : "documento";

  // A legenda vira nome só se for texto de verdade (não um link que veio junto).
  const rawCaption = (item.caption ?? item.text ?? "").trim();
  let base = rawCaption && !isUrlLike(rawCaption) ? rawCaption : "";
  base = base.replace(/[/\\?%*:|"<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!base) {
    const d = new Date(item.created_at);
    const stamp =
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    base = `${typeLabel}-${stamp}`;
  }

  if (ext && base.toLowerCase().endsWith(`.${ext}`)) return base;
  return ext ? `${base}.${ext}` : base;
}

// Rótulo curto e legível do tipo do arquivo, no lugar do mimetype cru (que pra
// Office vira um monstro tipo "application/vnd.openxmlformats-...").
function mediaKindLabel(item: MediaLike): string {
  const name = attachmentFilename(item);
  const ext = name.split(".").pop();
  if (ext && ext !== name) return ext.toUpperCase();
  return item.media_type === "audio" ? "Áudio"
    : item.media_type === "video" ? "Vídeo"
    : item.media_type === "image" || item.media_type === "sticker" ? "Imagem"
    : "Arquivo";
}

// Baixa o anexo com nome legível. O Cloudinary serve com CORS liberado, então
// buscamos o binário e forçamos o nome no download (o atributo `download` do <a>
// é ignorado em link cross-origin, por isso o fetch+blob). Se algo falhar, ao
// menos abrimos o arquivo numa aba nova.
async function downloadAttachment(item: MediaLike): Promise<void> {
  const filename = attachmentFilename(item);
  try {
    const res = await fetch(item.media_url);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    window.open(item.media_url, "_blank", "noopener,noreferrer");
  }
}

// Player de áudio com a cara do sistema (o <audio> nativo é feio e cada browser
// desenha de um jeito). Botão play/pause redondo na cor da marca, barra de
// progresso arrastável, tempos e ajuste de velocidade.
const AUDIO_ACCENT = "#c11c22";

const AudioMessage: React.FC<{ src: string }> = ({ src }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [dragging, setDragging] = useState(false);

  const fmt = (s: number) => {
    const v = !isFinite(s) || s < 0 ? 0 : s;
    return `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, "0")}`;
  };

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) void a.play();
    else a.pause();
  };

  const cycleSpeed = () => {
    const next = speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1;
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const seekToClientX = (clientX: number) => {
    const el = trackRef.current;
    const a = audioRef.current;
    if (!el || !a || !duration) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const t = ratio * duration;
    a.currentTime = t;
    setCurrent(t);
  };

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => seekToClientX(e.clientX);
    const up = () => setDragging(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging, duration]);

  const pct = duration ? (current / duration) * 100 : 0;

  return (
    <div
      className="flex items-center gap-2.5 rounded-full py-1.5 pl-1.5 pr-3"
      style={{ minWidth: 216, maxWidth: 300, background: "rgba(255,255,255,0.75)", border: "1px solid rgba(0,0,0,0.06)" }}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => {
          if (!dragging) setCurrent(e.currentTarget.currentTime);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
      />
      <button
        type="button"
        onClick={toggle}
        title={playing ? "Pausar" : "Reproduzir"}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition-transform active:scale-95"
        style={{ background: AUDIO_ACCENT }}
      >
        {playing ? (
          <Pause size={16} fill="white" />
        ) : (
          <Play size={16} fill="white" style={{ marginLeft: 1 }} />
        )}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div
          ref={trackRef}
          onPointerDown={(e) => {
            setDragging(true);
            seekToClientX(e.clientX);
          }}
          className="relative h-[5px] cursor-pointer rounded-full"
          style={{ background: "#e5e7eb", touchAction: "none" }}
        >
          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${pct}%`, background: AUDIO_ACCENT }} />
          <div
            className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white shadow"
            style={{ left: `calc(${pct}% - 6px)`, border: `2px solid ${AUDIO_ACCENT}` }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] tabular-nums text-gray-500">
          <span>{fmt(current)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={cycleSpeed}
        title="Velocidade de reprodução"
        className="shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold text-gray-600 transition-colors hover:bg-gray-100"
        style={{ border: "1px solid #e5e7eb" }}
      >
        {speed}x
      </button>
    </div>
  );
};

/**
 * Painel de mídias, links e documentos da conversa — mesmo espírito do
 * "Dados do contato" do WhatsApp: a secretária acha um exame ou um comprovante
 * que o paciente mandou dias atrás sem rolar a conversa inteira.
 */
const AnexosPanel: React.FC<{
  attachments: Attachments | null;
  loading: boolean;
  tab: AnexoTab;
  onTabChange: (t: AnexoTab) => void;
}> = ({ attachments, loading, tab, onTabChange }) => {
  const midias = attachments?.midias ?? [];
  const links = attachments?.links ?? [];
  const docs = attachments?.documentos ?? [];

  const abas: { id: AnexoTab; label: string; icon: React.ReactNode; n: number }[] = [
    { id: "midias", label: "Mídias", icon: <ImageIcon size={14} />, n: midias.length },
    { id: "links", label: "Links", icon: <Link2 size={14} />, n: links.length },
    { id: "docs", label: "Docs", icon: <FileText size={14} />, n: docs.length },
  ];

  if (loading) {
    return (
      <div className="p-5 text-center">
        <div className="mx-auto mb-3 h-8 w-8 animate-spin rounded-full border-b-2 border-red-600" />
        <p className="text-[12.5px] text-gray-500">Carregando anexos...</p>
      </div>
    );
  }

  const vazio = (texto: string) => (
    <div className="px-5 py-10 text-center text-[12.5px] text-gray-400">{texto}</div>
  );

  return (
    <div className="flex flex-col">
      <div className="flex gap-1 border-b border-gray-100 px-3 py-2">
        {abas.map((a) => (
          <button
            key={a.id}
            onClick={() => onTabChange(a.id)}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11.5px] font-semibold transition-colors"
            style={{
              background: tab === a.id ? "#fff5f5" : "transparent",
              color: tab === a.id ? "#c11c22" : "#6b7280",
            }}
          >
            {a.icon}
            {a.label}
            <span className="text-[10.5px] font-bold opacity-70">{a.n}</span>
          </button>
        ))}
      </div>

      {tab === "midias" &&
        (midias.length === 0
          ? vazio("Nenhuma foto, áudio ou vídeo nesta conversa.")
          : (
            <div className="grid grid-cols-3 gap-1.5 p-3">
              {midias.map((m) => (
                <a
                  key={`${m.id}-${m.media_url}`}
                  href={m.media_url}
                  target="_blank"
                  rel="noreferrer"
                  title={`${m.caption || m.media_type || "mídia"} · ${shortDate(m.created_at)}`}
                  className="relative flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50 text-gray-500 transition-colors hover:border-gray-300"
                >
                  {m.media_type === "image" || m.media_type === "sticker" ? (
                    <img
                      src={m.media_url}
                      alt={m.caption || "mídia enviada pelo paciente"}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      {mediaIcon(m.media_type)}
                      <span className="text-[9.5px] font-semibold uppercase">
                        {m.media_type === "audio" ? "áudio" : m.media_type === "video" ? "vídeo" : "arquivo"}
                      </span>
                    </div>
                  )}
                </a>
              ))}
            </div>
          ))}

      {tab === "links" &&
        (links.length === 0
          ? vazio("Nenhum link trocado nesta conversa.")
          : (
            <div className="flex flex-col divide-y divide-gray-100">
              {links.map((l, i) => (
                <a
                  key={`${l.id}-${i}`}
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-start gap-2.5 px-4 py-3 transition-colors hover:bg-gray-50"
                >
                  <Link2 size={15} className="mt-0.5 shrink-0 text-gray-400" />
                  <div className="min-w-0">
                    <div className="truncate text-[12.5px] font-medium text-[#c11c22]">{l.label}</div>
                    <div className="mt-0.5 text-[11px] text-gray-400">
                      {l.actor === "patient" ? "Paciente" : l.actor === "human" ? "Equipe" : "Secretária"} ·{" "}
                      {shortDate(l.created_at)}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          ))}

      {tab === "docs" &&
        (docs.length === 0
          ? vazio("Nenhum documento nesta conversa.")
          : (
            <div className="flex flex-col divide-y divide-gray-100">
              {docs.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50"
                >
                  <a
                    href={d.media_url}
                    target="_blank"
                    rel="noreferrer"
                    title="Abrir para visualizar"
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-[9px] font-bold uppercase tracking-tight text-[#c11c22]">
                      {mediaKindLabel(d).slice(0, 4)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12.5px] font-medium text-gray-900">
                        {attachmentFilename(d)}
                      </div>
                      <div className="mt-0.5 text-[11px] text-gray-400">
                        {mediaKindLabel(d)} · {shortDate(d.created_at)}
                      </div>
                    </div>
                  </a>
                  <button
                    type="button"
                    onClick={() => downloadAttachment(d)}
                    title="Baixar com nome legível"
                    className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                  >
                    <Download size={15} />
                  </button>
                </div>
              ))}
            </div>
          ))}
    </div>
  );
};

// Etiqueta de origem: "manual" foi alguém que marcou; "automático" veio do
// histórico e mostra em quantas das últimas consultas o padrão apareceu.
const PrefBadge: React.FC<{ entry?: PrefMetaEntry; onReset: () => void }> = ({ entry, onReset }) => {
  if (!entry) return null;
  const isManual = entry.source === "manual";
  return (
    <span className="ml-1.5 inline-flex items-center gap-1 align-middle">
      <span
        className="rounded-full px-1.5 py-px text-[10px] font-semibold"
        style={{
          background: isManual ? "#fef2f2" : "#f1f5f9",
          color: isManual ? "#c11c22" : "#64748b",
        }}
        title={
          isManual
            ? "Marcado à mão — o aprendizado automático não sobrescreve"
            : `Aprendido do histórico${entry.evidence ? ` (${entry.evidence})` : ""}`
        }
      >
        {isManual ? "manual" : "automático"}
      </span>
      {isManual && (
        <button
          type="button"
          onClick={onReset}
          className="text-[10px] font-medium text-gray-400 underline hover:text-gray-600"
        >
          voltar ao automático
        </button>
      )}
    </span>
  );
};

const PREF_SELECT_CLASS =
  "mt-1 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-[12.5px] text-gray-900 disabled:bg-gray-50 disabled:text-gray-400";

const PreferencesPanel: React.FC<{
  data: PreferencesResponse | null;
  loading: boolean;
  saving: boolean;
  onSave: (body: Record<string, unknown>) => void;
}> = ({ data, loading, saving, onSave }) => {
  if (loading) return <div className="text-[12.5px] text-gray-400">Carregando preferências…</div>;
  const prefs = data?.preferences;
  if (!prefs) {
    return (
      <div className="text-[12.5px] text-gray-400">
        Disponível depois que o paciente for identificado nesta conversa.
      </div>
    );
  }
  const meta = prefs.meta || {};
  const field = (dim: PrefDimension, label: string, control: React.ReactNode) => (
    <div>
      <span className="text-[11px] font-medium text-gray-400">{label}</span>
      <PrefBadge entry={meta[dim]} onReset={() => onSave({ reset: [dim] })} />
      {control}
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {field(
        "service",
        "Serviço",
        <select
          className={PREF_SELECT_CLASS}
          disabled={saving}
          value={prefs.service_id ?? ""}
          onChange={(e) => onSave({ service: e.target.value === "" ? null : Number(e.target.value) })}
        >
          <option value="">Sem preferência</option>
          {data?.options.services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name || `Serviço ${s.id}`}
            </option>
          ))}
        </select>
      )}

      {field(
        "modality",
        "Modalidade",
        <>
          <select
            className={PREF_SELECT_CLASS}
            disabled={saving || prefs.modality_locked}
            value={prefs.modality ?? ""}
            onChange={(e) => onSave({ modality: e.target.value === "" ? null : e.target.value })}
          >
            <option value="">Sem preferência</option>
            <option value="presencial">Presencial</option>
            <option value="online">Online</option>
          </select>
          {prefs.modality_locked && (
            <p className="mt-1 text-[10.5px] leading-snug text-gray-400">
              Vem do serviço preferido — mude o serviço para mudar a modalidade.
            </p>
          )}
        </>
      )}

      {field(
        "location",
        "Local",
        <select
          className={PREF_SELECT_CLASS}
          disabled={saving || !data?.options.locations.length}
          value={prefs.location_id ?? ""}
          onChange={(e) => onSave({ location: e.target.value === "" ? null : Number(e.target.value) })}
        >
          <option value="">Sem preferência</option>
          {data?.options.locations.map((l) => (
            <option key={l.id} value={l.id}>
              {[l.name, l.city].filter(Boolean).join(" — ") || `Local ${l.id}`}
            </option>
          ))}
        </select>
      )}

      {field(
        "period",
        "Turno",
        <select
          className={PREF_SELECT_CLASS}
          disabled={saving}
          value={prefs.period ?? ""}
          onChange={(e) => onSave({ period: e.target.value === "" ? null : e.target.value })}
        >
          <option value="">Sem preferência</option>
          <option value="manha">Manhã</option>
          <option value="tarde">Tarde</option>
        </select>
      )}

      <p className="text-[10.5px] leading-snug text-gray-400">
        A secretária deixa de perguntar o que já está marcado aqui, mas continua
        confirmando dia e horário — e um pedido diferente do paciente sempre vence.
      </p>
    </div>
  );
};

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
  const [panelTab, setPanelTab] = useState<PanelTab>("paciente");
  const [anexoTab, setAnexoTab] = useState<AnexoTab>("midias");
  const [attachments, setAttachments] = useState<Attachments | null>(null);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [preferences, setPreferences] = useState<PreferencesResponse | null>(null);
  const [preferencesLoading, setPreferencesLoading] = useState(false);
  const [preferencesSaving, setPreferencesSaving] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);

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

  // Anexos varrem a conversa inteira (a lista de mensagens é limitada), então só
  // buscamos quando a aba é realmente aberta.
  const fetchAttachments = useCallback(
    async (phone: string) => {
      try {
        setAttachmentsLoading(true);
        const res = await fetchWithAuth(
          `${apiUrl}/webhook/whatsapp/conversation/attachments?phone=${encodeURIComponent(phone)}`,
          { method: "GET" }
        );
        if (!res.ok) throw new Error("Erro ao carregar os anexos");
        setAttachments(await res.json());
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Erro ao carregar os anexos");
        setAttachments({ midias: [], documentos: [], links: [] });
      } finally {
        setAttachmentsLoading(false);
      }
    },
    [apiUrl]
  );

  const fetchPreferences = useCallback(
    async (phone: string) => {
      try {
        setPreferencesLoading(true);
        const res = await fetchWithAuth(
          `${apiUrl}/webhook/whatsapp/conversation/preferences?phone=${encodeURIComponent(phone)}`,
          { method: "GET" }
        );
        if (!res.ok) throw new Error("Erro ao carregar as preferências");
        setPreferences(await res.json());
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Erro ao carregar as preferências");
        setPreferences(null);
      } finally {
        setPreferencesLoading(false);
      }
    },
    [apiUrl]
  );

  // Salvar devolve o estado já saneado pelo backend, então a tela reflete o que
  // de fato ficou gravado (ex.: marcar serviço zera a modalidade solta).
  const savePreferences = useCallback(
    async (body: Record<string, unknown>) => {
      if (!selectedPhone) return;
      try {
        setPreferencesSaving(true);
        setActionError("");
        const res = await fetchWithAuth(`${apiUrl}/webhook/whatsapp/conversation/preferences`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone: selectedPhone, ...body }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || "Erro ao salvar as preferências");
        setPreferences(data);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : "Erro ao salvar as preferências");
      } finally {
        setPreferencesSaving(false);
      }
    },
    [apiUrl, selectedPhone]
  );

  // Renomear atualiza a lista inteira: o nome é o que identifica a conversa nela.
  const saveName = useCallback(async () => {
    if (!selectedPhone) return;
    try {
      setSavingName(true);
      setActionError("");
      const res = await fetchWithAuth(`${apiUrl}/webhook/whatsapp/conversation/name`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: selectedPhone, name: nameDraft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || "Erro ao renomear a conversa");
      setConversations((prev) =>
        prev.map((c) =>
          c.phone === selectedPhone ? { ...c, patient_name: data.resolved_name } : c
        )
      );
      setEditingName(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Erro ao renomear a conversa");
    } finally {
      setSavingName(false);
    }
  }, [apiUrl, selectedPhone, nameDraft]);

  // Trocar de conversa fecha a edição de nome pendente.
  useEffect(() => {
    setEditingName(false);
  }, [selectedPhone]);

  useEffect(() => {
    if (!showPatientPanel || panelTab !== "anexos" || !selectedPhone) return;
    fetchAttachments(selectedPhone);
  }, [showPatientPanel, panelTab, selectedPhone, fetchAttachments]);

  useEffect(() => {
    if (!showPatientPanel || panelTab !== "paciente" || !selectedPhone) return;
    fetchPreferences(selectedPhone);
  }, [showPatientPanel, panelTab, selectedPhone, fetchPreferences]);

  // Trocar de conversa invalida os anexos e as preferências da anterior.
  useEffect(() => {
    setAttachments(null);
    setPreferences(null);
  }, [selectedPhone]);

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
                            {m.media_url && (
                              <div className="mb-1">
                                {m.media_type === "image" || m.media_type === "sticker" ? (
                                  <a href={m.media_url} target="_blank" rel="noreferrer">
                                    <img
                                      src={m.media_url}
                                      alt="imagem enviada pelo paciente"
                                      style={{ maxWidth: "100%", maxHeight: 260, borderRadius: 8, display: "block" }}
                                    />
                                  </a>
                                ) : m.media_type === "audio" ? (
                                  <AudioMessage src={m.media_url} />
                                ) : m.media_type === "video" ? (
                                  <video
                                    controls
                                    src={m.media_url}
                                    style={{ maxWidth: "100%", maxHeight: 260, borderRadius: 8 }}
                                  />
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <a
                                      href={m.media_url}
                                      target="_blank"
                                      rel="noreferrer"
                                      title={attachmentFilename(m)}
                                      className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-blue-600 underline"
                                    >
                                      <FileText size={14} className="shrink-0" />
                                      <span className="truncate">{attachmentFilename(m)}</span>
                                    </a>
                                    <button
                                      type="button"
                                      onClick={() => downloadAttachment(m)}
                                      title="Baixar com nome legível"
                                      className="shrink-0 rounded p-1 text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-600"
                                    >
                                      <Download size={14} />
                                    </button>
                                  </div>
                                )}
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
            <div className="flex w-[300px] shrink-0 flex-col overflow-y-auto border-l border-gray-200 bg-white">
              {/* Abas do painel */}
              <div className="sticky top-0 z-10 flex shrink-0 border-b border-gray-200 bg-white">
                {([
                  { id: "paciente" as PanelTab, label: "Paciente" },
                  { id: "anexos" as PanelTab, label: "Mídias e links" },
                ]).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setPanelTab(t.id)}
                    className="flex-1 border-b-2 px-2 py-3 text-[12.5px] font-semibold transition-colors"
                    style={{
                      borderColor: panelTab === t.id ? "#c11c22" : "transparent",
                      color: panelTab === t.id ? "#c11c22" : "#6b7280",
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {panelTab === "anexos" ? (
                <AnexosPanel
                  attachments={attachments}
                  loading={attachmentsLoading}
                  tab={anexoTab}
                  onTabChange={setAnexoTab}
                />
              ) : (
                <div className="flex flex-col p-5">
              <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[.04em] text-gray-400">
                Paciente
              </div>
              {editingName ? (
                <div className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveName();
                      if (e.key === "Escape") setEditingName(false);
                    }}
                    placeholder="Nome do paciente"
                    maxLength={120}
                    className="min-w-0 flex-1 rounded-md border border-gray-200 px-2 py-1 text-[14px] font-semibold text-gray-900"
                  />
                  <button
                    type="button"
                    onClick={saveName}
                    disabled={savingName}
                    className="rounded-md px-2 py-1 text-[12px] font-semibold text-white disabled:opacity-60"
                    style={{ background: "#c11c22" }}
                  >
                    Salvar
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingName(false)}
                    className="rounded-md px-1.5 py-1 text-[12px] text-gray-400 hover:text-gray-600"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <div className="group flex items-center gap-1.5">
                  <span className="text-[15px] font-bold text-gray-900">{displayName(selected)}</span>
                  <button
                    type="button"
                    title="Renomear esta conversa"
                    onClick={() => {
                      setNameDraft(selected.patient_name || "");
                      setEditingName(true);
                    }}
                    className="text-gray-300 transition-colors hover:text-gray-600"
                  >
                    <Pencil size={13} />
                  </button>
                </div>
              )}

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
                Preferências
              </div>
              <PreferencesPanel
                data={preferences}
                loading={preferencesLoading}
                saving={preferencesSaving}
                onSave={savePreferences}
              />

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
      )}
    </div>
  );
};

export default AtendimentoPage;
