# Guia de fixes do DBML Studio

Use este arquivo como mapa rápido para saber onde mexer quando aparecer bug ou ajuste pequeno. A regra geral é: encontre primeiro o dono do comportamento, mexa no menor lugar possível e adicione teste no arquivo mais próximo.

## Fluxo rápido antes de mexer

1. Rode `git status --short` para ver o que já está alterado.
2. Procure o texto, função ou CSS com `rg`.
3. Descubra se o bug é de modelo, parser/export, render, interação, persistência ou estilo.
4. Faça o fix perto do dono do comportamento.
5. Rode o teste menor que cobre o fix, depois `npm run typecheck`, `npm test` e `npm run build` quando fechar.

Scripts úteis:

```bash
npm run typecheck
npm test
npm run build
npm test -- src/parser/dbmlParser.test.ts
npm test -- src/exporter/exporters.test.ts
```

## Mapa por sintoma

| Sintoma | Comece por | Depois confira | Teste provável |
| --- | --- | --- | --- |
| DBML parseia errado | `src/parser/dbmlParser.ts` | `src/parser/specialComments.ts` | `src/parser/dbmlParser.test.ts` |
| DBML salva/reabre perdendo dado | `src/exporter/dbmlExporter.ts` | `dbmlParser.ts`, `specialComments.ts` | `src/exporter/exporters.test.ts` |
| Comentários `@diagram`, `@table`, `@line`, `@group` falham | `src/parser/specialComments.ts` | `src/exporter/dbmlExporter.ts` | parser/exporter tests |
| Importação SQL gera DBML ruim | `src/importer/sqlToDbml.ts` | parser DBML | `src/importer/sqlToDbml.test.ts` |
| Tabela/campo/relação/grupo muda errado | `src/editor/useDiagramController.ts` | tipos/defaults | teste unitário próximo, ou criar um |
| Linha desenha errado | `src/renderer/RelationPath.tsx` | `src/utils/geometry.ts` | `src/utils/geometry.test.ts` |
| Linha cruza/rota ruim | `src/utils/relationRouting.ts` | `SvgCanvas.tsx` | `src/utils/relationRouting.test.ts` |
| Jumps de cruzamento ruins | `src/utils/lineJumps.ts` | `RelationPath.tsx` | `src/utils/lineJumps.test.ts` |
| Cor visual não bate entre canvas/export | `src/model/visualSelectors.ts` | `SvgCanvas.tsx`, `tikzExporter.ts`, `pdfExport.ts` | `src/model/visualSelectors.test.ts` |
| TikZ visual errado | `src/exporter/tikzExporter.ts` | `visualSelectors.ts` | `src/exporter/exporters.test.ts` |
| PDF visual/export quebra | `src/utils/pdfExport.ts` | `src/App.tsx`, SVG gerado | `src/utils/pdfExport.test.ts` |
| Painel de propriedades não atualiza | `src/ui/PropertiesPanel.tsx` | controller correspondente | teste manual ou componente futuro |
| Canvas/drag/zoom estranho | `src/renderer/SvgCanvas.tsx` | `src/utils/viewport.ts`, `geometry.ts` | `src/utils/viewport.test.ts` |
| Autosave, biblioteca ou arquivo salvo falha | `src/editor/useDiagramController.ts` | `src/utils/fileSave.ts`, `src/utils/storage.ts` | `src/utils/storage.test.ts` |
| Preferência local quebra em browser restrito | `src/utils/storage.ts` | chamadas em App/controller/painel | `src/utils/storage.test.ts` |
| Layout automático ruim | `src/layout/autoLayout.ts` | `relationRouting.ts` | teste novo se virar regra |
| Visual/CSS quebrado | `src/styles.css` | componente dono | validação manual mobile/desktop |

## Donos principais

### Modelo

Arquivos:

- `src/model/types.ts`
- `src/model/defaults.ts`
- `src/model/visualSelectors.ts`

Mexa aqui quando mudar a estrutura do diagrama, defaults visuais ou regra visual efetiva. Se adicionar campo novo em `DiagramModel`, `TableModel`, `RelationModel` ou `GroupModel`, normalmente precisa atualizar parser, exportador, controller e testes de roundtrip.

Evite colocar regra visual duplicada em componente. Use ou amplie `visualSelectors.ts`.

### Parser e DBML especial

Arquivos:

- `src/parser/dbmlParser.ts`
- `src/parser/specialComments.ts`
- `src/exporter/dbmlExporter.ts`
- `src/parser/dbmlParser.test.ts`
- `src/exporter/exporters.test.ts`

Fluxo:

1. `parseDbml` lê DBML normal e chama `parseSpecialComments`.
2. `specialComments.ts` lê metadados visuais em comentários.
3. O editor altera `DiagramModel`.
4. `exportDbml` escreve DBML normal mais comentários especiais.

Regra de ouro: qualquer dado que o parser lê precisa ser preservado pelo exportador, salvo se for intencionalmente migrado/removido. Para fixes nessa área, sempre teste `parse -> export -> parse`.

Comentários especiais atuais:

- `// @diagram`: visual global, grid, badges e cores salvas.
- `// @table nome`: posição, tamanho e estilo da tabela.
- `// @line chave`: estilo, cardinalidade, rota e pontos da relação.
- `// @group id`: retângulo, label, estilo de tabela do grupo e `tables=`.

### Controller

Arquivo:

- `src/editor/useDiagramController.ts`

É o centro do app. Ele controla estado, histórico, persistência, comandos e sincronização entre DBML e canvas.

Procure aqui quando o bug envolver:

- criar/abrir/renomear diagrama;
- autosave;
- undo/redo;
- adicionar/remover tabela;
- adicionar/remover campo;
- adicionar/remover relação;
- pontos intermediários;
- grupos;
- atualização do DBML quando o usuário mexe no canvas.

Cuidados:

- `replaceDiagram` troca o diagrama inteiro.
- `updateDiagramState` registra histórico para mudanças de UI.
- `beginHistoryBatch` e `endHistoryBatch` agrupam drag/resize em uma entrada de undo.
- `persistCurrentDiagram` exporta DBML e atualiza biblioteca local.
- Não acesse `localStorage` direto; use `src/utils/storage.ts`.

### Render SVG e interação

Arquivos:

- `src/renderer/SvgCanvas.tsx`
- `src/renderer/TableNode.tsx`
- `src/renderer/RelationPath.tsx`
- `src/renderer/GroupNode.tsx`
- `src/renderer/ResizeHandles.tsx`

Use `SvgCanvas.tsx` para bugs de seleção, drag, zoom, pan, toolbar flutuante e criação visual de relação.

Use `TableNode.tsx` para desenho da tabela, colunas, badges e hitboxes de campo.

Use `RelationPath.tsx` para path, cardinalidade, label, destaque, setas animadas, handles e pontos.

Use `GroupNode.tsx` para retângulo de grupo, label e resize do grupo.

### Linhas, geometria e rotas

Arquivos:

- `src/utils/geometry.ts`
- `src/utils/relationRouting.ts`
- `src/utils/lineJumps.ts`

`geometry.ts` calcula pontos base e ancora relações no meio da linha da coluna. Endpoints livres não são persistidos hoje.

`relationRouting.ts` organiza rotas ortogonais desviando de tabelas.

`lineJumps.ts` calcula os pequenos saltos visuais onde linhas cruzam.

Se uma relação existe mas parece invisível ou errada, cheque nessa ordem:

1. `RelationModel` no controller.
2. `getRelationGeometry`.
3. `buildJumpPath`.
4. `RelationPath`.
5. CSS de `.relation-*` em `src/styles.css`.

### Estilos e cores

Arquivos:

- `src/model/defaults.ts`
- `src/model/visualSelectors.ts`
- `src/ui/PropertiesPanel.tsx`
- `src/renderer/TableNode.tsx`
- `src/renderer/RelationPath.tsx`
- `src/styles.css`

Para cor efetiva de tabela/relação, mexa primeiro em `visualSelectors.ts`.

Para controles de cor no painel, mexa em `PropertiesPanel.tsx`.

Para aparência desenhada, mexa em `TableNode.tsx` ou `RelationPath.tsx`.

Para espaçamento, responsivo e estados hover/selecionado, mexa em `styles.css`.

### Persistência e arquivos

Arquivos:

- `src/utils/storage.ts`
- `src/utils/fileSave.ts`
- `src/utils/download.ts`
- `src/editor/useDiagramController.ts`
- `src/App.tsx`

`storage.ts` é o único lugar para lidar diretamente com `localStorage`.

`fileSave.ts` cuida de salvar/listar arquivos DBML do workspace ou APIs locais.

`download.ts` é fallback de download no navegador.

`App.tsx` chama ações de salvar/exportar no header.

### Exportação

Arquivos:

- `src/exporter/dbmlExporter.ts`
- `src/exporter/tikzExporter.ts`
- `src/utils/pdfExport.ts`
- `src/App.tsx`

DBML é o formato principal de roundtrip. Qualquer mudança de modelo deve passar por `dbmlExporter.ts`.

TikZ deve seguir o visual efetivo do canvas via `visualSelectors.ts`.

PDF clona o SVG, aplica estilos inline e rasteriza para PNG antes de montar o PDF.

### UI, modal e app shell

Arquivos:

- `src/App.tsx`
- `src/ui/PropertiesPanel.tsx`
- `src/styles.css`

`App.tsx` é dono do header, panes principais, modal SQL, modal Ajuda e atalhos globais.

`PropertiesPanel.tsx` é grande. Para fix pequeno, procure pelo nome da seção ou label do controle. Para feature maior, vale extrair componente antes de aumentar o arquivo.

## Como decidir o teste

Use esta regra:

- Parser/DBML: teste em `dbmlParser.test.ts`.
- Export DBML/TikZ: teste em `exporters.test.ts`.
- SQL importer: teste em `sqlToDbml.test.ts`.
- Geometria/rota/jumps/grid/viewport/storage: teste no arquivo `*.test.ts` correspondente em `src/utils`.
- Visual selector: teste em `src/model/visualSelectors.test.ts`.
- Fix visual sem teste automatizado: rode typecheck/test/build e valide manualmente no browser.

Comandos focados:

```bash
npm test -- src/parser/dbmlParser.test.ts
npm test -- src/exporter/exporters.test.ts
npm test -- src/utils/geometry.test.ts
npm test -- src/utils/relationRouting.test.ts
npm test -- src/model/visualSelectors.test.ts
```

## Checklist de roundtrip DBML

Use quando o fix envolve parser, exportador, visual persistido ou comentário especial.

1. Crie um DBML de entrada com o caso.
2. Parseie com `parseDbml`.
3. Exporte com `exportDbml`.
4. Parseie o DBML exportado.
5. Verifique que o dado sobreviveu no modelo final.

Exemplo mental:

```ts
const parsed = parseDbml(source);
const dbml = exportDbml(parsed);
const reparsed = parseDbml(dbml);
expect(reparsed.groups[0].tables).toEqual(["user", "project"]);
```

## Checklist de fix visual

1. Descubra se o valor visual vem do default, tabela, grupo ou relação.
2. Se for regra efetiva, mexa em `visualSelectors.ts`.
3. Se for render SVG, mexa em `TableNode.tsx`, `RelationPath.tsx` ou `GroupNode.tsx`.
4. Se for controle do painel, mexa em `PropertiesPanel.tsx`.
5. Se for export, confira DBML/TikZ/PDF separadamente.
6. Teste pelo menos desktop e uma largura menor.

## Checklist de fix de interação

1. Comece em `SvgCanvas.tsx`.
2. Ache o estado local relacionado: `drag`, `relationMode`, `relationSource`, `viewport` ou seleção.
3. Veja se a mudança deve entrar no histórico. Drag/resize deve usar batch.
4. Veja se o controller já tem comando para o que você quer.
5. Se criar comando novo, adicione na interface `DiagramController`.

## Coisas para evitar

- Não duplicar regra visual fora de `visualSelectors.ts`.
- Não acessar `localStorage` direto.
- Não criar campo novo no modelo sem parser/exporter/teste.
- Não colocar regra de DBML dentro de componente React.
- Não aumentar `useDiagramController.ts`, `SvgCanvas.tsx` ou `PropertiesPanel.tsx` com feature grande sem considerar extração.
- Não remover compatibilidade de DBML antigo sem teste explícito.

## Ordem boa para fixes grandes

1. Escreva ou ajuste teste unitário do comportamento puro.
2. Faça o menor fix no dono do comportamento.
3. Rode o teste focado.
4. Rode `npm run typecheck`.
5. Rode `npm test`.
6. Rode `npm run build`.
7. Atualize este guia ou `docs/relatorio-proximos-prompts.md` se a arquitetura ou fluxo mudou.

