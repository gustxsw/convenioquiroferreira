# Sistema de Rastreamento de Afiliados

## Visão Geral

O sistema agora possui um rastreamento completo de afiliados que persiste a referência desde o primeiro click até a conversão final, independente do tempo que levar.

## Como Funciona

### 1. Click no Link do Afiliado

Quando alguém acessa o site através de um link de afiliado (ex: `https://seusite.com/register?ref=123`):

- O sistema captura automaticamente o código do afiliado da URL
- Cria um identificador único para o visitante (armazenado no localStorage)
- Registra o click na tabela `affiliate_referrals` com:
  - ID do afiliado
  - Identificador do visitante
  - Data/hora do click
  - Metadados (navegador, IP, etc.)

### 2. Cadastro do Usuário

Quando o visitante se registra no sistema:

- O sistema vincula automaticamente o novo usuário à referência do afiliado
- Atualiza a tabela `affiliate_referrals` com o ID do usuário
- Adiciona informações na tabela `users`:
  - `referred_by_affiliate_id`: ID do afiliado que indicou
  - `affiliate_referral_id`: ID da referência original

**Importante**: Esse vínculo é permanente e persiste mesmo que o usuário demore dias, semanas ou meses para efetuar o pagamento.

### 3. Conversão (Pagamento)

Quando o usuário paga o convênio:

- O sistema marca automaticamente a referência como convertida
- Atualiza a tabela `affiliate_referrals`:
  - `converted = true`
  - `converted_at = timestamp atual`
- O afiliado recebe crédito pela conversão

## Estrutura do Banco de Dados

### Tabela `affiliate_referrals`

```sql
CREATE TABLE affiliate_referrals (
  id SERIAL PRIMARY KEY,
  affiliate_id INTEGER NOT NULL REFERENCES users(id),
  visitor_identifier TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  converted BOOLEAN DEFAULT false,
  converted_at TIMESTAMP,
  referral_code TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Colunas Adicionadas na Tabela `users`

- `referred_by_affiliate_id`: ID do afiliado que indicou o usuário
- `affiliate_referral_id`: ID da referência original na tabela `affiliate_referrals`

## Endpoints da API

### 1. Rastrear Click (`POST /api/affiliate-tracking/track`)

Registra quando alguém acessa via link de afiliado.

**Público** (não requer autenticação)

```json
{
  "referralCode": "123",
  "visitorIdentifier": "visitor_123456_abc",
  "metadata": {
    "userAgent": "...",
    "referrerUrl": "...",
    "landingPage": "..."
  }
}
```

### 2. Vincular Usuário (`POST /api/affiliate-tracking/link-user`)

Vincula um usuário registrado à referência do afiliado.

**Público** (não requer autenticação)

```json
{
  "userId": 456,
  "visitorIdentifier": "visitor_123456_abc"
}
```

### 3. Marcar como Convertido (`POST /api/affiliate-tracking/convert`)

Marca a referência como convertida quando o usuário paga.

**Autenticado**

```json
{
  "userId": 456
}
```

### 4. Obter Referências do Afiliado (`GET /api/affiliate-tracking/my-referrals`)

Lista todas as referências (clicks, cadastros e conversões) de um afiliado.

**Autenticado** (apenas para afiliados)

**Resposta:**
```json
{
  "referrals": [
    {
      "id": 1,
      "visitor_identifier": "visitor_123456_abc",
      "user_id": 456,
      "user_name": "João Silva",
      "user_email": "joao@example.com",
      "converted": true,
      "converted_at": "2024-01-15T10:30:00Z",
      "created_at": "2024-01-01T08:00:00Z",
      "subscription_status": "active"
    }
  ],
  "stats": {
    "total_clicks": "25",
    "total_registrations": "15",
    "total_conversions": "8"
  }
}
```

### 5. Verificar Referência Existente (`GET /api/affiliate-tracking/check/:visitorIdentifier`)

Verifica se um visitante já tem uma referência registrada.

**Público**

## Interface do Usuário

### Dashboard do Afiliado

O painel do afiliado agora exibe:

1. **Link de Indicação**:
   - Formato: `https://seusite.com/register?ref=123`
   - Botão para copiar facilmente

2. **Estatísticas de Rastreamento**:
   - Total de Clicks: Quantas pessoas acessaram o link
   - Cadastros: Quantos se registraram
   - Conversões: Quantos pagaram

3. **Histórico de Referências**:
   - Tabela detalhada com cada click
   - Status de cada referência (Apenas Click / Cadastrado / Convertido)
   - Informações do usuário quando disponíveis

## Fluxo Completo de Exemplo

### Cenário 1: Conversão Imediata

1. **01/01/2024 10:00** - Maria acessa `seusite.com/register?ref=123`
   - Sistema registra o click
   - Cria identificador único para Maria

2. **01/01/2024 10:05** - Maria se cadastra
   - Sistema vincula Maria ao afiliado 123
   - Atualiza referência com user_id de Maria

3. **01/01/2024 10:15** - Maria paga o convênio
   - Sistema marca referência como convertida
   - Afiliado 123 recebe crédito pela conversão

### Cenário 2: Conversão Tardia

1. **01/01/2024 10:00** - João acessa `seusite.com/register?ref=123`
   - Sistema registra o click
   - Cria identificador único para João

2. **01/01/2024 10:05** - João se cadastra
   - Sistema vincula João ao afiliado 123
   - Vínculo permanente é criado

3. **15/02/2024** - João finalmente paga o convênio (1 mês e meio depois!)
   - Sistema marca referência como convertida
   - Afiliado 123 recebe crédito pela conversão
   - **O vínculo persistiu todo esse tempo!**

## Vantagens do Sistema

1. **Persistência Total**: O vínculo nunca se perde, mesmo após meses
2. **Rastreamento Completo**: Desde o primeiro click até a conversão
3. **Transparência**: Afiliados podem ver cada etapa do processo
4. **Automatização**: Tudo acontece automaticamente, sem intervenção manual
5. **Segurança**: Sistema de RLS garante que cada afiliado vê apenas suas referências

## Segurança

O sistema implementa Row Level Security (RLS) no PostgreSQL:

- Afiliados podem ver apenas suas próprias referências
- Admins podem ver todas as referências
- Usuários não podem modificar referências de outros afiliados

## Observações Importantes

1. O parâmetro da URL mudou de `?affiliate=codigo` para `?ref=ID`
2. O sistema usa o ID do usuário afiliado (numérico) ao invés de um código
3. Todas as referências são rastreadas, mesmo de visitantes que nunca se cadastram
4. O localStorage é usado para persistir o identificador do visitante entre sessões
