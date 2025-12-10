# Sistema de Cupom de Desconto

## Funcionalidades Implementadas

1. **Cupom "MAISSAUDE" - Para Assinatura do Titular**
   - Desconto de R$ 440,00 no valor da assinatura do titular
   - Valor original: R$ 500,00
   - Valor com cupom: R$ 60,00
   - Uso único por cliente

2. **Cupom "REIS50" - Para Dependentes**
   - Desconto de R$ 50,00 no valor de ativação de dependentes
   - Valor original: R$ 100,00
   - Valor com cupom: R$ 50,00
   - **Uso ilimitado** - Cliente pode usar quantas vezes quiser

3. **Interface de Cliente**
   - Campo para inserir código do cupom
   - Botão "Aplicar" para validar o cupom
   - Exibição do valor original e com desconto
   - Mensagem de erro para cupons inválidos
   - Validação de tipo de cupom (titular/dependente)

4. **Integração com Mercado Pago**
   - Valor enviado já com desconto aplicado
   - Registro do uso do cupom no banco de dados

## Como Desativar Cupons

### Desativar cupom MAISSAUDE (titular)

```sql
UPDATE coupons
SET is_active = false
WHERE code = 'MAISSAUDE';
```

### Desativar cupom REIS50 (dependentes)

```sql
UPDATE coupons
SET is_active = false
WHERE code = 'REIS50';
```

### Desativar todos os cupons

```sql
UPDATE coupons
SET is_active = false;
```

## Como Reativar Cupons

### Reativar cupom específico

```sql
UPDATE coupons
SET is_active = true
WHERE code = 'MAISSAUDE';  -- ou 'REIS50'
```

## Como Verificar o Status dos Cupons

```sql
SELECT code, discount_value, coupon_type, is_active, unlimited_use
FROM coupons;
```

### Ver uso de cupons

```sql
SELECT
  c.code,
  COUNT(cu.id) as total_uses,
  SUM(cu.discount_applied) as total_discount
FROM coupons c
LEFT JOIN coupon_usage cu ON c.id = cu.coupon_id
GROUP BY c.id, c.code
ORDER BY c.code;
```

## Estrutura do Banco de Dados

### Tabela `coupons`
- `id`: ID único do cupom
- `code`: Código do cupom (ex: "MAISSAUDE", "REIS50")
- `discount_type`: Tipo de desconto ("fixed" ou "percentage")
- `discount_value`: Valor do desconto (440.00, 50.00)
- `is_active`: Se o cupom está ativo (true/false)
- `coupon_type`: Tipo do cupom ("titular" ou "dependente")
- `unlimited_use`: Se pode ser usado ilimitadamente (true/false)
- `description`: Descrição do cupom
- `created_at`: Data de criação

### Tabela `coupon_usage`
- `id`: ID único do uso
- `coupon_id`: Referência ao cupom usado
- `user_id`: ID do usuário que usou
- `payment_reference`: Referência do pagamento
- `discount_applied`: Valor do desconto aplicado
- `used_at`: Data/hora do uso

## Próximos Passos (Futuro)

Para implementar um painel administrativo completo de gerenciamento de cupons, você precisará:

1. Criar uma página de administração de cupons
2. Adicionar rotas no backend para:
   - Criar novos cupons
   - Editar cupons existentes
   - Ativar/desativar cupons
   - Listar todos os cupons
   - Ver histórico de uso de cupons
3. Implementar validações adicionais:
   - Data de validade
   - Limite de uso por usuário
   - Limite total de usos
   - Cupons por categoria (titular, dependente, profissional)

## Cupons Disponíveis

### MAISSAUDE
- **Tipo**: Assinatura do Titular
- **Desconto**: R$ 440,00
- **Valor final**: R$ 60,00 (de R$ 500,00)
- **Uso**: Único por cliente
- **Status atual**: Ativo

### REIS50
- **Tipo**: Ativação de Dependentes
- **Desconto**: R$ 50,00
- **Valor final**: R$ 50,00 (de R$ 100,00)
- **Uso**: Ilimitado - pode ser usado para ativar múltiplos dependentes
- **Status atual**: Ativo

## Notas Importantes

- Cupons de titular (MAISSAUDE) **só funcionam** na assinatura do titular
- Cupons de dependente (REIS50) **só funcionam** na ativação de dependentes
- Apenas um cupom pode ser usado por pagamento
- O cupom REIS50 pode ser usado **quantas vezes** o cliente quiser
- Os cupons não são retroativos
- Apenas clientes podem usar cupons
- O sistema valida automaticamente o tipo de cupom
