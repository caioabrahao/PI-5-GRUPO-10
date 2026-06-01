# HR AI System

Aplicação web para triagem de currículos com IA. O frontend ativo fica na raiz do workspace e o backend Express fica em `hr-ai-system/backend`.

## O que o sistema faz

- Cadastra vagas com descrição e contexto da posição.
- Faz upload de múltiplos PDFs por vaga.
- Processa extração de texto e análise de IA em background.
- Mostra progresso do lote no header, sem travar a interface.
- Exibe overview da vaga com melhores candidatos e lista de currículos.
- Permite selecionar múltiplos candidatos para excluir ou gerar análise.
- Abre uma página de candidato com análise detalhada, histórico e nova análise manual.
- Lista todas as vagas em uma página dedicada.

## Estrutura ativa

```text
files(1)/
├── index.html
├── script.js
├── style.css
├── server.js
├── package.json
├── .env.example
└── hr-ai-system/
	├── package.json
	├── README.md
	└── backend/
		├── server.js
		├── controllers/
		├── routes/
		├── services/
		├── middlewares/
		├── database/
		├── uploads/
		└── utils/
```

## Requisitos

- Node.js 20+
- OpenAI API key

## Como rodar

```bash
npm install
copy .env.example .env
```

Preencha `OPENAI_API_KEY` no `.env` e depois execute:

```bash
npm start
```

O backend sobe em `http://localhost:3000` e serve o frontend da raiz do projeto.

## Fluxo de uso

1. Crie uma vaga.
2. Selecione a vaga no sidebar.
3. Envie um ou mais PDFs.
4. Acompanhe o progresso do processamento no header.
5. Abra candidatos pela overview para ver a análise detalhada.
6. Use a seleção múltipla para analisar ou excluir em lote.

## Configuração principal

As variáveis mais importantes do `.env` são:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `PORT`
- `MAX_FILE_SIZE_MB`
- `DB_PATH`

## Observações

- O banco usado hoje é SQLite via `better-sqlite3`.
- Os uploads são persistidos em `hr-ai-system/backend/uploads`.
- O processamento assíncrono continua no mesmo processo Node; se o servidor parar, lotes em andamento não retomam automaticamente.

## Licença

MIT
