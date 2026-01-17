# Exemplos de Uso do fetchWithAuth

Este documento mostra como usar o helper `fetchWithAuth` em diferentes cenários do aplicativo.

## Importação

```typescript
import { getApiUrl, fetchWithAuth } from "@/utils/apiHelpers";
```

## Exemplos Básicos

### GET Request

```typescript
const fetchUsers = async () => {
  try {
    const apiUrl = getApiUrl();
    const response = await fetchWithAuth(`${apiUrl}/api/users`);

    if (!response.ok) {
      throw new Error("Erro ao buscar usuários");
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching users:", error);
    throw error;
  }
};
```

### POST Request

```typescript
const createUser = async (userData: any) => {
  try {
    const apiUrl = getApiUrl();
    const response = await fetchWithAuth(`${apiUrl}/api/users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(userData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || "Erro ao criar usuário");
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error creating user:", error);
    throw error;
  }
};
```

### PUT Request

```typescript
const updateUser = async (userId: number, userData: any) => {
  try {
    const apiUrl = getApiUrl();
    const response = await fetchWithAuth(`${apiUrl}/api/users/${userId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(userData),
    });

    if (!response.ok) {
      throw new Error("Erro ao atualizar usuário");
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error updating user:", error);
    throw error;
  }
};
```

### DELETE Request

```typescript
const deleteUser = async (userId: number) => {
  try {
    const apiUrl = getApiUrl();
    const response = await fetchWithAuth(`${apiUrl}/api/users/${userId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      throw new Error("Erro ao deletar usuário");
    }

    return true;
  } catch (error) {
    console.error("Error deleting user:", error);
    throw error;
  }
};
```

## Exemplos em Componentes React

### Componente de Lista de Usuários

```typescript
import React, { useState, useEffect } from "react";
import { getApiUrl, fetchWithAuth } from "@/utils/apiHelpers";

const UsersList: React.FC = () => {
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const apiUrl = getApiUrl();
        const response = await fetchWithAuth(`${apiUrl}/api/users`);

        if (!response.ok) {
          throw new Error("Erro ao buscar usuários");
        }

        const data = await response.json();
        setUsers(data);
      } catch (error) {
        console.error("Error:", error);
        setError("Erro ao carregar usuários");
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsers();
  }, []);

  if (isLoading) return <div>Carregando...</div>;
  if (error) return <div>Erro: {error}</div>;

  return (
    <div>
      {users.map((user) => (
        <div key={user.id}>{user.name}</div>
      ))}
    </div>
  );
};
```

### Componente de Formulário com Submit

```typescript
import React, { useState } from "react";
import { getApiUrl, fetchWithAuth } from "@/utils/apiHelpers";

const CreateUserForm: React.FC = () => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const apiUrl = getApiUrl();
      const response = await fetchWithAuth(`${apiUrl}/api/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, email }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Erro ao criar usuário");
      }

      const data = await response.json();
      console.log("Usuário criado:", data);

      setName("");
      setEmail("");
    } catch (error: any) {
      console.error("Error:", error);
      setError(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nome"
      />
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
      />
      <button type="submit" disabled={isLoading}>
        {isLoading ? "Criando..." : "Criar Usuário"}
      </button>
      {error && <div className="error">{error}</div>}
    </form>
  );
};
```

## Exemplos Avançados

### Upload de Arquivo

```typescript
const uploadFile = async (file: File) => {
  try {
    const formData = new FormData();
    formData.append("file", file);

    const apiUrl = getApiUrl();
    const response = await fetchWithAuth(`${apiUrl}/api/upload`, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      throw new Error("Erro ao fazer upload");
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error uploading file:", error);
    throw error;
  }
};
```

### Requisição com Query Parameters

```typescript
const searchUsers = async (searchTerm: string, page: number = 1) => {
  try {
    const apiUrl = getApiUrl();
    const params = new URLSearchParams({
      search: searchTerm,
      page: page.toString(),
      limit: "10",
    });

    const response = await fetchWithAuth(
      `${apiUrl}/api/users?${params.toString()}`
    );

    if (!response.ok) {
      throw new Error("Erro ao buscar usuários");
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error searching users:", error);
    throw error;
  }
};
```

### Requisição com Timeout

```typescript
const fetchWithTimeout = async (url: string, timeout: number = 5000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetchWithAuth(url, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response;
  } catch (error: any) {
    if (error.name === "AbortError") {
      throw new Error("Requisição excedeu o tempo limite");
    }
    throw error;
  }
};
```

### Polling (Requisições Periódicas)

```typescript
const startPolling = (url: string, interval: number = 5000) => {
  const pollData = async () => {
    try {
      const response = await fetchWithAuth(url);

      if (!response.ok) {
        throw new Error("Erro ao buscar dados");
      }

      const data = await response.json();
      console.log("Dados atualizados:", data);
      return data;
    } catch (error) {
      console.error("Polling error:", error);
    }
  };

  pollData();

  const intervalId = setInterval(pollData, interval);

  return () => clearInterval(intervalId);
};

const MyComponent = () => {
  useEffect(() => {
    const apiUrl = getApiUrl();
    const cleanup = startPolling(`${apiUrl}/api/status`, 10000);

    return cleanup;
  }, []);

  return <div>Polling ativo...</div>;
};
```

### Múltiplas Requisições em Paralelo

```typescript
const fetchMultipleResources = async () => {
  try {
    const apiUrl = getApiUrl();

    const [usersResponse, servicesResponse, reportsResponse] =
      await Promise.all([
        fetchWithAuth(`${apiUrl}/api/users`),
        fetchWithAuth(`${apiUrl}/api/services`),
        fetchWithAuth(`${apiUrl}/api/reports`),
      ]);

    if (!usersResponse.ok || !servicesResponse.ok || !reportsResponse.ok) {
      throw new Error("Erro ao buscar dados");
    }

    const [users, services, reports] = await Promise.all([
      usersResponse.json(),
      servicesResponse.json(),
      reportsResponse.json(),
    ]);

    return { users, services, reports };
  } catch (error) {
    console.error("Error fetching resources:", error);
    throw error;
  }
};
```

## Hook Customizado

```typescript
import { useState, useCallback } from "react";
import { getApiUrl, fetchWithAuth } from "@/utils/apiHelpers";

export const useFetchWithAuth = <T = any>() => {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(async (url: string, options?: RequestInit) => {
    setIsLoading(true);
    setError(null);

    try {
      const apiUrl = getApiUrl();
      const response = await fetchWithAuth(`${apiUrl}${url}`, options);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Erro na requisição");
      }

      const result = await response.json();
      setData(result);
      return result;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { data, isLoading, error, execute };
};

// Uso do hook
const MyComponent = () => {
  const { data, isLoading, error, execute } = useFetchWithAuth<User[]>();

  const loadUsers = async () => {
    await execute("/api/users");
  };

  useEffect(() => {
    loadUsers();
  }, []);

  if (isLoading) return <div>Carregando...</div>;
  if (error) return <div>Erro: {error}</div>;
  if (!data) return null;

  return (
    <div>
      {data.map((user) => (
        <div key={user.id}>{user.name}</div>
      ))}
    </div>
  );
};
```

## Tratamento de Erros

### Tratamento Global de Erros

```typescript
const handleApiError = (error: any) => {
  if (error.message.includes("Failed to fetch")) {
    return "Erro de conexão. Verifique sua internet.";
  }

  if (error.message.includes("401")) {
    return "Sessão expirada. Faça login novamente.";
  }

  if (error.message.includes("403")) {
    return "Você não tem permissão para esta ação.";
  }

  if (error.message.includes("404")) {
    return "Recurso não encontrado.";
  }

  if (error.message.includes("500")) {
    return "Erro no servidor. Tente novamente mais tarde.";
  }

  return error.message || "Erro desconhecido";
};

// Uso
try {
  await fetchWithAuth(url);
} catch (error) {
  const errorMessage = handleApiError(error);
  setError(errorMessage);
}
```

## Notas Importantes

1. **Renovação Automática**: O `fetchWithAuth` renova automaticamente o token quando expira
2. **Logout Automático**: Se o refresh token expirar, o usuário é automaticamente deslogado
3. **Fila de Requisições**: Múltiplas requisições simultâneas durante renovação são enfileiradas
4. **Compatibilidade**: Funciona com todos os métodos HTTP (GET, POST, PUT, DELETE, PATCH)
5. **Headers Customizados**: Você pode adicionar headers personalizados normalmente

## Migração de Código Existente

### Antes

```typescript
const token = localStorage.getItem("token");
const response = await fetch(`${apiUrl}/api/users`, {
  headers: {
    Authorization: `Bearer ${token}`,
  },
});
```

### Depois

```typescript
const response = await fetchWithAuth(`${getApiUrl()}/api/users`);
```

O `fetchWithAuth` adiciona automaticamente o header de autorização e gerencia a renovação de tokens!
