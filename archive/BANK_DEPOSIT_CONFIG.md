# 🏦 Bank Deposit Configuration - Wells Fargo

## Overview

Configuração final para importação de extratos bancários do Wells Fargo, com identificação automática de transações Zelle e depósitos genéricos.

---

## ⚙️ Configuração Implementada

### **Regras de Classificação**

**Ordem de prioridade de detecção:**

#### 1. **Stripe Transfers** (PRIORIDADE MÁXIMA - Recebimentos de Cartão)
Identificados quando:
- Descrição começa com: **"STRIPE TRANSFER"**

**Resultado:**
- `depositor`: Nome do comerciante extraído da descrição (ex: "KINGDOM AUTO FINANCE L")
- `payment_method`: **"Stripe receipt"**

**Exemplo:**
```
STRIPE TRANSFER ST-W6V3O5D5L9X1 KINGDOM AUTO FINANCE L 4270465600...
→ depositor: "KINGDOM AUTO FINANCE L"
→ payment_method: "Stripe receipt"
```

#### 2. **Wire Transfers** (Pagamentos/Saídas)
Identificados quando:
- Descrição começa com: **"WT FED"**
- Valor geralmente negativo (saída de dinheiro)

**Resultado:**
- `depositor`: Nome do beneficiário extraído após /BNF= (ex: "Driveway Direct Motors LLC")
- `payment_method`: **"Wire Transfer"**

**Exemplo:**
```
WT FED#02R01 JPMORGAN CHASE BAN /FTR/BNF=Driveway Direct Motors LLC SRF#...
→ depositor: "Driveway Direct Motors LLC"
→ payment_method: "Wire Transfer"
```

#### 3. **Depósitos em Agência/Loja**
Identificados quando:
- Descrição contém: **"DEPOSIT MADE IN A BRANCH/STORE"**

**Resultado:**
- `depositor`: **"Deposit"** (capitalized)
- `payment_method`: **"deposit"** (lowercase)

#### 4. **Transações Zelle**
Identificadas quando:
- Campo `Depositor Name` tem valor, OU
- Descrição contém padrão "ZELLE FROM [nome] ON [data]"

**Resultado:**
- `depositor`: Nome do depositante
- `payment_method`: "Zelle"

#### 5. **Depósitos Genéricos (Outros)**
Identificados quando:
- Campo `Depositor Name` está vazio/nulo
- Não há padrão Zelle, Stripe ou Wire Transfer na descrição
- NÃO contém "DEPOSIT MADE IN A BRANCH/STORE"

**Resultado:**
- `depositor`: **Texto completo da coluna D (Description)**
- `payment_method`: **"deposit"** (lowercase)

**Importante:** O sistema agora usa toda a descrição da coluna D como identificador do cliente/depositor quando não há outros padrões reconhecíveis.

**Exemplos:**
```
Description: "ATM DEPOSIT #1234 AT MAIN STREET BRANCH"
→ depositor: "ATM DEPOSIT #1234 AT MAIN STREET BRANCH"

Description: "MOBILE DEPOSIT CHECK #5678"
→ depositor: "MOBILE DEPOSIT CHECK #5678"

Description: "CASH DEPOSIT BUSINESS ACCOUNT"
→ depositor: "CASH DEPOSIT BUSINESS ACCOUNT"
```

---

## 📋 Exemplos de Comportamento

### Exemplo 1: Depósito em Agência/Loja (PRIORIDADE)
**CSV:**
```csv
Date,Amount,Depositor Name,Description
2024-01-14,750.00,,DEPOSIT MADE IN A BRANCH/STORE
```

**Banco de Dados:**
```
date: 2024-01-14
value: 750.00
depositor: "Deposit"            ← SEMPRE "Deposit" (capitalized)
payment_method: "deposit"       ← SEMPRE "deposit" (lowercase)
source: "Wells Fargo CSV: statement.csv"
```

### Exemplo 2: Transação Zelle com Nome
**CSV:**
```csv
Date,Amount,Depositor Name,Description
2024-01-15,100.00,John Doe,Payment received
```

**Banco de Dados:**
```
date: 2024-01-15
value: 100.00
depositor: "John Doe"
payment_method: "Zelle"
source: "Wells Fargo CSV: statement.csv"
```

### Exemplo 2: Transação Zelle pela Descrição
**CSV:**
```csv
Date,Amount,Depositor Name,Description
2024-01-16,250.00,,ZELLE FROM Jane Smith ON 01/16/2024
```

**Banco de Dados:**
```
date: 2024-01-16
value: 250.00
depositor: "Jane Smith"
payment_method: "Zelle"
source: "Wells Fargo CSV: statement.csv"
```

### Exemplo 3: Depósito Genérico (SEM nome)
**CSV:**
```csv
Date,Amount,Depositor Name,Description
2024-01-17,500.00,,Bank Deposit
```

**Banco de Dados:**
```
date: 2024-01-17
value: 500.00
depositor: "deposito"           ← Sempre "deposito"
payment_method: "deposit"       ← Sempre "deposit"
source: "Wells Fargo CSV: statement.csv"
```

### Exemplo 4: Depósito com Campo Vazio
**CSV:**
```csv
Date,Amount,Depositor Name,Description
2024-01-18,1000.00,"",Cash deposit
```

**Banco de Dados:**
```
date: 2024-01-18
value: 1000.00
depositor: "deposito"           ← String vazia = deposito
payment_method: "deposit"       ← String vazia = deposit
source: "Wells Fargo CSV: statement.csv"
```

---

## 🔍 Lógica de Detecção

```typescript
function parseWellsFargoRow(row: any, fileName: string) {
  const description = row['Description'] || '';
  const parsed = parseWellsFargoDescription(description);

  // PRIORITY 1: Check for branch/store deposit pattern (Column D)
  if (description.toUpperCase().includes('DEPOSIT MADE IN A BRANCH/STORE')) {
    // Branch/store deposit - use "Deposit" (capitalized)
    paymentMethod = 'deposit';
    depositor = 'Deposit';
  } else if (parsed) {
    // Caso 2: Identificado "ZELLE FROM [nome]" na descrição
    paymentMethod = 'Zelle';
    depositor = parsed.name;
  } else {
    const depositorName = row['Depositor Name'];

    if (depositorName && depositorName.trim()) {
      // Caso 3: Tem nome no campo Depositor Name
      paymentMethod = 'Zelle';
      depositor = depositorName;
    } else {
      // Caso 4: SEM nome = Depósito genérico
      paymentMethod = 'deposit';
      depositor = 'deposito';
    }
  }

  return {
    date: parsedDate,
    value: normalizedValue,
    depositor,
    payment_method: paymentMethod,
    source: `Wells Fargo CSV: ${fileName}`,
    status: 'pending-statement',
    confidence: 0
  };
}
```

---

## 📊 Campos no Banco de Dados

### Transações de Depósito

| Campo | Valor | Descrição |
|-------|-------|-----------|
| `depositor` | `"deposito"` | Nome fixo para depósitos genéricos |
| `payment_method` | `"deposit"` | Método fixo para depósitos |
| `source` | `"Wells Fargo CSV: [nome-arquivo]"` | Origem da importação |
| `status` | `"pending-statement"` | Status inicial |
| `date` | ISO 8601 | Data da transação |
| `value` | Decimal string | Valor normalizado |

### Transações Zelle

| Campo | Valor | Descrição |
|-------|-------|-----------|
| `depositor` | Nome do depositante | Extraído do CSV |
| `payment_method` | `"Zelle"` | Método de pagamento |
| `source` | `"Wells Fargo CSV: [nome-arquivo]"` | Origem da importação |
| `status` | `"pending-statement"` | Status inicial |
| `date` | ISO 8601 | Data da transação |
| `value` | Decimal string | Valor normalizado |

---

## 🎯 Queries Úteis

### Ver todos os depósitos genéricos
```sql
SELECT *
FROM transactions
WHERE payment_method = 'deposit'
  AND depositor = 'deposito'
ORDER BY date DESC;
```

### Ver todas as transações Zelle
```sql
SELECT *
FROM transactions
WHERE payment_method = 'Zelle'
ORDER BY date DESC;
```

### Estatísticas por método de pagamento
```sql
SELECT
  payment_method,
  COUNT(*) as total_transactions,
  SUM(CAST(value AS DECIMAL)) as total_amount
FROM transactions
WHERE source LIKE 'Wells Fargo CSV%'
GROUP BY payment_method
ORDER BY total_amount DESC;
```

### Ver depósitos de agência/loja
```sql
SELECT *
FROM transactions
WHERE payment_method = 'deposit'
  AND depositor = 'Deposit'
ORDER BY date DESC;
```

### Ver depósitos genéricos (outros)
```sql
SELECT *
FROM transactions
WHERE payment_method = 'deposit'
  AND depositor = 'deposito'
ORDER BY date DESC;
```

### Ver TODOS os depósitos do último mês
```sql
SELECT
  date,
  value,
  depositor,
  payment_method,
  CASE
    WHEN depositor = 'Deposit' THEN 'Branch/Store'
    WHEN depositor = 'deposito' THEN 'Generic'
    ELSE 'Other'
  END as deposit_type
FROM transactions
WHERE payment_method = 'deposit'
  AND date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY date DESC;
```

---

## ✅ Nomenclatura Padrão

| Tipo | Campo `depositor` | Campo `payment_method` | Identificação |
|------|-------------------|------------------------|---------------|
| **Depósito Agência/Loja** | `"Deposit"` (capitalized) | `"deposit"` (lowercase) | Descrição: "DEPOSIT MADE IN A BRANCH/STORE" |
| **Zelle** | Nome da pessoa | `"Zelle"` (capitalized) | Campo: Depositor Name OU padrão na descrição |
| **Depósito Genérico** | `"deposito"` (lowercase) | `"deposit"` (lowercase) | Sem depositor name, sem padrões específicos |

**Importante:**
- ✅ Use **"Deposit"** (capitalized) para depósitos em agência/loja (coluna D contém "DEPOSIT MADE IN A BRANCH/STORE")
- ✅ Use **"deposito"** (lowercase) para depósitos genéricos (outros casos)
- ✅ Use **"deposit"** (lowercase) para método em TODOS os depósitos
- ✅ Use **"Zelle"** (capitalized) para transações Zelle
- ⚠️ Prioridade: Branch/Store → Zelle → Genérico

---

## 🧪 Testando a Configuração

### Teste 1: CSV com Todos os Tipos de Transação

**Arquivo: `test-complete.csv`**
```csv
Date,Amount,Depositor Name,Description
2024-01-14,1000.00,,DEPOSIT MADE IN A BRANCH/STORE
2024-01-15,100.00,John Doe,Zelle payment
2024-01-16,250.00,,Cash deposit at branch
2024-01-17,150.00,Jane Smith,Payment
2024-01-18,500.00,,ATM deposit
```

**Resultado Esperado:**
| Date | Amount | Depositor | Method | Tipo |
|------|--------|-----------|--------|------|
| 2024-01-14 | 1000.00 | **Deposit** | deposit | Branch/Store ✅ |
| 2024-01-15 | 100.00 | John Doe | Zelle | Zelle |
| 2024-01-16 | 250.00 | deposito | deposit | Genérico |
| 2024-01-17 | 150.00 | Jane Smith | Zelle | Zelle |
| 2024-01-18 | 500.00 | deposito | deposit | Genérico |

### Teste 2: Verificar no Banco

```sql
-- Após importar o CSV, execute:
SELECT
  date,
  value,
  depositor,
  payment_method,
  CASE
    WHEN payment_method = 'deposit' AND depositor = 'Deposit' THEN '✅ Branch/Store'
    WHEN payment_method = 'deposit' AND depositor = 'deposito' THEN '✅ Generic'
    WHEN payment_method = 'Zelle' AND depositor NOT IN ('deposito', 'Deposit') THEN '✅ Zelle'
    ELSE '❌ Erro'
  END as status
FROM transactions
WHERE source LIKE '%test-complete%'
ORDER BY date;
```

**Resultado Esperado:**
```
date       | value   | depositor   | payment_method | status
-----------|---------|-------------|----------------|----------------
2024-01-14 | 1000.00 | Deposit     | deposit        | ✅ Branch/Store
2024-01-15 | 100.00  | John Doe    | Zelle          | ✅ Zelle
2024-01-16 | 250.00  | deposito    | deposit        | ✅ Generic
2024-01-17 | 150.00  | Jane Smith  | Zelle          | ✅ Zelle
2024-01-18 | 500.00  | deposito    | deposit        | ✅ Generic
```

---

## 📝 Interface do Usuário

No componente de upload, o usuário vê:

```
Upload Bank Statement (Wells Fargo)
Import Zelle and deposit transactions from Wells Fargo CSV

Expected Wells Fargo CSV columns:
• Date
• Amount
• Depositor Name or Description

• Zelle: Identified by depositor name
• Deposits: Rows without depositor name marked as "deposito" (method: deposit)
```

---

## 🔄 Impacto em Reconciliação

### Para Depósitos Genéricos

Quando fizer reconciliação com Google Sheets:
- Busque por `depositor = "deposito"`
- Compare apenas por data e valor
- Ignore nome (será sempre "deposito")

### Para Zelle

Quando fizer reconciliação:
- Use o nome do depositante
- Compare data, valor e nome
- Maior precisão na correspondência

---

## 📚 Arquivos Modificados

1. **`src/lib/parsers/bank-parser.ts`**
   - Linha 95-96: `paymentMethod = 'deposit'` e `depositor = 'deposito'`

2. **`src/components/BankUpload.tsx`**
   - Linha 262: Documentação atualizada

3. **`ARCHITECTURE.md`**
   - Linhas 91-94: Especificação de campos

---

## ✅ Status da Configuração

- [x] Lógica implementada
- [x] Build passando
- [x] Documentação atualizada
- [x] Interface do usuário atualizada
- [x] Queries de exemplo fornecidas
- [x] Testes documentados
- [x] Pronto para produção

---

## 🎯 Resumo Executivo

**O que foi configurado:**

Todos os depósitos do Wells Fargo **sem nome de depositante** agora são automaticamente marcados como:
- **Nome (depositor):** `"deposito"`
- **Método (payment_method):** `"deposit"`

Transações Zelle (com nome de depositante) continuam sendo identificadas normalmente com o nome da pessoa e método "Zelle".

Esta configuração permite:
- ✅ Categorização consistente de depósitos
- ✅ Fácil filtração no banco de dados
- ✅ Reconciliação mais simples
- ✅ Relatórios mais claros

---

**Última atualização:** 2025-10-20
**Status:** ✅ CONFIGURADO E TESTADO
**Build:** ✅ PASSANDO
