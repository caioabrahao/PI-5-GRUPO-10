/**
 * Service de extração de texto de PDFs.
 * Usa pdf-parse para converter o buffer/caminho do PDF em texto bruto.
 */

const fs = require('fs').promises;
const pdfParse = require('pdf-parse');
const logger = require('../utils/logger');

/**
 * Extrai texto de um arquivo PDF a partir do caminho no disco.
 * @param {string} filePath - Caminho absoluto do arquivo PDF
 * @returns {Promise<{text: string, pages: number, info: object}>}
 */
async function extractTextFromPDF(filePath) {
  try {
    const dataBuffer = await fs.readFile(filePath);
    const data = await pdfParse(dataBuffer);

    const cleanedText = cleanText(data.text);

    if (!cleanedText || cleanedText.length < 50) {
      throw new Error('PDF parece estar vazio ou ser uma imagem escaneada sem OCR.');
    }

    return {
      text: cleanedText,
      pages: data.numpages,
      info: data.info || {},
    };
  } catch (err) {
    logger.error('Falha ao extrair texto do PDF', { error: err.message, filePath });
    throw new Error(`Erro ao processar PDF: ${err.message}`);
  }
}

/**
 * Limpa texto extraído: remove espaços excessivos, quebras desnecessárias,
 * caracteres de controle e normaliza.
 */
function cleanText(rawText) {
  if (!rawText) return '';
  return rawText
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')           // remove null bytes
    .replace(/[ \t]+/g, ' ')          // múltiplos espaços/tabs => 1 espaço
    .replace(/\n{3,}/g, '\n\n')       // múltiplas linhas em branco => 2
    .replace(/^\s+|\s+$/gm, '')       // trim por linha
    .trim();
}

/**
 * Tenta inferir o nome do candidato a partir do texto do currículo.
 * Heurística simples: primeiras linhas significativas, antes de email/telefone.
 */
function inferCandidateName(text) {
  if (!text) return null;
  const lines = text.split('\n').slice(0, 8).map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    // pula linhas com email, telefone, url, ou rótulos comuns
    if (/@|https?:|www\.|\+?\d{2,}|curriculum|currículo|cv|resume/i.test(line)) continue;
    // nome típico: 2-5 palavras, só letras, primeira maiúscula
    if (/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+(\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][a-záéíóúâêôãõç]+){1,4}$/.test(line)) {
      return line;
    }
  }
  return null;
}

module.exports = { extractTextFromPDF, inferCandidateName };
