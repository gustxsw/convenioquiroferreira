# Sistema de Refresh Token - Documentação Completa

## Visão Geral

O sistema agora implementa um fluxo de autenticação com **access token** e **refresh token** para manter o usuário logado automaticamente sem interrupções.

### Principais Características

- **Access Token**: Validade de 15 minutos
- **Refresh Token**: Validade de 7 dias
- **Renovação Automática**: O frontend renova tokens expirados automaticamente
- **Segurança**: Refresh tokens são hasheados no banco e rotacionados a cada uso
- **Prevenção de Reutilização**: Tokens usados são marcados como revogados

## Arquitetura

### Backend (Node.js + Express)

#### 1. Tabela de Banco de Dados

```sql
CREATE TABLE refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  revoked BOOLEAN DEFAULT false
);
```

#### 2. Funções de Geração de Tokens

```javascript
// Access Token - 15 minutos
const generateAccessToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      currentRole: user.currentRole,
      roles: user.roles,
    },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );
};

// Refresh Token - 7 dias
const generateRefreshToken = () => {
  return jwt.sign(
    { type: "refresh" },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

// Hash do Refresh Token para armazenamento seguro
const hashRefreshToken = async (token) => {
  return await bcrypt.hash(token, 10);
};

// Salvar Refresh Token no banco
const saveRefreshToken = async (userId, token) => {
  const tokenHash = await hashRefreshToken(token);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );
};
```

#### 3. Endpoint de Login (Select Role)

**POST** `/api/auth/select-role`

```json
// Request
{
  "userId": 1,
  "role": "client"
}

// Response
{
  "message": "Role selecionada com sucesso",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "name": "João Silva",
    "roles": ["client", "professional"],
    "currentRole": "client",
    "subscription_status": "active"
  }
}
```

#### 4. Endpoint de Refresh

**POST** `/api/auth/refresh`

```json
// Request
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}

// Response
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "name": "João Silva",
    "roles": ["client", "professional"],
    "currentRole": "client"
  }
}
```

**Comportamento:**
- Valida o refresh token
- Busca o token hasheado no banco de dados
- Revoga o token antigo (previne reutilização)
- Gera novo access token e refresh token
- Retorna ambos os novos tokens

#### 5. Middleware de Autenticação

O middleware agora retorna códigos específicos para diferentes tipos de erro:

```javascript
// TOKEN_EXPIRED - Access token expirado (renova automaticamente)
// NO_TOKEN - Nenhum token fornecido
// INVALID_TOKEN - Token inválido
// USER_NOT_FOUND - Usuário não encontrado
// AUTH_ERROR - Erro genérico de autenticação
```

**Exemplo de resposta quando token expira:**

```json
{
  "message": "Token expirado",
  "code": "TOKEN_EXPIRED"
}
```

#### 6. Endpoint de Logout

**POST** `/api/auth/logout`

```json
// Request
{
  "userId": 1
}

// Response
{
  "message": "Logout realizado com sucesso"
}
```

**Comportamento:**
- Revoga todos os refresh tokens ativos do usuário
- Limpa o cookie de autenticação

### Frontend (React + TypeScript)

#### 1. Helper de API com Interceptor

Arquivo: `src/utils/apiHelpers.ts`

```typescript
import { getApiUrl, fetchWithAuth } from "@/utils/apiHelpers";

// Uso básico
const response = await fetchWithAuth(
  `${getApiUrl()}/api/users`,
  {
    method: "GET",
  }
);

// Com POST
const response = await fetchWithAuth(
  `${getApiUrl()}/api/users`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "João" }),
  }
);
```

**Como funciona:**

1. Adiciona automaticamente o token de autorização no header
2. Se receber erro 401 com código `TOKEN_EXPIRED`:
   - Chama `/api/auth/refresh` com o refresh token
   - Salva os novos tokens no localStorage
   - Retenta a requisição original automaticamente
3. Se o refresh falhar:
   - Remove todos os tokens
   - Redireciona para a página de login

#### 2. AuthContext Atualizado

O AuthContext agora gerencia ambos os tokens:

```typescript
// No selectRole
localStorage.setItem("token", data.accessToken);
localStorage.setItem("refreshToken", data.refreshToken);
localStorage.setItem("user", JSON.stringify(data.user));

// No logout
localStorage.removeItem("token");
localStorage.removeItem("refreshToken");
localStorage.removeItem("user");
```

#### 3. Fluxo de Renovação Automática

```
Usuário faz requisição
    ↓
fetchWithAuth intercepta
    ↓
Adiciona token ao header
    ↓
Envia requisição
    ↓
Servidor responde 401 TOKEN_EXPIRED?
    ↓ Não → Retorna resposta
    ↓ Sim
    ↓
Chama /api/auth/refresh
    ↓
Sucesso?
    ↓ Sim → Salva novos tokens
    │       Retenta requisição original
    │       Retorna resposta
    ↓ Não
    ↓
Remove tokens
Redireciona para login
```

## Exemplos de Uso

### Frontend - Fazendo Requisições Autenticadas

**Antes (sem refresh automático):**

```typescript
const token = localStorage.getItem("token");
const response = await fetch(`${apiUrl}/api/users`, {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});

if (response.status === 401) {
  // Usuário precisa fazer login manualmente
  navigate("/login");
}
```

**Depois (com refresh automático):**

```typescript
import { getApiUrl, fetchWithAuth } from "@/utils/apiHelpers";

// Renovação automática de token!
const response = await fetchWithAuth(`${getApiUrl()}/api/users`);

// Se o token expirou, ele é renovado automaticamente
// Se o refresh falhar, o usuário é redirecionado para login
```

### Backend - Protegendo Rotas

```javascript
// Rota protegida com middleware
app.get("/api/users", authenticate, authorize(["admin"]), async (req, res) => {
  // Se chegou aqui, o token é válido
  const users = await pool.query("SELECT * FROM users");
  res.json(users.rows);
});
```

## Segurança

### 1. Hash de Refresh Tokens

Os refresh tokens são hasheados com bcrypt antes de serem armazenados no banco de dados:

```javascript
const tokenHash = await bcrypt.hash(token, 10);
```

### 2. Rotação de Tokens

Cada vez que um refresh token é usado, ele é revogado e um novo é gerado:

```javascript
// Revogar token antigo
await pool.query(
  `UPDATE refresh_tokens SET revoked = true WHERE id = $1`,
  [matchedToken.id]
);

// Gerar e salvar novo token
await saveRefreshToken(user.id, newRefreshToken);
```

### 3. Prevenção de Reutilização

- Tokens revogados não podem ser usados novamente
- Tokens expirados são automaticamente invalidados
- Múltiplos refresh tokens podem existir por usuário (múltiplos dispositivos)

### 4. Expiração

- **Access Token**: 15 minutos
- **Refresh Token**: 7 dias
- Usuários inativos por mais de 7 dias precisam fazer login novamente

## Testando o Sistema

### 1. Teste Manual de Expiração

Para testar a renovação automática, você pode temporariamente reduzir o tempo de expiração do access token:

```javascript
// Em server/index.js - APENAS PARA TESTE
const generateAccessToken = (user) => {
  return jwt.sign(
    { /* ... */ },
    process.env.JWT_SECRET,
    { expiresIn: "30s" } // 30 segundos para teste
  );
};
```

### 2. Cenários de Teste

**Cenário 1: Renovação Automática**
1. Fazer login
2. Esperar o token expirar (15 minutos ou tempo configurado)
3. Fazer uma requisição qualquer
4. Verificar que a requisição foi bem-sucedida (token renovado automaticamente)

**Cenário 2: Refresh Token Expirado**
1. Fazer login
2. Alterar manualmente o refresh token no localStorage para um valor inválido
3. Esperar o access token expirar
4. Fazer uma requisição
5. Verificar que o usuário foi redirecionado para login

**Cenário 3: Múltiplas Requisições Simultâneas**
1. Fazer login
2. Esperar o token expirar
3. Fazer múltiplas requisições ao mesmo tempo
4. Verificar que apenas uma renovação de token ocorre (fila de requisições)

## Monitoramento

### Logs do Backend

```
✅ Tokens refreshed successfully for user: 1
❌ Invalid or expired refresh token
❌ Refresh token not found in database
❌ Access token expired
```

### Verificar Tokens no Banco

```sql
-- Ver todos os refresh tokens ativos
SELECT
  rt.id,
  rt.user_id,
  u.name,
  rt.created_at,
  rt.expires_at,
  rt.revoked
FROM refresh_tokens rt
JOIN users u ON rt.user_id = u.id
WHERE rt.revoked = false
ORDER BY rt.created_at DESC;

-- Ver tokens expirados
SELECT COUNT(*)
FROM refresh_tokens
WHERE expires_at < NOW() AND revoked = false;
```

## Limpeza de Tokens Antigos

Recomenda-se criar uma tarefa agendada (cron job) para limpar tokens expirados:

```javascript
// Exemplo de limpeza (executar diariamente)
const cleanupExpiredTokens = async () => {
  await pool.query(
    `DELETE FROM refresh_tokens
     WHERE expires_at < NOW() OR
           (revoked = true AND created_at < NOW() - INTERVAL '30 days')`
  );
};
```

## Migração do Sistema Antigo

Se você já tinha usuários logados com o sistema antigo de token de 24h:

1. Eles continuarão funcionando até expirar (retrocompatibilidade)
2. Quando fizerem login novamente, receberão os novos tokens
3. O sistema funciona lado a lado durante a transição

## Troubleshooting

### Problema: Token não renova automaticamente

**Solução:**
- Verificar se o `fetchWithAuth` está sendo usado nas requisições
- Verificar console do navegador para erros de refresh
- Confirmar que o refresh token está no localStorage

### Problema: Usuário deslogado frequentemente

**Solução:**
- Verificar se o refresh token está sendo salvo corretamente
- Confirmar que o servidor de tempo está sincronizado
- Verificar se há múltiplas abas limpando o localStorage

### Problema: "Refresh token inválido"

**Solução:**
- Limpar localStorage e fazer login novamente
- Verificar se o token no banco não foi revogado manualmente
- Confirmar que JWT_SECRET é o mesmo em todas as instâncias

## Considerações de Produção

1. **HTTPS Obrigatório**: Sempre use HTTPS em produção
2. **JWT_SECRET**: Use uma chave forte e única
3. **Monitoramento**: Monitore tentativas de refresh falhadas
4. **Rate Limiting**: Implemente rate limiting no endpoint de refresh
5. **Limpeza Automática**: Configure cron job para limpar tokens expirados
