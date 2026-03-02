// TypeScript code para traduzir arquivos Markdown usando um endpoint do Google Apps Script como tradutor.
// Versão atual do NodeJS v25.7.0

import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

// Cole aqui a URL gerada no Google Apps Script
const GAS_URL = process.env.GAS_URL || null;

// Delay para evitar estourar a cota de requisições por segundo do GAS
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Limite seguro de caracteres por requisição ao GAS (LanguageApp.translate tem ~5000 chars de limite)
const CHUNK_SIZE = 4500;

async function translateChunk(text: string): Promise<string> {
  const params = new URLSearchParams();
  params.append("text", text);
  params.append("source", "en");
  params.append("target", "pt");

  if (!GAS_URL) {
    throw new Error("GAS_URL não definido. Verifique seu arquivo .env");
  }

  const response = await fetch(GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    redirect: "follow",
  });

  const responseText = await response.text();

  // Se a resposta contém HTML, o GAS está redirecionando para login (problema de permissão no deployment)
  if (responseText.trimStart().startsWith("<")) {
    throw new Error(
      `O GAS retornou uma página HTML em vez de JSON (status ${response.status}).\n` +
        `Verifique se o Web App foi reimplantado com "Quem pode acessar: Qualquer pessoa".\n` +
        `URL: ${GAS_URL}`,
    );
  }

  const data = JSON.parse(responseText) as {
    translated?: string;
    error?: string;
  };

  if (data.error) {
    throw new Error(`GAS retornou erro: ${data.error}`);
  }

  return data.translated ?? "";
}

async function translateText(text: string): Promise<string> {
  // Se o texto couber em um único chunk, traduz direto
  if (text.length <= CHUNK_SIZE) {
    return translateChunk(text);
  }

  // Divide por parágrafos (\n\n) para preservar estrutura do Markdown
  const paragraphs = text.split(/\n\n/);
  const chunks: string[] = [];
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    // Se um único parágrafo já excede o limite, divide por linha
    if (paragraph.length > CHUNK_SIZE) {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }
      const lines = paragraph.split("\n");
      for (const line of lines) {
        if ((currentChunk + "\n" + line).length > CHUNK_SIZE) {
          if (currentChunk) chunks.push(currentChunk.trim());
          currentChunk = line;
        } else {
          currentChunk = currentChunk ? currentChunk + "\n" + line : line;
        }
      }
      continue;
    }

    const candidate = currentChunk
      ? currentChunk + "\n\n" + paragraph
      : paragraph;
    if (candidate.length > CHUNK_SIZE) {
      chunks.push(currentChunk.trim());
      currentChunk = paragraph;
    } else {
      currentChunk = candidate;
    }
  }

  if (currentChunk) chunks.push(currentChunk.trim());

  // Traduz cada chunk com delay entre eles para respeitar o rate limit
  const translated: string[] = [];
  for (const chunk of chunks) {
    translated.push(await translateChunk(chunk));
    if (chunks.length > 1) await delay(1000);
  }

  return translated.join("\n\n");
}

// Protege blocos de código Markdown trocando-os por tokens
function protectCodeBlocks(markdown: string) {
  const codeBlockRegex = /```[\s\S]*?```/g;
  const blocks: string[] = [];

  const protectedText = markdown.replace(codeBlockRegex, (match) => {
    blocks.push(match);
    return `___CODE_BLOCK_${blocks.length - 1}___`;
  });

  return { protectedText, blocks };
}

// Reinsere os blocos de código
function restoreCodeBlocks(translatedText: string, blocks: string[]) {
  let restored = translatedText;
  blocks.forEach((block, index) => {
    // O tradutor pode colocar espaços ao redor do token, o regex lida com isso
    const tokenRegex = new RegExp(`___CODE_BLOCK_${index}___`, "g");
    restored = restored.replace(tokenRegex, block);
  });
  return restored;
}

async function processFile(filePath: string) {
  console.log(`Lendo: ${filePath}`);
  const content = await fs.readFile(filePath, "utf-8");

  // 1. Isola o código fonte para não ser traduzido
  const { protectedText, blocks } = protectCodeBlocks(content);

  // 2. Traduz o texto
  // Nota: O payload máximo do GAS é em torno de 50MB, mas o translate tem limite de caracteres por request.
  // Se seus arquivos MD forem massivos (+5000 caracteres), será necessário fazer um chunking do 'protectedText' separando por quebras de linha dupla (\n\n).
  console.log(`Traduzindo...`);
  const translatedText = await translateText(protectedText);

  // 3. Devolve os blocos de código
  const finalContent = restoreCodeBlocks(translatedText, blocks);

  // 4. Salva com um sufixo ou sobrescreve (aqui estamos criando uma cópia _pt.md)
  const ext = path.extname(filePath);
  const newFilePath = filePath.replace(ext, `_pt${ext}`);

  await fs.writeFile(newFilePath, finalContent, "utf-8");
  console.log(`Salvo em: ${newFilePath}`);
}

async function translateDirectory(dirPath: string) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      await translateDirectory(fullPath); // Recursividade para subpastas
    } else if (entry.isFile() && fullPath.endsWith(".md")) {
      // Ignora arquivos que já foram traduzidos
      if (!fullPath.endsWith("_pt.md")) {
        await processFile(fullPath);
        await delay(1500); // 1.5s de delay para respeitar o rate limit do GAS
      }
    }
  }
}

// Execução
// import.meta.dirname aponta para src/, então subimos um nível para chegar à raiz do projeto
const targetDirectory = path.join(import.meta.dirname, "../markdown-files");

translateDirectory(targetDirectory)
  .then(() => console.log("Processo finalizado com sucesso!"))
  .catch((err) => console.error("Erro na execução:", err));
