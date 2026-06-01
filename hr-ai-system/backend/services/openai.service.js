/**
 * Service de integração com a OpenAI.
 *
 * - Lê a API key APENAS de process.env (nunca hardcoded).
 * - Usa response_format JSON para garantir saída estruturada.
 * - Faz parsing defensivo (caso o modelo escape a regra do JSON puro).
 */

const OpenAI = require('openai');
const logger = require('../utils/logger');
const {
  SYSTEM_PROMPT_BASE,
  buildAnalysisPrompt,
  buildComparisonPrompt,
} = require('./prompts');

if (!process.env.OPENAI_API_KEY) {
  logger.error('OPENAI_API_KEY não definida no .env. O serviço de IA não funcionará.');
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// ---------------------------------------------------------------------------
//                              UTILITÁRIOS
// ---------------------------------------------------------------------------

/**
 * Parser defensivo de JSON: caso o modelo retorne com cercas markdown,
 * remove e tenta novamente.
 */
function safeJsonParse(text) {
  if (!text) throw new Error('Resposta vazia da IA');

  // Remove cercas markdown se houver
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  }

  // Tenta achar o primeiro { e o último }
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first !== -1 && last !== -1) {
    cleaned = cleaned.slice(first, last + 1);
  }

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    logger.error('JSON inválido retornado pela IA', { snippet: cleaned.slice(0, 300) });
    throw new Error('A IA retornou um formato inválido. Tente novamente.');
  }
}

/**
 * Trunca o texto do currículo se for muito longo, para evitar estouro de tokens.
 * Mantém início e fim, que costumam ter as informações mais relevantes.
 */
function truncateForModel(text, maxChars = 14000) {
  if (!text) return '';
  if (text.length <= maxChars) return text;

  const headSize = Math.floor(maxChars * 0.7);
  const tailSize = maxChars - headSize - 50;
  return `${text.slice(0, headSize)}\n\n[... trecho omitido por tamanho ...]\n\n${text.slice(-tailSize)}`;
}

/**
 * Chamada genérica ao chat completions, com response_format JSON.
 */
async function callOpenAI(userPrompt, { temperature = 0.4 } = {}) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Servidor sem OPENAI_API_KEY configurada. Configure o arquivo .env.');
  }

  const start = Date.now();
  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      temperature,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_BASE },
        { role: 'user', content: userPrompt },
      ],
    });

    const elapsed = Date.now() - start;
    const content = completion.choices?.[0]?.message?.content;
    const usage = completion.usage;

    logger.success('OpenAI respondeu', {
      model: MODEL,
      elapsed_ms: elapsed,
      tokens: usage?.total_tokens,
    });

    return safeJsonParse(content);
  } catch (err) {
    // Erros conhecidos do SDK
    if (err.status === 401) {
      throw new Error('API key da OpenAI inválida. Verifique seu .env.');
    }
    if (err.status === 429) {
      throw new Error('Limite da OpenAI atingido (rate limit ou cota). Aguarde ou verifique seu plano.');
    }
    if (err.status === 400 && /context_length/i.test(err.message || '')) {
      throw new Error('Currículo muito longo para o modelo. Tente um modelo maior ou um CV menor.');
    }
    logger.error('Falha na chamada à OpenAI', { error: err.message, status: err.status });
    throw new Error(err.message || 'Erro ao chamar a IA');
  }
}

// ---------------------------------------------------------------------------
//                              EXPOSTOS
// ---------------------------------------------------------------------------

/**
 * Analisa um currículo individual.
 * @returns {Promise<object>} análise estruturada
 */
async function analyzeResume(resumeText, roleContext) {
  const truncated = truncateForModel(resumeText);
  const prompt = buildAnalysisPrompt(truncated, roleContext);
  return callOpenAI(prompt, { temperature: 0.35 });
}

/**
 * Compara dois currículos.
 * @returns {Promise<object>} comparação estruturada
 */
async function compareResumes(resumeTextA, resumeTextB, roleContext) {
  const a = truncateForModel(resumeTextA, 7000);
  const b = truncateForModel(resumeTextB, 7000);
  const prompt = buildComparisonPrompt(a, b, roleContext);
  return callOpenAI(prompt, { temperature: 0.35 });
}

module.exports = { analyzeResume, compareResumes };
