# Sistema de Verificação Automática de Assinaturas Expiradas

## Resumo

Sistema automático que verifica e atualiza diariamente o status de assinaturas expiradas, mudando de `active` para `expired` quando a data de `subscription_expiry` é ultrapassada.

## Como Funciona

### Verificação Automática Diária
- **Horário**: Roda automaticamente todo dia às 00:05 (5 minutos após meia-noite)
- **Tecnologia**: node-cron
- **Escopo**: Verifica tanto usuários quanto dependentes

### Lógica de Atualização

O sistema busca por registros que atendam TODOS estes critérios:
- `subscription_status = 'active'`
- `subscription_expiry IS NOT NULL`
- `subscription_expiry < CURRENT_DATE` (data já passou)

Quando encontra registros, atualiza:
- `subscription_status` → `'expired'`
- `subscription_active` → `false`
- `updated_at` → timestamp atual (apenas para usuários)

### Estados de Assinatura

| Status | Descrição |
|--------|-----------|
| `pending` | Aguardando pagamento |
| `active` | Assinatura paga e dentro do prazo |
| `expired` | Assinatura que passou da data de expiração |

## Arquivos Modificados/Criados

### 1. `/server/jobs/checkExpiredSubscriptions.js` (NOVO)
Contém toda a lógica de verificação:

- **`scheduleExpiryCheck()`**: Agenda o job diário
- **`checkExpiredSubscriptionsNow()`**: Executa verificação imediata (útil para testes ou execução manual)

### 2. `/server/index.js` (MODIFICADO)
Integração do job na inicialização do servidor:

```javascript
// Importação adicionada
import {
  scheduleExpiryCheck,
  checkExpiredSubscriptionsNow,
} from "./jobs/checkExpiredSubscriptions.js";

// Na função startServer(), adicionado:
console.log("⏰ Setting up subscription expiry check job...");
scheduleExpiryCheck();
await checkExpiredSubscriptionsNow();
console.log("✅ Subscription expiry check job initialized");
```

### 3. `package.json` (ATUALIZADO)
Dependência adicionada:
```json
"node-cron": "^3.0.3"
```

## Execução

### Automática
O job roda automaticamente quando o servidor Node.js é iniciado e fica ativo enquanto o servidor estiver rodando.

### Manual
Para executar uma verificação manual imediatamente, você pode chamar:

```javascript
import { checkExpiredSubscriptionsNow } from './server/jobs/checkExpiredSubscriptions.js';

const result = await checkExpiredSubscriptionsNow();
console.log(`Usuários atualizados: ${result.usersUpdated}`);
console.log(`Dependentes atualizados: ${result.dependentsUpdated}`);
```

## Logs

O sistema gera logs informativos:

```
[CRON] Verificando assinaturas expiradas...
[CRON] ✓ 3 usuários atualizados para 'expired'
[CRON] ✓ 5 dependentes atualizados para 'expired'
```

## Importante

⚠️ **O servidor Node.js PRECISA estar rodando** para que o job seja executado. Se o servidor estiver desligado, a verificação não acontece.

### Alternativas se o servidor ficar offline:
1. **Serviços de hospedagem**: Use plataformas que mantêm o servidor ativo 24/7 (Render, Railway, Heroku, etc.)
2. **Cron externo**: Configure um serviço de cron externo (cron-job.org) para fazer uma chamada HTTP que trigger uma rota que execute `checkExpiredSubscriptionsNow()`
3. **Serverless**: Migre para uma arquitetura serverless com scheduled functions

## Segurança

- Usa transações SQL para garantir consistência dos dados
- Rollback automático em caso de erro
- Logs detalhados para auditoria
- Atualiza apenas registros específicos (não afeta outros status)

## Testes

Para testar o sistema:

1. Crie um usuário com `subscription_status = 'active'` e `subscription_expiry` no passado
2. Reinicie o servidor ou aguarde o horário agendado (00:05)
3. Verifique se o status mudou para `'expired'`

## Monitoramento

Recomendações para monitoramento:
- Observe os logs do servidor diariamente às 00:05
- Configure alertas se muitos registros forem expirados de uma vez (possível erro)
- Verifique periodicamente se o servidor está ativo e saudável
