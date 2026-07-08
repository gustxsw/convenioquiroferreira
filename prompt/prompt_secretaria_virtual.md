# PROMPT — SECRETÁRIA VIRTUAL QUIRO FERREIRA

Cole esse prompt inteiro no Claude Code.

---

## Contexto do projeto

Você está trabalhando no **Convênio Quiro Ferreira (CQF)** — plataforma de convênio de saúde com backend Express + PostgreSQL (queries SQL diretas, sem ORM) e frontend React + TypeScript. O sistema está em produção com usuários reais.

O backend inteiro fica em `server/index.js` — arquivo único grande. Não crie pastas de rotas novas sem necessidade. Siga os padrões já existentes no arquivo.

---

## O que você vai construir

Um serviço de **Secretária Virtual via WhatsApp** integrado ao sistema CQF. O bot recebe mensagens de pacientes pelo WhatsApp (Meta Cloud API), processa a intenção e responde automaticamente, consultando e escrevendo no banco de dados do CQF pelas rotas já existentes.

---

## Arquitetura

Crie um novo arquivo `server/whatsapp.js` — serviço separado mas que importa a conexão com o banco já existente no projeto. Não duplique a conexão com o PostgreSQL — importe o pool já criado em `server/index.js` ou extraia para um `server/db.js` compartilhado se ainda não existir.

Registre o webhook do WhatsApp dentro do próprio `server/index.js` para não precisar de uma porta nova:

```
POST /webhook/whatsapp
GET  /webhook/whatsapp  (verificação da Meta)
```

---

## Fluxo de identificação de intenção

O bot identifica a intenção pela **palavra-chave** na mensagem do paciente. Não usa IA para isso — é lógica fixa com `includes()` nas palavras abaixo:

| Palavras-chave | Intenção |
|---|---|
| agendar, marcar, consulta, quero consulta | AGENDAR |
| remarcar, reagendar, mudar horário, trocar horário | REAGENDAR |
| cancelar, desmarcar, não vou poder ir, não consigo ir | CANCELAR |
| convênio, como funciona, quanto custa, plano, benefício, valor, contratar, quero contratar | CONVENIO |
| oi, olá, bom dia, boa tarde, boa noite, (mensagem vaga sem palavra-chave) | SAUDACAO |

Se receber **áudio** (tipo `audio` no payload da Meta): responde pedindo para digitar, sem processar.

---

## Fluxos do bot

### Estado da conversa
Mantenha o estado da conversa em memória (objeto JavaScript simples `Map<phoneNumber, sessionObject>`). A sessão expira após 30 minutos de inatividade.

```js
{
  step: String,         // etapa atual do fluxo
  intencao: String,     // intenção identificada
  cpf: String,
  pacienteId: Number,
  pacienteNome: String,
  profissionalId: Number,
  consultaId: Number,   // para reagendamento/cancelamento
  timestamp: Date
}
```

### Fluxo SAUDACAO
1. Bot: "Olá. Como posso ajudar? Pode digitar o que precisa."

### Fluxo AGENDAR
1. Bot pede CPF
2. Busca paciente na tabela `users` pela coluna `cpf` onde `role = 'client'`
3. Se não encontrar: coleta nome completo e telefone, insere em `users` com `role = 'client'`, `password` como hash de CPF temporário
4. Busca profissionais disponíveis: `SELECT id, name FROM users WHERE role = 'professional' AND active = true`
5. Se apenas 1 profissional: já seleciona automaticamente, sem perguntar
6. Se mais de 1: lista numerada e pede escolha
7. Chama `GET /api/consultations/agenda` com o `professionalId` para buscar horários disponíveis — filtra os próximos 5 slots livres
8. Lista os horários disponíveis numerados
9. Paciente escolhe o número
10. Cria consulta via `POST /api/consultations` com os dados coletados
11. Confirma com data, hora, profissional e instrução: "Em caso de imprevisto é só mandar mensagem aqui."

### Fluxo REAGENDAR
1. Bot pede CPF
2. Busca paciente
3. Busca próxima consulta ativa: `GET /api/consultations/client/:clientId` — filtra status ativo, data futura
4. Mostra a consulta encontrada e pede confirmação
5. Busca novos horários disponíveis do mesmo profissional
6. Paciente escolhe novo horário
7. Atualiza via `PUT /api/consultations/:id`
8. Confirma remarcação

### Fluxo CANCELAR
1. Bot pede CPF
2. Busca paciente
3. Busca próxima consulta ativa
4. Mostra a consulta e pede confirmação: "Confirma o cancelamento? Responda Sim ou Não."
5. Se Sim: cancela via `POST /api/consultations/:id/cancel`
6. Confirma cancelamento: "Quando quiser reagendar é só mandar mensagem aqui."

### Fluxo CONVENIO
Este é o único fluxo que usa IA (Anthropic Claude).

Chame a API da Anthropic com o seguinte system prompt:

```
Você é a secretária virtual do Convênio Quiro Ferreira.
Responda dúvidas sobre o convênio de forma clara e direta, sem enrolação.

Informações do convênio:
- Plano anual: R$ 600,00
- Benefícios: consultas com desconto, prioridade no agendamento, possibilidade de adicionar dependentes
- Acesso ao painel: cartaoquiroferreira.com.br — login com CPF e senha
- Especialidades disponíveis: conforme profissionais ativos no sistema

Quando o paciente quiser contratar:
1. Peça o CPF
2. Se não encontrar cadastro: colete nome e telefone
3. Informe que o link de pagamento será enviado em seguida
4. Encerre com: "Após a confirmação do pagamento você recebe o acesso ao painel."

Nunca invente informações. Se não souber algo, diga que vai verificar e que em breve retorna.
Seja breve. Máximo 3 parágrafos por resposta.
```

Use o modelo `claude-haiku-4-5-20251001` para manter custo baixo nesse fluxo.

Após resposta da IA, se o paciente disser que quer contratar, coleta CPF e inicia cadastro igual ao fluxo AGENDAR.

---

## Múltiplos profissionais / múltiplos números

O webhook recebe o campo `to` no payload da Meta indicando qual número do WhatsApp recebeu a mensagem. Use esse campo para identificar qual profissional está sendo contactado:

```js
// Tabela de mapeamento — virá do banco futuramente
// Por ora, configurar via variável de ambiente
// WHATSAPP_NUMBERS={"5564999990001": 1, "5564999990002": 2}
// onde o valor é o professionalId
```

Quando identificado o profissional pelo número, os fluxos de agendamento já usam aquele `professionalId` diretamente, sem perguntar ao paciente.

---

## Tratamento de áudio

```js
if (messageType === 'audio') {
  reply("No momento atendo apenas por texto. Pode digitar o que precisa?");
  return;
}
```

---

## Variáveis de ambiente necessárias

Adicione ao `.env`:

```
WHATSAPP_TOKEN=         # token de acesso da Meta Cloud API
WHATSAPP_VERIFY_TOKEN=  # token de verificação do webhook (você define)
WHATSAPP_PHONE_ID=      # Phone Number ID do app da Meta
ANTHROPIC_API_KEY=      # chave da API Anthropic (já deve existir no projeto)
WHATSAPP_NUMBERS=       # JSON mapeando número → professionalId
```

---

## Função de envio de mensagem

```js
async function sendWhatsAppMessage(to, text) {
  await fetch(`https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text }
    })
  });
}
```

---

## Cuidados obrigatórios

- **Nunca remova nem renomeie rotas existentes** no `server/index.js`
- **Não crie uma segunda conexão com o PostgreSQL** — reuse o pool existente
- **Não instale bibliotecas desnecessárias** — use `node-fetch` ou o `fetch` nativo do Node 18+
- **Autenticação**: o bot acessa o banco diretamente via pool, não via JWT. Não há usuário logado nesse contexto
- **Erros**: sempre responda ao paciente em caso de erro interno — nunca deixe a conversa travar. Ex: "Tive um problema interno. Pode tentar novamente?"
- **Mensagens longas**: quebre em múltiplas mensagens se necessário, mas prefira manter em uma só quando possível
- **Não use whatsapp-web.js** — use exclusivamente a Meta Cloud API

---

## Ordem de implementação

1. Webhook de verificação (GET) e recebimento (POST)
2. Identificação de intenção por palavra-chave
3. Gerenciamento de sessão em memória
4. Fluxo AGENDAR completo com integração ao banco
5. Fluxo REAGENDAR
6. Fluxo CANCELAR
7. Fluxo CONVENIO com chamada à API Anthropic
8. Tratamento de áudio
9. Suporte a múltiplos números/profissionais via variável de ambiente

---

## Entregável esperado

- `server/whatsapp.js` — lógica completa do bot
- Duas rotas adicionadas no `server/index.js` — GET e POST `/webhook/whatsapp`
- Instruções no terminal de como registrar o webhook na Meta Cloud API
