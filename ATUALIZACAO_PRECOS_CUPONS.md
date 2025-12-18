# Atualização de Preços e Cupons - Concluída

Data: 17/12/2025

## Resumo das Alterações

### 1. Valor da Assinatura do Convênio
- **Antes:** R$ 500,00
- **Depois:** R$ 600,00

### 2. Cupom para Assinatura do Titular
- **Cupom Antigo:** MAISSAUDE (DESATIVADO)
  - Desconto: R$ 440,00
  - Valor final: R$ 60,00 (R$ 500 - R$ 440)

- **Cupom Novo:** QUIRO70 (ATIVO)
  - Desconto: R$ 530,00
  - Valor final: R$ 70,00 (R$ 600 - R$ 530)

### 3. Cupom para Dependentes
- **Cupom Antigo:** REIS50 (DESATIVADO)
  - Desconto: R$ 50,00
  - Valor final: R$ 50,00 (R$ 100 - R$ 50)

- **Cupom Novo:** REIS60 (ATIVO)
  - Desconto: R$ 40,00
  - Valor final: R$ 60,00 (R$ 100 - R$ 40)
  - Uso ilimitado: Sim

## Alterações Técnicas Realizadas

### Arquivos Modificados
1. **server/index.js**
   - Linha 643: Valor padrão da assinatura atualizado de 500.0 para 600.0
   - Linha 685: Cupom MAISSAUDE substituído por QUIRO70
   - Linha 729: Cupom REIS50 substituído por REIS60
   - Linha 5440: Preço base do pagamento atualizado de 500.0 para 600.0

### Banco de Dados
Executada migração automática que:
- Atualizou o valor em `system_settings` de 500 para 600
- Desativou os cupons antigos (MAISSAUDE e REIS50)
- Criou/ativou os novos cupons (QUIRO70 e REIS60)

## Verificação dos Resultados

✅ Preço da assinatura: R$ 600,00
✅ QUIRO70 ativo: Desconto de R$ 530,00 → Final R$ 70,00
✅ REIS60 ativo: Desconto de R$ 40,00 → Final R$ 60,00
✅ Cupons antigos desativados
✅ Build do projeto concluído com sucesso

## Próximos Passos

Os clientes agora podem usar:
- **QUIRO70** para pagar R$ 70,00 na assinatura anual (ao invés de R$ 600,00)
- **REIS60** para pagar R$ 60,00 por dependente (ao invés de R$ 100,00)

Os cupons antigos (MAISSAUDE e REIS50) permanecem no banco de dados mas estão desativados e não podem mais ser utilizados.
