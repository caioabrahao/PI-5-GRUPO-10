# HR AI System Backend

Este diretório concentra o backend principal do projeto. O frontend ativo fica na raiz do workspace e é servido por [backend/server.js](backend/server.js).

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

## Execução

Dentro deste diretório:

```bash
npm install
npm start
```

O servidor sobe normalmente, mas os arquivos estáticos do frontend continuam sendo carregados a partir da raiz do workspace.

## Observação

O antigo diretório `frontend/` dentro de `hr-ai-system/` foi removido porque não era mais usado pela aplicação em execução.
