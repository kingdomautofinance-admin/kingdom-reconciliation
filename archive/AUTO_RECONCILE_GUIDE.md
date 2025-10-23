# 🤖 Auto Reconcile - Guia Completo

## 🎯 O que é Auto Reconcile?

O **Auto Reconcile** é uma funcionalidade automática que combina transações de **pending-ledger** (livro razão/cartão) com **pending-statement** (extrato bancário) quando elas correspondem aos critérios estabelecidos.

---

## ⚙️ Critérios de Matching

Para duas transações serem automaticamente reconciliadas, elas DEVEM atender **TODOS** os critérios abaixo:

### 1. ✅ VALOR (Obrigatório - 30 pontos)
- Os valores devem ser **exatamente iguais**
- Se os valores não batem → **0 pontos** → sem match

### 2. ✅ DATA (Obrigatório - 30 pontos)
- As datas devem estar dentro de **2 dias** de diferença
- Quanto mais próximas as datas, maior a pontuação
- Se diferença > 2 dias → **0 pontos** → sem match

**Exemplos:**
```
Transação 1: 20/10/2024
Transação 2: 21/10/2024 ✅ (1 dia de diferença)
Transação 2: 22/10/2024 ✅ (2 dias de diferença)
Transação 2: 23/10/2024 ❌ (3 dias - fora da tolerância)
```

### 3. ✅ MÉTODO DE PAGAMENTO (Obrigatório - 20 pontos)
- Os métodos devem ser compatíveis
- Se não são compatíveis → **0 pontos** → sem match

**Grupos de Compatibilidade:**

| Grupo | Métodos Compatíveis |
|-------|---------------------|
| **Depósitos** | deposit, Zelle, deposito |
| **Cartões** | Credit Card, Stripe receipt |
| **Wire** | Wire Transfer, wire |

**Exemplos:**
```
✅ Zelle ↔ deposit (ambos do grupo Depósitos)
✅ Credit Card ↔ Stripe receipt (ambos do grupo Cartões)
✅ deposit ↔ deposito (ambos do grupo Depósitos)
❌ Zelle ↔ Credit Card (grupos diferentes)
❌ Wire Transfer ↔ deposit (grupos diferentes)
```

### 4. ✅ NOME/DEPOSITOR (Obrigatório - 20 pontos)
- Deve haver **50% ou mais de similaridade** entre os nomes
- Compara `name` ou `depositor` de ambas as transações
- Algoritmo de similaridade de strings (case-insensitive)
- Se similaridade < 50% → **0 pontos** → sem match

**Exemplos:**
```
✅ "JOHN DOE" ↔ "John Doe" (100% - match perfeito)
✅ "ACME CORP" ↔ "Acme Corporation" (≈70% - match)
✅ "Maria Silva" ↔ "M Silva" (≈60% - match)
❌ "John Doe" ↔ "Jane Smith" (≈20% - sem match)
```

---

## 📊 Sistema de Pontuação

**Total possível:** 100 pontos

| Critério | Pontos | Observação |
|----------|--------|------------|
| Valor igual | 30 | Obrigatório (sem isso = 0) |
| Data próxima | 30 | Obrigatório (tolerância 2 dias) |
| Método compatível | 20 | Obrigatório (mesmo grupo) |
| Nome similar (≥50%) | 20 | Obrigatório (min 50%) |

**Score mínimo para match:** 50 pontos

---

## 🔄 Como Funciona

### Processo Automático:

1. **Busca todas as transações `pending-ledger`**
   - Essas são as transações do cartão/livro razão

2. **Para cada `pending-ledger`, busca candidatos em `pending-statement`**
   - Essas são as transações do extrato bancário

3. **Calcula score de matching para cada par**
   - Aplica os 4 critérios obrigatórios
   - Calcula pontuação total

4. **Se score ≥ 50 pontos:**
   - ✅ Marca ambas as transações como `reconciled`
   - ✅ Liga uma à outra via `matched_transaction_id`
   - ✅ Salva o score de confiança (`confidence`)

5. **Se score < 50 pontos:**
   - ❌ Ignora o par
   - ❌ Mantém ambas como pending

---

## 🎮 Como Usar

### Na Interface:

1. Acesse a página **Transactions**
2. Clique no botão **"Auto Reconcile"** (ícone CheckCircle2)
3. Aguarde o processamento
4. Veja o resultado em um alerta:
   ```
   Auto Reconcile Complete!

   Matched: 15 transactions
   Processed: 20 pending-ledger transactions
   ```

### Interpretação dos Resultados:

- **Matched:** Número de transações que foram reconciliadas com sucesso
- **Processed:** Total de transações pending-ledger analisadas
- **Taxa de sucesso:** Matched / Processed × 100

**Exemplo:**
```
Matched: 15
Processed: 20
Taxa: 15/20 = 75% de sucesso
```

---

## 📋 Cenários de Uso

### Cenário 1: Match Perfeito

**Transação A (pending-ledger):**
```
date: 2024-01-20
value: 100.00
payment_method: Credit Card
name: John Doe
```

**Transação B (pending-statement):**
```
date: 2024-01-20
value: 100.00
payment_method: Credit Card
depositor: John Doe
```

**Resultado:**
- ✅ Valor: igual (30 pontos)
- ✅ Data: mesma data (30 pontos)
- ✅ Método: ambos Credit Card (20 pontos)
- ✅ Nome: 100% similar (20 pontos)
- **Score total: 100 pontos → MATCH**

---

### Cenário 2: Match com Diferença de Data

**Transação A (pending-ledger):**
```
date: 2024-01-20
value: 250.00
payment_method: Zelle
depositor: Maria Silva
```

**Transação B (pending-statement):**
```
date: 2024-01-22
value: 250.00
payment_method: deposit
depositor: M. Silva
```

**Resultado:**
- ✅ Valor: igual (30 pontos)
- ✅ Data: 2 dias de diferença (15 pontos - metade dos 30)
- ✅ Método: Zelle ↔ deposit (ambos grupo Depósitos) (20 pontos)
- ✅ Nome: ~70% similar (14 pontos)
- **Score total: 79 pontos → MATCH**

---

### Cenário 3: Sem Match - Método Incompatível

**Transação A (pending-ledger):**
```
date: 2024-01-20
value: 100.00
payment_method: Credit Card
name: John Doe
```

**Transação B (pending-statement):**
```
date: 2024-01-20
value: 100.00
payment_method: Zelle
depositor: John Doe
```

**Resultado:**
- ✅ Valor: igual (30 pontos)
- ✅ Data: mesma data (30 pontos)
- ❌ Método: Credit Card ↔ Zelle (grupos diferentes) → **0 pontos**
- **Score total: 0 pontos → SEM MATCH**

---

### Cenário 4: Sem Match - Nome Muito Diferente

**Transação A (pending-ledger):**
```
date: 2024-01-20
value: 100.00
payment_method: Zelle
name: John Doe
```

**Transação B (pending-statement):**
```
date: 2024-01-20
value: 100.00
payment_method: deposit
depositor: Jane Smith
```

**Resultado:**
- ✅ Valor: igual (30 pontos)
- ✅ Data: mesma data (30 pontos)
- ✅ Método: Zelle ↔ deposit (mesmo grupo) (20 pontos)
- ❌ Nome: ~20% similar → **0 pontos** (abaixo de 50%)
- **Score total: 0 pontos → SEM MATCH**

---

## 🔍 Verificação de Resultados

### Query SQL para ver reconciliações:

```sql
-- Ver todas as transações reconciliadas
SELECT
  t1.id as ledger_id,
  t1.date as ledger_date,
  t1.value,
  t1.name as ledger_name,
  t1.payment_method as ledger_method,
  t2.id as statement_id,
  t2.date as statement_date,
  t2.depositor as statement_depositor,
  t2.payment_method as statement_method,
  t1.confidence as match_score
FROM transactions t1
JOIN transactions t2 ON t1.matched_transaction_id = t2.id
WHERE t1.status = 'reconciled'
  AND t2.status = 'reconciled'
ORDER BY t1.date DESC;
```

### Ver estatísticas:

```sql
-- Estatísticas de reconciliação
SELECT
  COUNT(*) FILTER (WHERE status = 'reconciled') as reconciled,
  COUNT(*) FILTER (WHERE status = 'pending-ledger') as pending_ledger,
  COUNT(*) FILTER (WHERE status = 'pending-statement') as pending_statement,
  COUNT(*) as total,
  ROUND(
    COUNT(*) FILTER (WHERE status = 'reconciled')::numeric /
    COUNT(*)::numeric * 100,
    2
  ) as reconciliation_rate
FROM transactions;
```

---

## ⚠️ Casos que NÃO fazem Match

### 1. Valores Diferentes
```
100.00 ≠ 100.50 → SEM MATCH
```

### 2. Datas Muito Distantes
```
2024-01-20 vs 2024-01-25 (5 dias) → SEM MATCH
```

### 3. Métodos Incompatíveis
```
Credit Card vs Zelle → SEM MATCH
Wire Transfer vs deposit → SEM MATCH
```

### 4. Nomes Muito Diferentes
```
"John Doe" vs "Jane Smith" (20% similaridade) → SEM MATCH
```

### 5. Ambas com mesmo status
```
pending-ledger ↔ pending-ledger → SEM MATCH (precisa ser ledger ↔ statement)
```

---

## 🛠️ Configuração Avançada

No arquivo `src/lib/reconciliation.ts`:

```typescript
const RECONCILIATION_CONFIG = {
  DATE_TOLERANCE_DAYS: 2,        // Tolerância de dias na data
  MIN_NAME_SIMILARITY: 0.5,      // Mínimo 50% de similaridade no nome
  MIN_MATCH_SCORE: 50,           // Score mínimo para match
};
```

**Ajustes possíveis:**
- Aumentar `DATE_TOLERANCE_DAYS` para 3 ou 4 dias
- Diminuir `MIN_NAME_SIMILARITY` para 0.4 (40%)
- Diminuir `MIN_MATCH_SCORE` para 40

---

## 📊 Grupos de Métodos de Pagamento

### Depósitos (deposit group)
```typescript
['deposit', 'zelle', 'deposito']
```
- Todos podem fazer match entre si

### Cartões (card group)
```typescript
['credit card', 'stripe receipt']
```
- Todos podem fazer match entre si

### Wire Transfers (wire group)
```typescript
['wire transfer', 'wire']
```
- Todos podem fazer match entre si

---

## 💡 Dicas para Melhores Resultados

### 1. **Mantenha Consistência nos Nomes**
```
✅ Sempre "John Doe" (não "J. Doe" ou "Doe, John")
✅ Sempre "ACME Corp" (não "ACME Corporation" depois "ACME")
```

### 2. **Use Métodos Corretos**
```
✅ Transações de cartão → "Credit Card"
✅ Depósitos Zelle → "Zelle"
✅ Depósitos genéricos → "deposit"
```

### 3. **Importe Frequentemente**
```
✅ Upload extratos semanalmente
✅ Menor diferença de datas = melhor matching
```

### 4. **Revise Pendentes Manualmente**
```
✅ Use reconciliação manual para casos especiais
✅ Auto Reconcile não pega tudo - é esperado
```

---

## 🔄 Fluxo Completo

```
1. Upload CSV do Cartão
   └─> Cria transações com status: pending-ledger

2. Upload CSV do Banco
   └─> Cria transações com status: pending-statement

3. Clique "Auto Reconcile"
   ├─> Busca todas pending-ledger
   ├─> Para cada uma, busca match em pending-statement
   ├─> Calcula score (4 critérios obrigatórios)
   └─> Se score ≥ 50:
       ├─> Marca ambas como reconciled
       ├─> Liga via matched_transaction_id
       └─> Salva confidence score

4. Transações não reconciliadas automaticamente
   └─> Reconcilie manualmente ou ignore
```

---

## ✅ Checklist de Validação

Após rodar Auto Reconcile:

- [ ] Verifique quantas foram reconciliadas (veja alerta)
- [ ] Confirme que transações reconciliadas têm status = 'reconciled'
- [ ] Verifique `matched_transaction_id` está preenchido
- [ ] Veja o `confidence` score (50-100)
- [ ] Revise pending-ledger restantes
- [ ] Revise pending-statement restantes
- [ ] Reconcilie casos especiais manualmente

---

## 📖 Referências

- **Código:** `src/lib/reconciliation.ts`
- **Interface:** `src/pages/Transactions.tsx`
- **Database:** Tabela `transactions`
- **Algoritmo:** `string-similarity` (compareTwoStrings)

---

## 🎯 Resumo Executivo

**O que faz:**
- Combina automaticamente transações de cartão (ledger) com extrato bancário (statement)

**Critérios (TODOS obrigatórios):**
1. ✅ Valor exatamente igual
2. ✅ Data dentro de 2 dias
3. ✅ Método de pagamento compatível
4. ✅ Nome/depositor com 50%+ similaridade

**Score mínimo:** 50 pontos

**Como usar:** Botão "Auto Reconcile" na página Transactions

**Taxa de sucesso esperada:** 60-80% (depende da qualidade dos dados)

---

**Última atualização:** 2025-10-20
**Status:** ✅ IMPLEMENTADO E FUNCIONAL
