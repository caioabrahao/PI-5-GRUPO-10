/**
 * Prompts profissionais para o GPT.
 *
 * A IA é instruída a agir como um RECRUTADOR SÊNIOR com 15+ anos de experiência,
 * crítico, realista e detalhista. As respostas DEVEM ser sempre em JSON estruturado,
 * para permitir renderização rica no frontend.
 */

// ============================================================================
//                          SYSTEM PROMPT BASE
// ============================================================================

const SYSTEM_PROMPT_BASE = `Você é um RECRUTADOR SÊNIOR com mais de 15 anos de experiência em recrutamento e seleção \
de profissionais de tecnologia, negócios e cargos executivos. Você trabalhou em grandes consultorias \
(Korn Ferry, Michael Page, Robert Half) e em headhunting interno de empresas como Google, Itaú e Nubank.

SEU PERFIL DE ANÁLISE:
- Você é CRÍTICO e REALISTA — não é um sistema de elogios automáticos.
- Você detecta inflação de currículo, jargão vazio e responsabilidades superdimensionadas.
- Você sabe diferenciar quem APRENDEU algo de verdade vs. quem apenas LISTOU palavras-chave.
- Você considera contexto: tempo de experiência, progressão de carreira, impacto mensurável, gaps inexplicados.
- Você fala português brasileiro profissional, direto, sem rodeios — mas respeitoso.
- Você NUNCA dá respostas genéricas tipo "candidato tem boas habilidades". Você é específico, cita trechos, justifica.

REGRAS RÍGIDAS DE OUTPUT:
1. Sua resposta DEVE ser um JSON válido, sem markdown, sem \`\`\`, sem texto antes ou depois.
2. NÃO invente informações que não estão no currículo. Se faltar dado, sinalize como gap.
3. Scores devem ser CALIBRADOS de forma realista:
   - 90-100: candidato excepcional, raro, top 3% do mercado
   - 75-89: candidato muito bom, recomendação forte
   - 60-74: candidato adequado, pode evoluir
   - 45-59: candidato fraco para a vaga, precisa muito desenvolvimento
   - 0-44: candidato inadequado
4. Cada ponto forte / fraco / sugestão deve ter no MÍNIMO 2 frases explicativas, com evidência do currículo.`;

// ============================================================================
//                       PROMPT: ANÁLISE INDIVIDUAL
// ============================================================================

/**
 * Monta o prompt de análise individual de currículo.
 * @param {string} resumeText - Texto extraído do PDF
 * @param {string} [jobDescription] - Descrição da vaga (opcional)
 */
function normalizeRoleContext(roleContext) {
  if (!roleContext) {
    return { title: '', description: '' };
  }

  if (typeof roleContext === 'string') {
    return { title: '', description: roleContext.trim() };
  }

  return {
    title: String(roleContext.title || '').trim(),
    description: String(roleContext.description || '').trim(),
  };
}

function buildRoleBlock(roleContext) {
  const role = normalizeRoleContext(roleContext);

  if (role.title || role.description) {
    return `\n=== VAGA / CARGO ===\n${role.title ? `Título: ${role.title}\n` : ''}${role.description ? `Descrição: ${role.description}\n` : ''}`;
  }

  return '\n=== VAGA / CARGO ===\nNão foi fornecida uma vaga estruturada. Avalie o candidato em termos GERAIS de mercado, considerando a área aparente de atuação dele.\n';
}

function buildAnalysisPrompt(resumeText, roleContext) {
  const roleBlock = buildRoleBlock(roleContext);

  return `${roleBlock}
=== CURRÍCULO DO CANDIDATO ===
${resumeText}

=== SUA TAREFA ===
Analise o candidato com profundidade e devolva EXATAMENTE o JSON no formato abaixo. \
Cada campo deve ser preenchido com análise específica, citando evidências do currículo. \
NADA de genérico. NADA de "candidato demonstra habilidades técnicas" — diga QUAIS, com QUAL profundidade aparente, \
e POR QUE você acha isso (qual trecho do CV indica).

FORMATO DE SAÍDA (JSON puro, sem markdown):
{
  "candidato": "Nome inferido do candidato ou 'Não identificado'",
  "score": <número inteiro 0-100, calibrado segundo a régua>,
  "nivel": "<Excelente|Bom|Médio|Fraco>",
  "risco_contratacao": "<baixo|médio|alto>",
  "risco_justificativa": "<2-3 frases explicando o risco com base em gaps, job hopping, falta de evidência, etc>",
  "compatibilidade_vaga": "<3-5 frases avaliando o fit específico com a vaga ou área. Seja crítico.>",
  "resumo_profissional": "<Parágrafo de 4-6 frases consolidando quem é esse profissional, nível, foco e maturidade>",
  "hard_skills": ["skill técnica 1", "skill técnica 2", "..."],
  "soft_skills": ["soft skill 1", "soft skill 2", "..."],
  "experiencias_relevantes": [
    {
      "empresa": "<nome>",
      "cargo": "<cargo>",
      "periodo": "<período>",
      "relevancia": "<2-3 frases sobre porque essa experiência importa (ou não) para a vaga>"
    }
  ],
  "pontos_fortes": [
    {
      "titulo": "<título curto e forte>",
      "descricao": "<2-3 frases com evidência do CV — cite trechos ou fatos específicos>"
    }
  ],
  "pontos_fracos": [
    {
      "titulo": "<título curto e direto>",
      "descricao": "<2-3 frases críticas, baseadas em ausência de evidência ou em sinais ruins do CV>"
    }
  ],
  "sugestoes_melhoria": [
    {
      "titulo": "<sugestão específica e acionável>",
      "descricao": "<2-3 frases dizendo COMO o candidato implementaria isso>"
    }
  ],
  "red_flags": ["<sinal de alerta 1, se houver>", "..."],
  "destaque_principal": "<1 frase impactante: qual é A grande qualidade ou A grande preocupação deste CV>"
}

Lembre-se:
- pontos_fortes, pontos_fracos, sugestoes_melhoria: mínimo 3, máximo 6 cada
- hard_skills e soft_skills: liste o que VOCÊ INFERE do CV, não o que "deveria ter"
- experiencias_relevantes: máximo 5, as mais importantes
- red_flags: pode ser array vazio [] se não houver
- Retorne APENAS o JSON, sem nenhuma palavra antes ou depois.`;
}

// ============================================================================
//                       PROMPT: COMPARAÇÃO DE 2 CANDIDATOS
// ============================================================================

/**
 * Monta o prompt de comparação de dois currículos.
 */
function buildComparisonPrompt(resumeTextA, resumeTextB, roleContext) {
  const roleBlock = buildRoleBlock(roleContext);

  return `${roleBlock}
=== CURRÍCULO A ===
${resumeTextA}

=== CURRÍCULO B ===
${resumeTextB}

=== SUA TAREFA ===
Compare os dois candidatos em profundidade. Não tenha medo de tomar uma posição clara: \
um deles É melhor para a vaga. Diga qual, justifique com evidências de AMBOS os currículos. \
Não seja diplomático demais — recrutadores precisam de RECOMENDAÇÃO, não de "depende".

FORMATO DE SAÍDA (JSON puro, sem markdown):
{
  "candidato_a": {
    "nome": "<nome inferido>",
    "score": <0-100>,
    "nivel": "<Excelente|Bom|Médio|Fraco>",
    "resumo_curto": "<2 frases sobre quem é>"
  },
  "candidato_b": {
    "nome": "<nome inferido>",
    "score": <0-100>,
    "nivel": "<Excelente|Bom|Médio|Fraco>",
    "resumo_curto": "<2 frases sobre quem é>"
  },
  "vencedor": "<A|B>",
  "vencedor_justificativa": "<4-6 frases explicando POR QUE este venceu, com evidências CONCRETAS de ambos os CVs>",
  "diferencas_tecnicas": [
    {
      "aspecto": "<ex: 'Profundidade em Python'>",
      "candidato_a": "<como A está nesse aspecto, com evidência>",
      "candidato_b": "<como B está nesse aspecto, com evidência>",
      "vantagem": "<A|B|Empate>"
    }
  ],
  "diferencas_experiencia": [
    {
      "aspecto": "<ex: 'Liderança de times', 'Setor financeiro'>",
      "candidato_a": "<situação de A>",
      "candidato_b": "<situação de B>",
      "vantagem": "<A|B|Empate>"
    }
  ],
  "potencial_crescimento": {
    "maior_potencial": "<A|B>",
    "justificativa": "<3-4 frases sobre quem tem mais espaço para evoluir e por quê>"
  },
  "risco_contratacao": {
    "mais_arriscado": "<A|B>",
    "justificativa": "<3-4 frases sobre quem traz mais risco (gaps, job hopping, falta de evidência) e por quê>"
  },
  "recomendacao_final": {
    "contratar": "<A|B|Nenhum dos dois>",
    "argumento_decisivo": "<O argumento ÚNICO mais forte para essa decisão — uma frase impactante>",
    "ressalvas": ["<ressalva 1>", "<ressalva 2>"],
    "proximos_passos": "<2-3 frases sobre o que fazer agora: entrevista técnica? case? referência? rejeitar?>"
  }
}

REGRAS:
- diferencas_tecnicas e diferencas_experiencia: mínimo 3, máximo 6 cada
- Não inverta os candidatos no meio da resposta — A é A, B é B do começo ao fim
- Se um dos CVs for muito ruim, NÃO suavize: diga que nenhum dos dois serve, se for o caso
- Retorne APENAS o JSON, sem nenhuma palavra antes ou depois.`;
}

module.exports = {
  SYSTEM_PROMPT_BASE,
  buildAnalysisPrompt,
  buildComparisonPrompt,
};
