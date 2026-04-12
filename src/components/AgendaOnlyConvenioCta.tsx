import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import {
  AGENDA_ONLY_CONVENIO_SNOOZE_EVENT,
  CONVENIO_OWNER_DISPLAY_PHONE,
  CONVENIO_PROMO_CTA_LINE,
  CONVENIO_PROMO_SUBTITLE,
  CONVENIO_PROMO_TITLE,
  getConvenioWhatsappHref,
  isAgendaOnlyConvenioPromoSnoozed,
  snoozeAgendaOnlyConvenioPromo,
} from "../utils/convenioOwnerContact";

function useAgendaOnlyConvenioPromoVisible(): boolean {
  const [visible, setVisible] = useState(
    () => !isAgendaOnlyConvenioPromoSnoozed()
  );

  useEffect(() => {
    const sync = () => setVisible(!isAgendaOnlyConvenioPromoSnoozed());
    window.addEventListener("storage", sync);
    window.addEventListener(AGENDA_ONLY_CONVENIO_SNOOZE_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(AGENDA_ONLY_CONVENIO_SNOOZE_EVENT, sync);
    };
  }, []);

  return visible;
}

const AgendaOnlyConvenioCta: React.FC = () => {
  const visible = useAgendaOnlyConvenioPromoVisible();
  if (!visible) return null;

  const waHref = getConvenioWhatsappHref();

  const dismiss = () => {
    snoozeAgendaOnlyConvenioPromo();
  };

  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900">
            {CONVENIO_PROMO_TITLE}
          </h2>
          <p className="mt-1 text-sm text-gray-600">{CONVENIO_PROMO_SUBTITLE}</p>
          <p className="mt-2 text-sm text-gray-700">{CONVENIO_PROMO_CTA_LINE}</p>
          <p className="mt-1 text-sm text-gray-600">
            {CONVENIO_OWNER_DISPLAY_PHONE}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap lg:flex-col xl:flex-row shrink-0">
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
          >
            <MessageCircle className="h-4 w-4" />
            WhatsApp
          </a>
          <Link
            to="/professional/profile#convenio"
            className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Ver detalhes no perfil
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="inline-flex items-center justify-center rounded-md px-2 py-2 text-sm text-gray-500 hover:text-gray-800 sm:px-3"
          >
            Ocultar este aviso
          </button>
        </div>
      </div>
    </div>
  );
};

export default AgendaOnlyConvenioCta;
