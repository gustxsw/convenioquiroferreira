import { useState, useEffect } from 'react';
import { Shield, Plus, Trash2 } from 'lucide-react';
import { fetchWithAuth, getApiUrl } from '../../utils/apiHelpers';

const InsurancesPage = () => {
  const [insurances, setInsurances] = useState<{ id: number; name: string }[]>([]);
  const [newInsurance, setNewInsurance] = useState('');
  const [insuranceLoading, setInsuranceLoading] = useState(false);
  const [insuranceError, setInsuranceError] = useState('');

  useEffect(() => {
    fetchWithAuth(`${getApiUrl()}/api/professional/insurances`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setInsurances)
      .catch(() => {});
  }, []);

  const addInsurance = async () => {
    const name = newInsurance.trim();
    if (!name) return;
    setInsuranceLoading(true);
    setInsuranceError('');
    try {
      const r = await fetchWithAuth(`${getApiUrl()}/api/professional/insurances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!r.ok) {
        const d = await r.json();
        setInsuranceError(d.message || 'Erro ao adicionar');
        return;
      }
      const created = await r.json();
      setInsurances((prev) =>
        [...prev, created].sort((a, b) => a.name.localeCompare(b.name))
      );
      setNewInsurance('');
    } catch {
      setInsuranceError('Erro ao adicionar convênio');
    } finally {
      setInsuranceLoading(false);
    }
  };

  const removeInsurance = async (id: number) => {
    try {
      await fetchWithAuth(`${getApiUrl()}/api/professional/insurances/${id}`, {
        method: 'DELETE',
      });
      setInsurances((prev) => prev.filter((i) => i.id !== id));
    } catch {
      setInsuranceError('Erro ao remover convênio');
    }
  };

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <Shield className="h-6 w-6 text-red-600" />
          <h1 className="text-2xl font-bold text-gray-900">Convênios Aceitos</h1>
        </div>
        <p className="text-gray-600 ml-9">
          Liste os planos de saúde que você atende. O bot do WhatsApp usará essa lista para
          responder pacientes que perguntarem sobre cobertura, e o agendamento exibirá as
          opções ao marcar consulta.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 md:p-8 max-w-3xl">
        {insuranceError && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {insuranceError}
          </div>
        )}

        <div className="flex gap-2 mb-6">
          <input
            type="text"
            value={newInsurance}
            onChange={(e) => setNewInsurance(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addInsurance()}
            placeholder="Ex: Unimed, Bradesco Saúde, Amil…"
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          />
          <button
            type="button"
            onClick={addInsurance}
            disabled={insuranceLoading || !newInsurance.trim()}
            className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Adicionar
          </button>
        </div>

        {insurances.length === 0 ? (
          <p className="text-sm text-gray-400 italic">Nenhum convênio cadastrado ainda.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {insurances.map((ins) => (
              <li key={ins.id} className="flex items-center justify-between py-3">
                <span className="text-sm text-gray-800">{ins.name}</span>
                <button
                  type="button"
                  onClick={() => removeInsurance(ins.id)}
                  className="text-gray-400 hover:text-red-600 transition-colors"
                  title="Remover"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default InsurancesPage;
