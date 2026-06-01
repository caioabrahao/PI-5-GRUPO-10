# HR AI System Backend

Este diretório concentra o backend Express da aplicação. O frontend ativo continua na raiz do workspace e é servido por `backend/server.js`.

## Responsabilidades

- API de vagas, currículos e análises.
- Upload e armazenamento de PDFs.
- Extração de texto dos currículos.
- Processamento assíncrono dos lotes de upload.
- Integração com OpenAI.
- Persistência local em SQLite.

## Estrutura

```text
hr-ai-system/
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

## Rodando por este diretório

```bash
npm install
npm start
```

O backend inicia normalmente, mas continua servindo os arquivos estáticos da raiz do workspace.

## Observações

- O banco atual é SQLite.
- Os jobs de upload e análise são processados no mesmo processo Node.
- O diretório `frontend/` antigo não faz mais parte da aplicação em uso.
