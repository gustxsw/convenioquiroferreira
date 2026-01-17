# Configuração do Mercado Pago Sandbox

## Credenciais Necessárias no .env

Você precisa adicionar as seguintes variáveis no seu arquivo `.env`:

```env
# MercadoPago Configuration
MP_ACCESS_TOKEN=TEST-your-test-access-token-here
MP_PUBLIC_KEY=TEST-your-test-public-key-here
MP_SANDBOX_MODE=true
```

## Como Obter as Credenciais de Teste (Sandbox)

### Passo 1: Acesse o Painel do Mercado Pago

1. Acesse: https://www.mercadopago.com.br/developers
2. Faça login com sua conta do Mercado Pago
3. Se não tiver conta, crie uma em: https://www.mercadopago.com.br/hub/registration/landing

### Passo 2: Navegue até Credenciais

1. No menu lateral, clique em **"Suas integrações"**
2. Depois clique em **"Credenciais"**
3. Ou acesse diretamente: https://www.mercadopago.com.br/developers/panel/credentials

### Passo 3: Obtenha as Credenciais de Teste

1. Na página de credenciais, você verá duas abas:
   - **Credenciais de teste** (para desenvolvimento)
   - **Credenciais de produção** (para produção)

2. Clique na aba **"Credenciais de teste"**

3. Você verá duas credenciais importantes:
   - **Public Key de teste** (começa com `TEST-`)
   - **Access Token de teste** (começa com `TEST-`)

4. Copie ambas as credenciais

### Passo 4: Configure o .env

Crie ou edite o arquivo `.env` na raiz do projeto:

```env
# Database Configuration
DATABASE_URL=your-database-url

# JWT Secret
JWT_SECRET=your-secret-key

# MercadoPago Configuration - SANDBOX
MP_ACCESS_TOKEN=TEST-1234567890123456-010101-abcdef1234567890abcdef1234567890-123456789
MP_PUBLIC_KEY=TEST-abcdef12-3456-7890-abcd-ef1234567890
MP_SANDBOX_MODE=true

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Server Configuration
PORT=3001
NODE_ENV=development
```

**IMPORTANTE:**
- As credenciais de teste SEMPRE começam com `TEST-`
- Use `MP_SANDBOX_MODE=true` para desenvolvimento
- NUNCA commite o arquivo `.env` no Git (já está no `.gitignore`)

## Contas de Teste para Simulação

O Mercado Pago fornece contas de teste para você simular compradores e vendedores.

### Criar Usuários de Teste

1. Acesse: https://www.mercadopago.com.br/developers/panel/test-users
2. Clique em **"Criar usuário de teste"**
3. Preencha:
   - Tipo: **Vendedor** ou **Comprador**
   - País: **Brasil**
4. Clique em **"Criar usuário"**

O sistema criará:
- Email: `test_user_123456789@testuser.com`
- Senha: Uma senha aleatória

**Guarde essas credenciais!**

### Usar Contas de Teste

1. **Conta de Vendedor**: Use para receber pagamentos no painel do Mercado Pago
2. **Conta de Comprador**: Use para fazer pagamentos de teste

## Cartões de Teste

Use estes cartões para testar diferentes cenários:

### ✅ Pagamento Aprovado

```
Cartão: 5031 4332 1540 6351
CVV: 123
Validade: 11/25
Nome: APRO (ou qualquer nome)
CPF: Qualquer CPF válido
```

### ❌ Pagamento Recusado

```
Cartão: 5031 4332 1540 6351
CVV: 123
Validade: 11/25
Nome: OCHO (para recusar por fundos insuficientes)
CPF: Qualquer CPF válido
```

### ⏳ Pagamento Pendente

```
Cartão: 5031 4332 1540 6351
CVV: 123
Validade: 11/25
Nome: CONT (para simular pagamento em análise)
CPF: Qualquer CPF válido
```

### 📋 Lista Completa de Status

- **APRO**: Pagamento aprovado
- **OCHO**: Recusado por fundos insuficientes
- **CONT**: Pagamento pendente/em análise
- **CALL**: Recusado, ligar para autorizar
- **FUND**: Recusado por fundos insuficientes
- **SECU**: Recusado por código de segurança inválido
- **EXPI**: Recusado por data de validade inválida
- **FORM**: Recusado por erro no formulário

**Mais cartões de teste:**
- Mastercard: `5031 4332 1540 6351`
- Visa: `4509 9535 6623 3704`
- Amex: `3711 803032 57522`

## Verificar Status dos Pagamentos

### No Painel do Mercado Pago (Sandbox)

1. Faça login com a **conta de teste de vendedor**
2. Acesse: https://www.mercadopago.com.br/activities
3. Você verá todos os pagamentos de teste

### Webhooks

Os webhooks funcionam normalmente no modo sandbox. O sistema enviará notificações para:
- `/api/webhooks/payment-success`

## Logs do Sistema

Quando você inicia o servidor, verá:

```
🔄 Initializing MercadoPago SDK v2...
⚠️  SANDBOX MODE ENABLED - Using test credentials
✅ TEST Access Token detected
✅ MercadoPago SDK v2 initialized
```

Se estiver em produção:

```
🔄 Initializing MercadoPago SDK v2...
🔴 PRODUCTION MODE - Using live credentials
✅ MercadoPago SDK v2 initialized
```

## Testar Pagamentos

### 1. Ativação de Assinatura (Cliente)

```bash
curl -X POST http://localhost:3001/api/payment/create-subscription-payment \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"coupon_code": ""}'
```

### 2. Ativação de Dependente

```bash
curl -X POST http://localhost:3001/api/payment/create-dependent-payment \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dependent_id": 1, "coupon_code": ""}'
```

### 3. Repasse ao Convênio (Profissional)

```bash
curl -X POST http://localhost:3001/api/professional/create-professional-payment \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"amount": "100.00"}'
```

### 4. Acesso à Agenda (Profissional)

```bash
curl -X POST http://localhost:3001/api/professional/create-agenda-payment \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"duration_days": 30}'
```

## URLs Importantes

- **Painel de Desenvolvedores**: https://www.mercadopago.com.br/developers
- **Credenciais**: https://www.mercadopago.com.br/developers/panel/credentials
- **Usuários de Teste**: https://www.mercadopago.com.br/developers/panel/test-users
- **Documentação API**: https://www.mercadopago.com.br/developers/pt/docs
- **Cartões de Teste**: https://www.mercadopago.com.br/developers/pt/docs/checkout-api/integration-test/test-cards

## Mudando para Produção

Quando estiver pronto para produção:

1. Obtenha as credenciais de **produção** no painel
2. Atualize o `.env`:

```env
MP_ACCESS_TOKEN=APP-your-production-access-token
MP_PUBLIC_KEY=APP-your-production-public-key
MP_SANDBOX_MODE=false
```

3. **IMPORTANTE**: Credenciais de produção começam com `APP-`
4. Configure o webhook em produção no painel do Mercado Pago

## Resolução de Problemas

### Erro: "Invalid access token"

- Verifique se copiou a credencial completa
- Certifique-se de estar usando credenciais de **teste** (começam com `TEST-`)
- Verifique se não há espaços extras no `.env`

### Pagamento não aparece no painel

- Certifique-se de estar logado com a **conta de teste de vendedor**
- Aguarde alguns segundos (pode haver delay)
- Verifique os logs do servidor para erros

### Webhook não está funcionando

- Em desenvolvimento local, use ngrok ou similar para expor o webhook
- Configure a URL do webhook no painel do Mercado Pago
- Verifique os logs em `/api/webhooks/payment-success`

## Suporte

- **Documentação Oficial**: https://www.mercadopago.com.br/developers/pt/docs
- **Fórum**: https://www.mercadopago.com.br/developers/pt/support
- **Status da API**: https://status.mercadopago.com/

---

## Resumo das Credenciais

Adicione ao seu `.env`:

```env
MP_ACCESS_TOKEN=TEST-1234567890123456-010101-abcdef1234567890abcdef1234567890-123456789
MP_PUBLIC_KEY=TEST-abcdef12-3456-7890-abcd-ef1234567890
MP_SANDBOX_MODE=true
```

Substitua pelos valores reais obtidos em:
https://www.mercadopago.com.br/developers/panel/credentials

**Cartão de teste para aprovação:**
- Número: `5031 4332 1540 6351`
- Nome: `APRO`
- CVV: `123`
- Validade: `11/25`
