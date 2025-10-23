# 💳 Guia: Stripe Transfers & Wire Transfers - Wells Fargo

Este guia documenta a detecção automática de transferências Stripe (recebimentos de cartão) e Wire Transfers (pagamentos/saídas) nos extratos do Wells Fargo.

---

## 📋 Sumário

1. [Stripe Transfers (Recebimentos)](#1-stripe-transfers-recebimentos)
2. [Wire Transfers (Pagamentos)](#2-wire-transfers-pagamentos)
3. [Ordem de Prioridade](#3-ordem-de-prioridade)
4. [Testes](#4-testes)
5. [Queries SQL](#5-queries-sql)

---

## 1. Stripe Transfers (Recebimentos)

### 📥 O que são?

Stripe Transfers são **recebimentos de pagamentos com cartão** que aparecem no extrato bancário quando você recebe fundos do Stripe para sua conta Wells Fargo.

### 🔍 Como são detectados?

**Padrão na coluna Description:**
```
STRIPE TRANSFER ST-XXXXX [NOME DO COMERCIANTE] [TELEFONE/NÚMEROS] ...
```

**Exemplo real:**
```
STRIPE TRANSFER ST-W6V3O5D5L9X1 KINGDOM AUTO FINANCE L 4270465600 ST-W6V3O5D5L9X1 R00000091003954230522N
```

### ✅ Resultado da Importação

**Campos no banco:**
- `depositor`: **Nome do comerciante** (extraído automaticamente)
  - Ex: "KINGDOM AUTO FINANCE L"
- `payment_method`: **"Stripe receipt"**
- `value`: Valor positivo (entrada de dinheiro)
- `status`: "pending-statement"

### 🎯 Extração do Nome do Comerciante

O parser extrai automaticamente o nome do comerciante:

1. Localiza "ST-" no texto
2. Pega todas as palavras após ST-XXXXX
3. Para quando encontra:
   - Números de telefone (10+ dígitos)
   - Outro código ST-
   - Código de referência (R0...)

**Exemplos:**

| Descrição Original | Depositor Extraído |
|--------------------|-------------------|
| STRIPE TRANSFER ST-ABC123 ACME CORP 5551234567 ... | ACME CORP |
| STRIPE TRANSFER ST-XYZ789 GLOBAL SERVICES LLC 8889876543 ... | GLOBAL SERVICES LLC |
| STRIPE TRANSFER ST-DEF456 AUTO FINANCE 4441112222 ... | AUTO FINANCE |

### 📊 Uso Típico

**Cenário:** Você processa pagamentos com cartão pelo Stripe e recebe os fundos na sua conta bancária.

**No extrato Wells Fargo:**
- Aparece como "STRIPE TRANSFER..."
- Valor positivo
- Data do depósito

**No sistema:**
- Identificado automaticamente como "Stripe receipt"
- Nome do comerciante salvo no campo depositor
- Pronto para reconciliação com transações Stripe

---

## 2. Wire Transfers (Pagamentos)

### 💸 O que são?

Wire Transfers são **pagamentos enviados** via transferência bancária federal (FED wire) para terceiros.

### 🔍 Como são detectados?

**Padrão na coluna Description:**
```
WT FED#XXXXX [BANCO] /FTR/BNF=[BENEFICIÁRIO] SRF# ... TRN# ... RFB# ...
```

**Exemplo real:**
```
WT FED#02R01 JPMORGAN CHASE BAN /FTR/BNF=Driveway Direct Motors LLC SRF# GW00000079760164 TRN#251015175384 RFB# 117
```

### ✅ Resultado da Importação

**Campos no banco:**
- `depositor`: **Nome do beneficiário** (extraído do campo /BNF=)
  - Ex: "Driveway Direct Motors LLC"
- `payment_method`: **"Wire Transfer"**
- `value`: Valor negativo (saída de dinheiro)
- `status`: "pending-statement"

### 🎯 Extração do Beneficiário

O parser extrai automaticamente o beneficiário usando regex:

```regex
/\/BNF=([^\/\s]+(?:\s+[^\/\s]+)*?)(?:\s+SRF#|\s+TRN#|\s+RFB#|$)/i
```

Isso captura tudo após `/BNF=` até encontrar:
- `SRF#` (Source Reference)
- `TRN#` (Transaction Number)
- `RFB#` (Reference Number)
- Fim da string

**Exemplos:**

| Descrição Original | Depositor Extraído |
|--------------------|-------------------|
| WT FED#... /BNF=Driveway Direct Motors LLC SRF# ... | Driveway Direct Motors LLC |
| WT FED#... /BNF=Capital One Auto Finance SRF# ... | Capital One Auto Finance |
| WT FED#... /BNF=AutoNation Finance Corp SRF# ... | AutoNation Finance Corp |

### 📊 Uso Típico

**Cenário:** Você faz um pagamento grande para um fornecedor ou parceiro via wire transfer.

**No extrato Wells Fargo:**
- Aparece como "WT FED..."
- Valor negativo
- Data do pagamento

**No sistema:**
- Identificado automaticamente como "Wire Transfer"
- Nome do beneficiário salvo
- Classificado como pagamento (saída)

---

## 3. Ordem de Prioridade

O sistema verifica os padrões nesta ordem:

```
1. STRIPE TRANSFER → "Stripe receipt" (recebimentos)
2. WT FED → "Wire Transfer" (pagamentos)
3. DEPOSIT MADE IN A BRANCH/STORE → "deposit"
4. ZELLE FROM → "Zelle"
5. Depositor Name presente → "Zelle"
6. Nenhum padrão → "deposito" (generic)
```

**Importante:** Stripe Transfers têm **prioridade máxima** porque são fáceis de identificar e sempre seguem o mesmo padrão.

---

## 4. Testes

### 📁 Arquivos de Teste Prontos

#### Teste 1: Stripe Transfers

**Arquivo:** `test-stripe-transfers.csv`

```csv
Date,Amount,Depositor Name,Description
01/20/2024,5000.00,,STRIPE TRANSFER ST-W6V3O5D5L9X1 KINGDOM AUTO FINANCE L 4270465600 ST-W6V3O5D5L9X1 R00000091003954230522N
01/21/2024,3250.50,,STRIPE TRANSFER ST-ABC123XYZ ACME CORPORATION 5551234567 ST-ABC123XYZ R00000091003954230522N
01/22/2024,1500.00,,STRIPE TRANSFER ST-DEF456GHI GLOBAL SERVICES LLC 8889876543 ST-DEF456GHI R00000091003954230522N
```

**Resultado esperado:**

| Date | Amount | Depositor | Method |
|------|--------|-----------|--------|
| 01/20/2024 | 5000.00 | KINGDOM AUTO FINANCE L | Stripe receipt |
| 01/21/2024 | 3250.50 | ACME CORPORATION | Stripe receipt |
| 01/22/2024 | 1500.00 | GLOBAL SERVICES LLC | Stripe receipt |

#### Teste 2: Wire Transfers

**Arquivo:** `test-wire-transfers.csv`

```csv
Date,Amount,Depositor Name,Description
01/15/2024,-15000.00,,WT FED#02R01 JPMORGAN CHASE BAN /FTR/BNF=Driveway Direct Motors LLC SRF# GW00000079760164 TRN#251015175384 RFB# 117
01/16/2024,-8500.50,,WT FED#03R02 BANK OF AMERICA /FTR/BNF=AutoNation Finance Corp SRF# GW00000079760165 TRN#251016180245 RFB# 118
01/17/2024,-12000.00,,WT FED#04R03 WELLS FARGO BANK /FTR/BNF=Capital One Auto Finance SRF# GW00000079760166 TRN#251017181356 RFB# 119
```

**Resultado esperado:**

| Date | Amount | Depositor | Method |
|------|--------|-----------|--------|
| 01/15/2024 | -15000.00 | Driveway Direct Motors LLC | Wire Transfer |
| 01/16/2024 | -8500.50 | AutoNation Finance Corp | Wire Transfer |
| 01/17/2024 | -12000.00 | Capital One Auto Finance | Wire Transfer |

### 🎯 Como Testar

1. **Upload os arquivos:**
   - Acesse página **Upload**
   - Card "Upload Bank Statement (Wells Fargo)"
   - Selecione `test-stripe-transfers.csv`
   - Upload (3 transações)
   - Selecione `test-wire-transfers.csv`
   - Upload (3 transações)

2. **Verificar resultados:**
   - Vá para **Transactions**
   - Filtre por payment_method = "Stripe receipt"
   - Filtre por payment_method = "Wire Transfer"

3. **Validar campos:**
   - Depositor deve ser o nome extraído
   - Payment method correto
   - Valores corretos (positivos para Stripe, negativos para Wire)

---

## 5. Queries SQL

### 📊 Ver Stripe Transfers

```sql
-- Todos os recebimentos Stripe
SELECT
  date,
  value,
  depositor,
  payment_method,
  source
FROM transactions
WHERE payment_method = 'Stripe receipt'
ORDER BY date DESC;
```

### 💸 Ver Wire Transfers

```sql
-- Todos os pagamentos Wire
SELECT
  date,
  value,
  depositor,
  payment_method,
  source
FROM transactions
WHERE payment_method = 'Wire Transfer'
ORDER BY date DESC;
```

### 📈 Estatísticas

```sql
-- Totais por tipo
SELECT
  payment_method,
  COUNT(*) as total_transactions,
  SUM(CAST(value AS DECIMAL)) as total_amount
FROM transactions
WHERE payment_method IN ('Stripe receipt', 'Wire Transfer')
GROUP BY payment_method;
```

**Resultado esperado (com arquivos de teste):**

```
payment_method  | total_transactions | total_amount
----------------|--------------------|--------------
Stripe receipt  | 3                  | 9750.50
Wire Transfer   | 3                  | -35500.50
```

### 🔍 Análise de Fluxo de Caixa

```sql
-- Entradas vs Saídas
SELECT
  CASE
    WHEN CAST(value AS DECIMAL) > 0 THEN 'Entrada'
    ELSE 'Saída'
  END as tipo,
  payment_method,
  COUNT(*) as count,
  SUM(CAST(value AS DECIMAL)) as total
FROM transactions
WHERE payment_method IN ('Stripe receipt', 'Wire Transfer')
GROUP BY tipo, payment_method
ORDER BY tipo, payment_method;
```

### 📅 Análise Mensal

```sql
-- Por mês
SELECT
  DATE_TRUNC('month', date::date) as month,
  payment_method,
  COUNT(*) as transactions,
  SUM(CAST(value AS DECIMAL)) as total
FROM transactions
WHERE payment_method IN ('Stripe receipt', 'Wire Transfer')
GROUP BY month, payment_method
ORDER BY month DESC, payment_method;
```

---

## 6. Casos de Uso

### 💼 Caso 1: Reconciliação de Recebimentos Stripe

**Cenário:** Você quer verificar se todos os payouts do Stripe apareceram no banco.

**Passos:**
1. Exporte relatório de payouts do Stripe Dashboard
2. Compare com query de Stripe receipts
3. Identifique discrepâncias

```sql
SELECT
  date,
  depositor as merchant,
  value as amount,
  source
FROM transactions
WHERE payment_method = 'Stripe receipt'
  AND date >= '2024-01-01'
ORDER BY date;
```

### 💸 Caso 2: Análise de Pagamentos Wire

**Cenário:** Você quer ver todos os pagamentos wire do mês para auditoria.

```sql
SELECT
  date,
  depositor as beneficiary,
  ABS(CAST(value AS DECIMAL)) as amount_paid,
  source
FROM transactions
WHERE payment_method = 'Wire Transfer'
  AND date >= DATE_TRUNC('month', CURRENT_DATE)
ORDER BY date;
```

### 📊 Caso 3: Dashboard Financeiro

**Cenário:** Criar view para dashboard com resumo de transferências.

```sql
CREATE OR REPLACE VIEW v_transfer_summary AS
SELECT
  DATE_TRUNC('week', date::date) as week,
  SUM(CASE WHEN payment_method = 'Stripe receipt' THEN CAST(value AS DECIMAL) ELSE 0 END) as stripe_in,
  SUM(CASE WHEN payment_method = 'Wire Transfer' THEN ABS(CAST(value AS DECIMAL)) ELSE 0 END) as wire_out,
  COUNT(CASE WHEN payment_method = 'Stripe receipt' THEN 1 END) as stripe_count,
  COUNT(CASE WHEN payment_method = 'Wire Transfer' THEN 1 END) as wire_count
FROM transactions
WHERE payment_method IN ('Stripe receipt', 'Wire Transfer')
GROUP BY week
ORDER BY week DESC;
```

---

## 7. Troubleshooting

### ❌ Problema: Nome do comerciante não extraído corretamente

**Causa:** Formato diferente do esperado

**Solução:** Verifique o padrão no description. Se necessário, ajuste a lógica em `parseStripeTransfer()`.

### ❌ Problema: Beneficiário Wire não encontrado

**Causa:** Formato /BNF= diferente

**Solução:** Verifique se há `/BNF=` na descrição. O regex procura por esse padrão específico.

### ❌ Problema: Transação classificada errada

**Causa:** Ordem de prioridade

**Solução:** Lembre-se da ordem:
1. Stripe Transfer (primeiro)
2. Wire Transfer (segundo)
3. Outros padrões (depois)

---

## ✅ Checklist de Validação

Após importar arquivos de teste:

- [ ] Stripe Transfers identificados como "Stripe receipt"
- [ ] Wire Transfers identificados como "Wire Transfer"
- [ ] Nomes/beneficiários extraídos corretamente
- [ ] Valores positivos para Stripe
- [ ] Valores negativos para Wire
- [ ] Sem duplicatas
- [ ] Source correto no banco

---

## 📖 Documentação Relacionada

- **BANK_DEPOSIT_CONFIG.md** - Configuração completa de depósitos
- **COMPLETE_TEST_GUIDE.md** - Guia completo de testes
- **ARCHITECTURE.md** - Arquitetura do sistema

---

## 🎯 Resumo

| Tipo | Payment Method | Depositor | Valor | Uso |
|------|----------------|-----------|-------|-----|
| Stripe Transfer | "Stripe receipt" | Nome do comerciante | Positivo | Recebimentos de cartão via Stripe |
| Wire Transfer | "Wire Transfer" | Nome do beneficiário | Negativo | Pagamentos wire outgoing |

**Implementação:**
- ✅ Parser automático
- ✅ Extração de nomes
- ✅ Prioridade na detecção
- ✅ Arquivos de teste prontos
- ✅ Queries SQL documentadas

---

**Última atualização:** 2025-10-20
**Status:** ✅ IMPLEMENTADO E TESTADO
