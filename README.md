# DBML Studio

Editor visual de esquemas DBML com organização automática, edição segura de relações e um construtor visual de Wiki por projeto.

## Executar com Docker

O modo recomendado preserva todos os projetos no diretório local `saves/`:

```bash
docker compose up --build -d
```

A aplicação ficará disponível em [http://localhost:8080](http://localhost:8080). Para acompanhar ou encerrar:

```bash
docker compose logs -f
docker compose down
```

Para usar outra porta no host:

```bash
DBML_STUDIO_PORT=3000 docker compose up --build -d
```

Por segurança, a porta é publicada apenas em `127.0.0.1`, pois a aplicação não possui autenticação. Para disponibilizá-la conscientemente na rede local:

```bash
DBML_STUDIO_HOST=0.0.0.0 docker compose up --build -d
```

Cada projeto continua organizado em `saves/<projeto>/`, incluindo `diagram.dbml`, `ui.json`, `preview.webp`, `wiki.json` e `wiki.md`. O `wiki.json` guarda os textos preenchidos no construtor visual e o `wiki.md` é a saída gerada para leitura, cópia ou download. O diretório é montado como volume e não faz parte da imagem.

O container executa como usuário sem privilégios, possui filesystem somente leitura, healthcheck em `/health` e grava apenas no volume `/data/saves`.

## Desenvolvimento local

```bash
npm ci
npm run dev
```

Validações principais:

```bash
npm test
npm run build
```
