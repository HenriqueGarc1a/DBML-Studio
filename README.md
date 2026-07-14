# DBML Studio

Editor visual de esquemas DBML com organização automática, edição completa do schema, histórico local, comparação com bancos reais e um construtor visual de Wiki por projeto.

## Recursos

- DBML com preservação de `Project`, `TableGroup`, `TablePartial`, `Records`, relações compostas, notes multilinha e configurações avançadas. Blocos que ainda são somente leitura aparecem como avisos explícitos no editor e voltam no export.
- Editor visual de tabelas, campos, defaults, notes, checks de campo/tabela, increment/identity, índices simples/compostos, enums e configurações extras.
- Busca por tabela ou campo, ir para tabela, foco em vizinhos, análise de impacto, minimapa, fit da seleção e movimento em grupo com `Shift`.
- Biblioteca com importação `.dbml` por arquivo ou drag-and-drop, duplicação, busca, ordenação, pacote completo `.dbmlstudio.json` e lixeira local.
- Snapshots restauráveis no navegador, autosave e indicador de estado de persistência.
- Exportação DBML, TikZ, SVG, PNG e PDF; Wiki em Markdown, HTML e PDF.
- Introspecção read-only de PostgreSQL, MySQL e SQLite, geração de DBML, detecção de drift e migration SQL sugerida. A aplicação nunca executa a migration.

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

## Conectar a um banco

Use **Conectar banco** na biblioteca para criar um projeto a partir do catálogo, ou **Comparar banco** dentro do editor para ver o drift e baixar uma sugestão de migration.

As credenciais de PostgreSQL/MySQL são enviadas somente na requisição de introspecção e não são persistidas. Prefira um usuário dedicado com permissão apenas de leitura. O host informado é visto pelo servidor/container; em Docker, `localhost` aponta para o próprio container.

Arquivos SQLite precisam estar dentro de `DBML_SQLITE_ROOT`, que por padrão é o diretório de saves. No `compose.yaml`, coloque o arquivo sob `saves/` e informe o caminho relativo, por exemplo `dados/shop.sqlite`.

Variáveis úteis:

- `DBML_SAVES_DIR`: raiz dos projetos persistidos;
- `DBML_SQLITE_ROOT`: única raiz da qual arquivos SQLite podem ser abertos;
- `MAX_BODY_BYTES`: limite dos payloads da API;
- `HOST` e `PORT`: endereço do runtime.

Como a aplicação não possui autenticação, mantenha a publicação em `127.0.0.1` ou coloque autenticação e TLS em um proxy reverso antes de expô-la.

## Desenvolvimento local

```bash
npm ci
npm run dev
```

Validações principais:

```bash
npm test
npm run build
npm run test:container-server
```
