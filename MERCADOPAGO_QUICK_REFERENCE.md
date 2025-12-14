# Mercado Pago Sandbox - Referência Rápida

## 🔑 Credenciais Necessárias no .env

```env
MP_ACCESS_TOKEN=TEST-1234567890123456-010101-abcdef1234567890abcdef1234567890-123456789
MP_PUBLIC_KEY=TEST-abcdef12-3456-7890-abcd-ef1234567890
MP_SANDBOX_MODE=true
```

## 📍 Onde Obter as Credenciais

1. Acesse: **https://www.mercadopago.com.br/developers/panel/credentials**
2. Clique na aba **"Credenciais de teste"**
3. Copie:
   - **Public Key** (começa com `TEST-`)
   - **Access Token** (começa com `TEST-`)

## 💳 Cartão de Teste (Pagamento Aprovado)

```
Número: 5031 4332 1540 6351
Nome: APRO
CVV: 123
Validade: 11/25
CPF: Qualquer CPF válido
```

## 🧪 Outros Cenários de Teste

| Nome no Cartão | Resultado |
|----------------|-----------|
| APRO | ✅ Aprovado |
| OCHO | ❌ Recusado (fundos insuficientes) |
| CONT | ⏳ Pendente |
| CALL | ❌ Recusado (ligar para autorizar) |

## 🔗 Links Úteis

- **Credenciais**: https://www.mercadopago.com.br/developers/panel/credentials
- **Usuários de Teste**: https://www.mercadopago.com.br/developers/panel/test-users
- **Documentação Completa**: Ver `MERCADOPAGO_SANDBOX_SETUP.md`

## ✅ Verificação

Ao iniciar o servidor, você deve ver:

```
⚠️  SANDBOX MODE ENABLED - Using test credentials
✅ TEST Access Token detected
```

## 🚀 Mudando para Produção

```env
MP_ACCESS_TOKEN=APP-your-production-token
MP_PUBLIC_KEY=APP-your-production-key
MP_SANDBOX_MODE=false
```

Credenciais de produção começam com `APP-`
