# HR AI System

Plataforma web para análise de currículos com IA. A estrutura ativa do repositório foi enxugada para refletir o que realmente roda hoje: frontend estático na raiz do workspace e backend Express dentro de `hr-ai-system/backend`.

## Funcionalidades

- Cadastro de vagas com descrição e requisitos.
- Upload de currículos em PDF vinculado à vaga ativa.
- Análise de candidatos com IA usando score, riscos, pontos fortes e fracos.
- Comparação entre candidatos da mesma vaga.
- Dashboard com visão geral, melhores candidatos e histórico.

## Estrutura atual

```text
files(1)/
├── index.html                     # Frontend servido pelo backend
├── script.js                      # Lógica do frontend ativo
├── style.css                      # Estilos do frontend ativo
├── server.js                      # Wrapper para o backend principal
├── package.json                   # Scripts para subir o app pela raiz
├── .env.example
├── hr-ai-system/
│   ├── package.json               # Pacote do backend
│   ├── README.md
│   └── backend/
│       ├── server.js              # Servidor Express principal
│       ├── controllers/
│       ├── routes/
│       ├── services/
│       ├── middlewares/
│       ├── database/
│       ├── uploads/
│       └── utils/
└── README.md
```

## Como rodar pela raiz

### 1. Pré-requisitos

- Node.js 20+
- Uma API key da OpenAI

### 2. Instalação

```bash
npm install
copy .env.example .env
```

Depois edite `.env` e configure `OPENAI_API_KEY`.

### 3. Executar

```bash
npm start
```

O script da raiz sobe `hr-ai-system/backend/server.js`, que serve os arquivos `index.html`, `script.js` e `style.css` na própria raiz do workspace.

## Observações de organização

- A raiz contém apenas o frontend ativo e o atalho de execução.
- O diretório `hr-ai-system/` concentra o backend e a lógica de domínio.
- Arquivos legados e cópias duplicadas de frontend foram removidos para evitar ambiguidade sobre qual estrutura está em uso.

## Licença

MIT
