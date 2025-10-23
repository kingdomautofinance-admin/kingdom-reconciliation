# Google Sheets Import Guide

## Como Importar Dados do Google Sheets

### Passo 1: Preparar a Planilha

1. Abra sua planilha do Google Sheets
2. Certifique-se de que os dados estão no formato correto:
   - **Coluna A**: Data (formato: MM/DD/YYYY)
   - **Coluna B**: Valor (ex: 500.00 ou R$ 500,00)
   - **Coluna C**: (Opcional) Informações adicionais
   - **Coluna D**: Carro (ex: Honda Civic)
   - **Coluna E**: Nome do Cliente
   - **Coluna F**: Nome do Depositante (se diferente)
   - **Coluna G**: Método de Pagamento (Zelle, Credit Card, Deposit)

### Passo 2: Tornar a Planilha Pública

1. Clique em **Compartilhar** (canto superior direito)
2. Clique em **Alterar para qualquer pessoa com o link**
3. Selecione **Visualizador** (não é necessário dar permissão de edição)
4. Clique em **Concluído**

### Passo 3: Copiar o Link ou ID

Existem duas formas de importar:

#### Opção 1: URL Completa
Copie a URL completa da planilha:
```
https://docs.google.com/spreadsheets/d/1ABC123XYZ456.../edit
```

#### Opção 2: Apenas o ID
Copie apenas o ID (a parte entre `/d/` e `/edit`):
```
1ABC123XYZ456...
```

### Passo 4: Importar no Sistema

1. Vá para a página **Upload**
2. No card **Google Sheets Import**
3. Cole a URL ou ID da planilha
4. Clique em **Import from Sheets**

### O que Acontece na Importação

1. ✅ Sistema baixa os dados da planilha
2. ✅ Converte para formato CSV
3. ✅ Analisa as transações
4. ✅ Detecta duplicatas (não importa dados já existentes)
5. ✅ Marca todas como `pending-ledger` (aguardando pagamento)
6. ✅ Preserva a ordem original da planilha
7. ✅ Executa reconciliação automática

## Formato Esperado da Planilha

### Exemplo de Dados:

| Date | Amount | Info | Car | Client Name | Depositor | Payment Method |
|------|--------|------|-----|-------------|-----------|----------------|
| 10/01/2025 | 500.00 | | Honda Civic | John Smith | | Zelle |
| 10/02/2025 | 750.50 | | Toyota Camry | Jane Doe | | Credit Card |
| 10/03/2025 | 1000.00 | | Ford F-150 | Bob Johnson | Bob Johnson | Deposit |

### Notas Importantes:

- ✅ **Data**: Aceita formatos MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD
- ✅ **Valor**: Remove automaticamente símbolos de moeda (R$, $, etc)
- ✅ **Método de Pagamento**:
  - `Zelle` → Requer nome do depositante para reconciliação
  - `Credit Card` → Reconcilia por valor e data
  - `Deposit` → Similar ao Zelle
- ✅ **Duplicatas**: Detectadas por data + valor + nome
- ✅ **Ordem**: Preservada através do campo `sheet_order`

## Solução de Problemas

### "Failed to fetch spreadsheet" ou "Failed to fetch"
- ✅ Verifique se a planilha está pública (Anyone with the link can view)
- ✅ Teste o link em uma janela anônima do navegador
- ✅ Certifique-se de que não há restrições de domínio na planilha
- ✅ Aguarde alguns segundos e tente novamente (cold start da Edge Function)
- ✅ Verifique se o ID ou URL estão corretos

### "Invalid Google Sheets URL"
- ✅ Use a URL completa ou apenas o ID
- ✅ Não use URLs encurtadas
- ✅ Verifique se o ID não contém espaços

### "No transactions imported"
- ✅ Verifique se a primeira linha tem cabeçalhos
- ✅ Certifique-se de que há dados a partir da linha 2
- ✅ Verifique o formato das datas e valores

### Todas transações aparecem como duplicatas
- ✅ Normal se você já importou esses dados antes
- ✅ Sistema previne duplicação automática
- ✅ Verifique se não há transações idênticas já importadas

## Como Funciona Tecnicamente

Para evitar problemas de CORS (Cross-Origin Resource Sharing), o sistema usa:

1. **Edge Function do Supabase** como proxy
2. A função faz o download do CSV do Google Sheets
3. Retorna os dados para o frontend
4. Frontend processa os dados normalmente

Isso garante que não haja bloqueios de CORS no navegador e permite acesso a planilhas públicas sem autenticação.

## Reconciliação Automática

Após a importação, o sistema automaticamente:

1. Busca transações `pending-statement` (extratos bancários)
2. Compara com as novas transações `pending-ledger` (da planilha)
3. Faz o match baseado em:
   - ✅ Valor exato
   - ✅ Data (±2 dias de tolerância)
   - ✅ Método de pagamento
   - ✅ Similaridade de nomes (50% mínimo para Zelle/Deposit)

## Dicas de Uso

### Para Melhor Reconciliação:

1. **Padronize nomes**: Use sempre o mesmo formato para clientes
2. **Importar em ordem**: Importe primeiro a planilha (ledger), depois os extratos (statements)
3. **Verifique métodos de pagamento**: Mantenha consistência nos nomes
4. **Use depositor**: Para pagamentos Zelle, preencha o depositante se diferente do cliente

### Workflow Recomendado:

1. 📊 Importe a planilha do Google Sheets (ledger)
2. 📁 Importe extratos do Wells Fargo (statements)
3. 📁 Importe extratos da Stripe (credit cards)
4. 🔄 Clique em "Auto Reconcile" na página Transactions
5. 👀 Revise transações não reconciliadas

## Exemplo Prático

### 1. Planilha do Google Sheets:
```
Date        | Amount  | Car          | Client      | Payment
10/01/2025  | 500.00  | Honda Civic  | John Smith  | Zelle
10/02/2025  | 750.50  | Toyota Camry | Jane Doe    | Credit Card
```

### 2. Após importação:
- Status: `pending-ledger`
- Source: `Google Sheets`
- Aguardando match com extratos bancários

### 3. Importar extrato bancário:
```csv
Date,Amount,Depositor Name
10/01/2025,500.00,John Smith
10/02/2025,750.50,
```

### 4. Auto-reconciliação:
- ✅ Match encontrado para ambas transações
- ✅ Status alterado para `reconciled`
- ✅ Confiança: 95-100%

## Suporte

Se tiver problemas:
1. Verifique o formato da planilha
2. Teste com dados de exemplo primeiro
3. Certifique-se de que a planilha está pública
4. Use "Generate Sample Data" para testar o sistema
