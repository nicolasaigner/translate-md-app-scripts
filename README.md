# translate-md-app-scripts

> Traduz arquivos `.md` em lote (pastas e subpastas) de inglês para PT-BR usando **Google Apps Script** como backend de tradução — **100% gratuito**, sem cartão de crédito e sem risco de bloqueio de IP.

## Como funciona

O Google Apps Script tem acesso nativo ao motor do Google Tradutor via `LanguageApp`. Este projeto expõe isso como um Web App (endpoint REST), e o script Node.js local chama esse endpoint para traduzir cada arquivo Markdown encontrado recursivamente a partir de uma pasta.

```
[Script Node.js local]
        │
        │  POST /exec  (texto do .md)
        ▼
[Google Apps Script Web App]
        │
        │  LanguageApp.translate(text, "en", "pt")
        ▼
[Resposta JSON com texto traduzido]
        │
        ▼
[Arquivo _pt.md salvo localmente]
```

**Características:**

- Varredura recursiva em subpastas
- Blocos de código (` ``` `) são preservados sem tradução
- Arquivos grandes são divididos em chunks de até 4.500 caracteres automaticamente
- Delay configurável entre requisições para respeitar o rate limit do GAS
- Arquivos já traduzidos (`_pt.md`) são ignorados em execuções futuras

---

## Pré-requisitos

- [Node.js](https://nodejs.org/) >= 21.2
- Conta Google (para criar e publicar o Apps Script)

---

## Passo 1 — Configurar o Google Apps Script

### 1.1 Criar o projeto

1. Acesse [script.google.com](https://script.google.com) com sua conta Google
2. Clique em **Novo projeto**
3. No editor, apague o código padrão e cole o conteúdo de [`docs/gas/app_script.gs`](docs/gas/app_script.gs)

### 1.2 Configurar o `appsscript.json`

O arquivo de manifesto do projeto precisa estar configurado corretamente. No editor do GAS:

1. Clique em **Configurações do projeto** (ícone de engrenagem ⚙️)
2. Ative a opção **"Mostrar arquivo de manifesto appsscript.json no editor"**
3. Clique no arquivo `appsscript.json` que aparecerá no painel esquerdo
4. Substitua o conteúdo pelo de [`docs/gas/appscript.json`](docs/gas/appscript.json):

```json
{
  "timeZone": "America/Sao_Paulo",
  "dependencies": {},
  "exceptionLogging": "STACKDRIVER",
  "runtimeVersion": "V8",
  "webapp": {
    "executeAs": "USER_DEPLOYING",
    "access": "ANYONE_ANONYMOUS"
  }
}
```

> **Atenção:** os campos `executeAs` e `access` são os mais importantes. Eles garantem que o endpoint funcione sem autenticação.

### 1.3 Publicar como Web App

1. Clique em **Implantar** → **Nova implantação**
2. Em "Selecione o tipo", escolha **App da Web**
3. Configure conforme abaixo:

| Campo                 | Valor obrigatório                                     |
| --------------------- | ----------------------------------------------------- |
| **Executar como**     | **Eu (seu-email@gmail.com)**                          |
| **Quem pode acessar** | **Qualquer pessoa** _(sem "com uma Conta do Google")_ |

> ⚠️ Se você escolher "Usuário com acesso ao app" ou "Qualquer pessoa com uma Conta do Google", o script local receberá erro **401**.

4. Clique em **Implantar**, autorize as permissões quando solicitado
5. Copie a **URL do Web App** gerada (formato: `https://script.google.com/macros/s/SEU_CODIGO_AQUI/exec`)

**Exemplo de como deve ficar após a implantação:**

![Detalhes do projeto no Google Apps Script](docs/Detalhes%20do%20projeto.png)

![Logs de execução mostrando as traduções](docs/Logs%20de%20Execu%C3%A7%C3%A3o.png)

---

## Passo 2 — Configurar o projeto local

### 2.1 Clonar e instalar dependências

```bash
git clone https://github.com/nicolasaigner/translate-md-app-scripts.git
cd translate-md-app-scripts
npm install
```

### 2.2 Configurar o `.env`

Copie o arquivo de exemplo e preencha com a URL copiada no Passo 1:

```bash
cp .env.example .env
```

Edite o `.env`:

```env
GAS_URL=https://script.google.com/macros/s/SEU_CODIGO_AQUI/exec
```

### 2.3 Colocar os arquivos para traduzir

Coloque os arquivos `.md` que deseja traduzir dentro da pasta `markdown-files/`. Subpastas são processadas automaticamente.

```
markdown-files/
├── README.md
├── GUIDE.md
└── api/
    └── reference.md
```

### 2.4 Executar

```bash
npm start
```

Para cada arquivo `nome.md` encontrado, será gerado um `nome_pt.md` na mesma pasta.

---

## Estrutura do projeto

```
.
├── src/
│   └── index.ts          # Script principal de tradução
├── docs/
│   ├── gas/
│   │   ├── app_script.gs   # Código do Google Apps Script
│   │   └── appsscript.json # Manifesto do GAS (configurações de deploy)
│   ├── Detalhes do projeto.png
│   └── Logs de Execução.png
├── markdown-files/         # Pasta com os .md a traduzir (não versionada)
├── .env                    # Sua URL do GAS (não versionado)
├── .env.example            # Template do .env
├── package.json
└── tsconfig.json
```

---

## Notas técnicas

### Proteção de blocos de código

Antes de enviar para tradução, o script substitui blocos ` ``` ... ``` ` por tokens temporários (`___CODE_BLOCK_0___`, etc.) e os restaura depois. Isso garante que código-fonte não seja "traduzido" pelo Google.

### Chunking automático

O `LanguageApp.translate()` do Google tem um limite de ~5.000 caracteres por chamada. O script divide automaticamente textos maiores em chunks por parágrafos (`\n\n`) ou por linhas, traduz cada parte separadamente com 1s de delay entre elas, e depois junta tudo.

### Rate limit

O GAS tem cotas diárias generosas para uso pessoal (~20.000 chamadas/dia para contas comuns). O delay de 1,5s entre arquivos e 1s entre chunks é suficiente para evitar erros de cota em uso normal.

---

## Limitações conhecidas

- Sintaxes complexas de Markdown (tabelas com HTML embutido, JSX, etc.) podem ter formatação levemente alterada pela tradução;
- O script não protege inline code (`` `código` ``) — apenas blocos cercados por ` ``` `;
- Se necessário, uma abordagem baseada em AST com [Remark](https://github.com/remarkjs/remark) seria mais robusta;
- A URL do Web App fica acessível publicamente (quem tiver a URL pode usar a cota da sua conta Google). Não compartilhe a URL publicamente;

---

## Dicas de pós-tradução

### Corrigindo formatação de tabelas

O tradutor pode inserir quebras de linha ou espaços extras dentro de tabelas Markdown, quebrando a formatação. Após a tradução, revise os arquivos — principalmente os que contêm tabelas.

Uma forma rápida de localizar os problemas é buscar no VS Code (Ctrl+Shift+H) por:

```
 |

|
```

E substituir por:

```
 |
|
```

Ou use os scripts abaixo para corrigir automaticamente via terminal:

**PowerShell 7.5 — arquivo individual:**

```powershell
(Get-Content "caminho\para\seu\arquivo.md") -replace '(\|[^\n]*\|)(\s*\n\s*)(\|[^\n]*\|)', '$1`n$3' | Set-Content "caminho\para\seu\arquivo.md"
```

**PowerShell 7.5 — todos os arquivos recursivamente:**

```powershell
Get-ChildItem -Path "caminho\para\seus\arquivos\*.md" -Recurse | ForEach-Object {
    (Get-Content $_.FullName) -replace '(\|[^\n]*\|)(\s*\n\s*)(\|[^\n]*\|)', '$1`n$3' | Set-Content $_.FullName
}
```

**Linux/macOS — arquivo individual:**

```bash
sed -i ':a;N;$!ba;s/\(\|[^\n]*\|\)\s*\n\s*\(\|[^\n]*\|\)/\1\n\2/g' caminho/para/seu/arquivo.md
```

**Linux/macOS — todos os arquivos recursivamente:**

```bash
find caminho/para/seus/arquivos -type f -name "*.md" -exec sed -i ':a;N;$!ba;s/\(\|[^\n]*\|\)\s*\n\s*\(\|[^\n]*\|\)/\1\n\2/g' {} +
```

---

## Licença

MIT — veja [LICENSE](LICENSE)
