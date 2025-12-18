# Sistema de Renovação Automática de Tokens

## Problema Identificado

Quando o usuário deixava o sistema aberto por mais de 15 minutos, o access token expirava e todas as informações desapareciam da tela, forçando o usuário a fazer login novamente.

## Solução Implementada

### 1. Estrutura de Tokens

O sistema utiliza dois tipos de tokens:

- **Access Token**: Expira em 15 minutos (usado em todas as requisições)
- **Refresh Token**: Expira em 7 dias (usado para renovar o access token)

### 2. Renovação Automática de Tokens

#### AuthContext (Frontend)

Implementado um sistema de renovação automática que:

- Executa a cada **10 minutos** automaticamente
- Renova o access token antes de expirar
- Mantém o usuário logado enquanto o refresh token for válido
- Desconecta o usuário automaticamente se o refresh token expirar

**Arquivo modificado**: `src/contexts/AuthContext.tsx`

**Recursos adicionados**:
- `refreshIntervalRef`: Referência para o intervalo de renovação
- `useEffect` que inicia o intervalo quando o usuário faz login
- Limpeza do intervalo no logout e ao desmontar o componente

#### Helper de Requisições com Auth

O sistema já possui a função `fetchWithAuth` que:

- Detecta automaticamente quando o token expira (erro 401 com código TOKEN_EXPIRED)
- Renova o token usando o refresh token
- Reexecuta a requisição original com o novo token
- Gerencia fila de requisições durante a renovação

**Arquivo**: `src/utils/apiHelpers.ts`

### 3. Endpoint de Refresh

**Endpoint**: `POST /api/auth/refresh`

**Funcionamento**:
1. Recebe o refresh token no body
2. Valida o refresh token
3. Verifica se o token está no banco de dados e não foi revogado
4. Gera um novo access token e um novo refresh token
5. Revoga o refresh token antigo
6. Retorna os novos tokens e dados do usuário

### 4. Como Funciona na Prática

#### Cenário 1: Usuário Ativo
1. Usuário faz login e recebe ambos os tokens
2. A cada 10 minutos, o sistema renova automaticamente o access token
3. Usuário permanece logado indefinidamente enquanto usar o sistema

#### Cenário 2: Usuário Inativo por 7 dias
1. Após 7 dias de inatividade, o refresh token expira
2. Na próxima tentativa de renovação, o sistema detecta que o refresh token expirou
3. Usuário é desconectado automaticamente e redirecionado para a página de login

#### Cenário 3: Requisição com Token Expirado
1. Usuário faz uma requisição com um access token expirado
2. Backend retorna erro 401 com código TOKEN_EXPIRED
3. `fetchWithAuth` detecta o erro e renova o token automaticamente
4. A requisição é reexecutada com o novo token
5. Usuário nem percebe que o token expirou

### 5. Segurança

- Tokens são armazenados em localStorage
- Refresh tokens são hasheados no banco de dados
- Refresh tokens antigos são revogados ao gerar novos
- Todos os refresh tokens são revogados no logout
- Sistema de fila evita múltiplas renovações simultâneas

## Logs do Sistema

O sistema exibe logs detalhados no console:

- `🔄 Starting automatic token refresh interval`: Intervalo de renovação iniciado
- `🔄 Automatically refreshing access token`: Renovando token automaticamente
- `✅ Token refreshed successfully`: Token renovado com sucesso
- `❌ Failed to refresh token`: Falha ao renovar token

## Arquivos Modificados

1. **src/contexts/AuthContext.tsx**
   - Adicionado import de `refreshAccessToken` e `useRef`
   - Adicionado `refreshIntervalRef` para gerenciar o intervalo
   - Adicionado `useEffect` para renovação automática a cada 10 minutos
   - Modificado `logout` para limpar o intervalo

2. **src/utils/apiHelpers.ts** (já existia)
   - Função `refreshAccessToken()`: Renova o access token
   - Função `fetchWithAuth()`: Intercepta erros 401 e renova automaticamente

## Uso Recomendado

Para garantir que as requisições utilizem o sistema de renovação automática, sempre use `fetchWithAuth` ao invés de `fetch` direto:

```typescript
import { fetchWithAuth, getApiUrl } from '../utils/apiHelpers';

const apiUrl = getApiUrl();
const response = await fetchWithAuth(`${apiUrl}/api/endpoint`, {
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
  },
});
```

## Benefícios

✅ Usuário permanece logado indefinidamente enquanto usar o sistema
✅ Não perde dados ou precisa fazer login novamente durante o uso
✅ Renovação transparente e automática
✅ Segurança mantida com tokens de curta duração
✅ Desconexão automática após período de inatividade
