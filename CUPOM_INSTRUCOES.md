# Sistema de Cupom de Desconto

## Funcionalidades Implementadas

1. **Cupom Fixo "MAISSAUDE"**
   - Desconto de R$ 60,00 no valor da assinatura do titular
   - Valor original: R$ 500,00
   - Valor com cupom: R$ 440,00

2. **Interface de Cliente**
   - Campo para inserir código do cupom
   - Botão "Aplicar" para validar o cupom
   - Exibição do valor original e com desconto
   - Mensagem de erro para cupons inválidos

3. **Integração com Mercado Pago**
   - Valor enviado já com desconto aplicado
   - Registro do uso do cupom no banco de dados

## Como Desativar o Cupom "MAISSAUDE"

Para desativar o cupom, execute o seguinte comando SQL no seu banco de dados:

```sql
UPDATE coupons
SET is_active = false
WHERE code = 'MAISSAUDE';
```

## Como Reativar o Cupom

Para reativar o cupom, execute:

```sql
UPDATE coupons
SET is_active = true
WHERE code = 'MAISSAUDE';
```

## Como Verificar o Status do Cupom

```sql
SELECT code, discount_value, is_active
FROM coupons
WHERE code = 'MAISSAUDE';
```

## Estrutura do Banco de Dados

### Tabela `coupons`
- `id`: ID único do cupom
- `code`: Código do cupom (ex: "MAISSAUDE")
- `discount_type`: Tipo de desconto ("fixed" ou "percentage")
- `discount_value`: Valor do desconto (60.00)
- `is_active`: Se o cupom está ativo (true/false)
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

## Notas Importantes

- O cupom **NÃO** se aplica ao valor de dependentes (R$ 100,00)
- Apenas um cupom pode ser usado por pagamento
- O cupom não é retroativo
- Apenas clientes podem usar cupons na assinatura
