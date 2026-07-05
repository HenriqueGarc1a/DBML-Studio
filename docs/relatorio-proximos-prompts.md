# Relatório para Próximas Rodadas do DBML Studio

Data da análise: 2026-07-05

Este relatório foi feito para virar prompt nas próximas sessões. A ideia é deixar claro o que vale mudar, tirar ou adicionar, sem depender de lembrar tudo de cabeça.

## Resumo rápido

O app está funcional e já tem uma base boa: React + TypeScript + SVG, parser/exportador DBML, importação SQL, layout automático, editor visual, grupos, linhas com pontos, undo/redo, autosave, tutorial e export PDF/TikZ.

Os maiores próximos ganhos não são só visuais. Eles estão em:

1. Garantir roundtrip perfeito de DBML e comentários especiais.
2. Reduzir arquivos muito grandes e responsabilidades misturadas.
3. Melhorar performance durante drag/edição.
4. Adicionar testes de interação reais.
5. Melhorar gestão de diagramas/salvamento/exportação.
6. Fechar limitações do parser DBML/SQL.
7. Melhorar acessibilidade, mobile e fluxo de ajuda.

## Estado atual do projeto

Stack:

- Vite
- React 18
- TypeScript
- SVG como render principal
- Vitest
- ELK para layout automático
- jsPDF para exportar PDF

Arquivos mais importantes:

- `src/App.tsx`: shell da aplicação, header, modais, atalhos e export/salvar.
- `src/editor/useDiagramController.ts`: estado central, histórico, persistência e comandos.
- `src/renderer/SvgCanvas.tsx`: canvas SVG, pan/zoom, drag, toolbar flutuante e criação de relações.
- `src/renderer/RelationPath.tsx`: desenho e interação das linhas.
- `src/renderer/TableNode.tsx`: desenho das tabelas e colunas.
- `src/ui/PropertiesPanel.tsx`: painel de propriedades.
- `src/parser/dbmlParser.ts`: parser DBML.
- `src/parser/specialComments.ts`: parser dos comentários `@diagram`, `@table`, `@line`, `@group`.
- `src/exporter/dbmlExporter.ts`: exportação DBML.
- `src/exporter/tikzExporter.ts`: exportação TikZ.
- `src/importer/sqlToDbml.ts`: importação SQL.
- `src/utils/relationRouting.ts`: roteamento automático das linhas.
- `src/utils/lineJumps.ts`: curvas/jumps das linhas.
- `src/utils/pdfExport.ts`: exportação PDF.
- `src/styles.css`: estilos globais.

Arquivos grandes que merecem ser quebrados depois:

- `src/editor/useDiagramController.ts`: 1300+ linhas.
- `src/ui/PropertiesPanel.tsx`: 1000+ linhas.
- `src/renderer/SvgCanvas.tsx`: 900+ linhas.
- `src/styles.css`: 1100+ linhas.

## Prioridades recomendadas

### P0 - Corrigir antes de crescer mais

São pontos que podem causar perda de dados, bugs escondidos ou manutenção difícil.

1. Corrigir roundtrip de grupos.

Hoje o parser lê `// tables=user,project` dentro de `@group`, mas o exportador DBML não exporta `tables=` de volta. Isso significa que uma informação lida do DBML pode sumir ao salvar.

Mesmo que hoje o estilo de grupo seja calculado pela posição da tabela dentro do retângulo, o campo `group.tables` existe no modelo e não deveria se perder.

2. Tornar `@line` independente da ordem.

Hoje `specialComments.ts` coleta `@line` em uma lista e `dbmlParser.ts` aplica por índice nas relações parseadas. Isso pode quebrar quando refs são reordenadas, duplicadas, removidas ou misturadas com refs inline.

Melhor caminho: usar uma chave estável no `@line`, por exemplo `// @line relation-project-user`, ou parear o bloco `@line` com o `Ref` imediatamente anterior/seguinte, mantendo fallback por índice para DBML antigo.

3. Resolver campos mortos ou semi-mortos no modelo.

Campos que existem, mas quase não têm efeito real:

- `startOffsetX`
- `startOffsetY`
- `endOffsetX`
- `endOffsetY`
- `arrowColor`

Hoje os offsets são exportados como zero e a geometria ancora direto na coluna. `arrowColor` existe no modelo/parser/default, mas o desenho usa outras cores. Ou implementa de verdade, ou remove/migra para simplificar.

4. Colocar `localStorage` atrás de um helper seguro.

Alguns pontos já usam `try/catch`, mas o controller ainda acessa `localStorage` diretamente em vários lugares. Em navegador restrito isso pode quebrar.

Criar algo tipo `src/utils/storage.ts`:

- `safeGetItem`
- `safeSetItem`
- `safeRemoveItem`
- `readJson`
- `writeJson`

5. Evitar export/autosave pesado em todo micro movimento.

O efeito que atualiza DBML/TikZ roda sempre que `diagram` muda. Durante drag de tabela, resize, ponto de linha etc. isso pode gerar muito trabalho: React state + export DBML + import dinâmico TikZ + autosave agendado.

Melhor caminho: separar mudanças de interação contínua de mudanças finais, ou debounce maior para export textual durante drag.

### P1 - Melhorias de arquitetura

1. Quebrar `useDiagramController.ts`.

Sugestão de divisão:

- `useDiagramLibrary.ts`: abrir/criar/renomear/salvar diagramas.
- `useDiagramHistory.ts`: undo/redo/batches.
- `diagramCommands.ts`: add/update/remove table/column/relation/group.
- `diagramPersistence.ts`: autosave, file save, local storage.
- `relationCommands.ts`: tidy/reset/via points.
- `diagramSelectors.ts`: helpers de seleção, visual efetivo, nomes.

2. Quebrar `PropertiesPanel.tsx`.

Sugestão:

- `PropertiesPanel.tsx`: só escolhe qual editor renderizar.
- `DiagramProperties.tsx`
- `TableProperties.tsx`
- `RelationProperties.tsx`
- `GroupProperties.tsx`
- `fields/ColorField.tsx`
- `fields/NumberField.tsx`
- `fields/RangeField.tsx`
- `fields/SelectField.tsx`
- `SavedColorsEditor.tsx`
- `TableColumnsEditor.tsx`

3. Quebrar `SvgCanvas.tsx`.

Sugestão:

- `useViewport.ts`
- `useCanvasDrag.ts`
- `useRelationCreation.ts`
- `FloatingToolbar.tsx`
- `RelationLayer.tsx`
- `TableLayer.tsx`
- `GroupLayer.tsx`
- `canvasVisuals.ts`

4. Centralizar visual efetivo.

Hoje existe lógica parecida para saber estilo efetivo da tabela em mais de um lugar.

Criar `src/model/visualSelectors.ts` com:

- `getTableGroupVisual`
- `getEffectiveTableVisual`
- `getRelationColor`
- `getRelationFlowColor`
- `getGroupForTable`

Isso reduz bugs quando cor global/grupo/tabela/linha mudam.

5. Dividir `styles.css`.

Não precisa trocar para CSS modules agora, mas dá para separar por blocos:

- `base.css`
- `layout.css`
- `toolbar.css`
- `canvas.css`
- `properties.css`
- `modal.css`
- `responsive.css`

Se preferir manter um arquivo só, pelo menos adicionar índices/comentários de seção.

### P2 - Melhorias de produto/UX

1. Melhorar a biblioteca de diagramas.

Hoje existe criar e abrir. Seria útil adicionar:

- duplicar diagrama;
- excluir diagrama com confirmação;
- renomear arquivo junto com o nome;
- indicar data de modificação;
- botão "importar DBML";
- botão "exportar DBML";
- estado claro quando salvou no workspace e quando caiu em download.

2. Transformar Ajuda em tela dedicada.

Hoje a ajuda funciona como modal. Para uma experiência mais completa, criar uma área dedicada:

- aba ou rota "Ajuda";
- exemplos DBML e SQL;
- seção "atalhos";
- seção "como resolver problemas";
- mini tutorial visual sobre criar relação;
- explicação clara de FK -> PK e direção das setas.

3. Criar menu de exportação.

Hoje há um botão direto de PDF. O próximo passo poderia ser:

- Exportar PDF normal;
- Exportar PDF com setas acesas;
- Exportar PDF com duas páginas;
- Exportar SVG;
- Exportar PNG;
- escala/resolução;
- fundo transparente ou fundo do canvas;
- opção de incluir/ocultar grid.

4. Melhorar feedback do modo de relação.

Quando o usuário ativa "Nova relação", mostrar um status mais explícito:

- "Clique no campo FK de origem";
- depois "Clique no campo PK de destino";
- botão para cancelar;
- destacar campos clicáveis;
- impedir relação inválida com mensagem visível.

5. Melhorar mobile.

O layout menor hoje empilha painéis, mas ainda parece mais desktop-first. Melhorias:

- transformar painéis laterais em abas;
- toolbar inferior no mobile;
- canvas com altura mais flexível;
- botões maiores para toque;
- testar 390px, 768px e 1024px.

## Testes que faltam

Hoje existem bons testes unitários para parser, exporter e utils. O maior buraco é teste de interação.

Adicionar testes de componente ou E2E para:

- criar tabela pelo botão;
- adicionar campo;
- criar relação clicando em campos;
- selecionar tabela e ver linhas relacionadas destacadas;
- adicionar/remover todos os pontos de linha;
- salvar e reabrir DBML com linha vazia;
- criar grupo e mover label;
- aplicar cor global/grupo/tabela/linha;
- exportar PDF e verificar duas páginas;
- abrir tutorial/ajuda;
- undo/redo depois de drag;
- autosave sem quebrar quando `/__dbml/save` falha.

Ferramentas possíveis:

- Vitest + Testing Library para componentes.
- Playwright para fluxo real no browser.
- Testes unitários extras para `visualSelectors`, `storage`, parser DBML e SQL importer.

## DBML e parser: melhorias úteis

1. Suportar melhor DBML oficial.

Já existe no `PROMPT.md` a direção certa:

- `Project`;
- `TableGroup`;
- refs compostas;
- notes multiline.

Também considerar:

- nomes com schema;
- `TablePartial`;
- enums com notas/settings;
- índices mais ricos;
- refs com cardinalidade mais fiel;
- comentários inline dentro de strings;
- defaults com vírgula/parênteses;
- identificadores com espaços e aspas.

2. Trocar parsing ad hoc por etapas mais explícitas.

Não precisa trazer um parser gigante agora. Mas dá para melhorar:

- scanner/tokenizer simples;
- preservar blocos e comentários com posição;
- associar `@line` ao `Ref` correto;
- erro com linha/coluna melhor;
- testes de roundtrip.

3. Versionar comentários especiais.

Adicionar algo como:

```dbml
// @diagram
// studioVersion=1
```

Isso ajuda quando mudar formato no futuro.

## SQL importer: melhorias úteis

O importer atual cobre o básico e é bom para começar. Melhorias futuras:

- suportar schemas (`public.users`);
- suportar composite foreign keys;
- suportar composite primary keys;
- suportar MySQL/Postgres/SQLite com casos separados;
- suportar `CREATE INDEX`;
- preservar nomes de constraints;
- detectar tipos com `DOUBLE PRECISION`, `TIMESTAMP WITH TIME ZONE`, arrays e enums;
- lidar melhor com comentários e strings que têm `;`;
- mostrar relatório de importação: tabelas criadas, refs criadas, partes ignoradas.

## Linhas/relações: melhorias úteis

1. Documentar regra de direção.

Houve várias mudanças de direção das setas. Criar uma regra central clara:

- `fromTable/fromColumn`: lado FK/origem da relação.
- `toTable/toColumn`: lado PK/destino.
- quando uma tabela PK é selecionada, destacar relações que chegam nela.
- setas animadas devem mostrar o sentido visual correto da relação.

Depois transformar isso em helper com testes.

2. Melhorar roteamento para muitas relações.

Hoje várias relações entre as mesmas tabelas podem ficar sobrepostas. Ideias:

- offset automático por índice;
- bundle visual leve;
- espaçamento por coluna;
- rotas paralelas sem sobreposição;
- prioridade para evitar atravessar grupos/tabelas.

3. Implementar ou remover offsets.

Se quiser endpoints arrastáveis de verdade, implementar offsets:

- usar `startOffsetX/Y` e `endOffsetX/Y` na geometria;
- persistir os valores reais;
- permitir reset;
- testar DBML roundtrip.

Se não quiser isso, remover do modelo/export para deixar simples.

4. Unificar cor de linha/seta/export.

Criar selectors:

- cor visível da linha;
- cor da seta animada;
- cor da seta no PDF;
- cor da linha no TikZ.

Hoje o TikZ usa `relation.color`, mesmo quando a relação usa cor da tabela. Isso pode deixar export visual diferente do canvas.

## Exportação: melhorias úteis

1. PDF.

O PDF agora gera duas páginas: uma com fluxo/setas acesas e uma normal. Melhorias:

- adicionar título discreto nas páginas: "Fluxo das relações" e "Diagrama normal";
- opção para escolher quais páginas exportar;
- testar quantidade de páginas em E2E;
- lidar com diagramas muito grandes dividindo em páginas ou aumentando escala;
- mostrar feedback se export falhar.

2. SVG/PNG.

Adicionar export SVG e PNG reaproveitando parte de `pdfExport.ts`:

- clonar SVG;
- inline styles;
- escolher escala;
- escolher incluir grid;
- baixar arquivo.

3. TikZ.

Hoje o TikZ não acompanha todos os detalhes visuais do canvas. Melhorar:

- usar cor efetiva da relação quando `usesTableLineColor=true`;
- exportar grupos com label color correto;
- considerar estilo de grupo por posição ou membership;
- testar labels e caracteres especiais.

## Performance

Pontos prováveis de custo:

- exportar DBML/TikZ em toda alteração de `diagram`;
- atualizar estado React em todo `pointermove`;
- recalcular caminhos/jumps para muitas relações;
- rasterizar SVG grande no PDF;
- `PropertiesPanel` e canvas re-renderizando juntos.

Sugestões:

- debounce de export textual;
- `requestAnimationFrame` para drag;
- memoizar selectors de visual/relação;
- separar estado de viewport/drag do modelo persistente;
- só salvar no fim de batch ou com debounce maior;
- medir com React Profiler antes/depois.

## Acessibilidade

Melhorias recomendadas:

- `aria-label` em todos os botões icon-only, não só `title`;
- fechar modal com `Esc`;
- foco inicial e foco preso dentro do modal;
- devolver foco ao botão que abriu o modal;
- navegação por teclado no canvas para selecionar/mover tabela;
- atalhos documentados;
- mensagens de status com `role=status`;
- contraste mínimo para badges/linhas em temas customizados.

## Documentação

Adicionar um `README.md` simples com:

- o que é o app;
- como rodar;
- scripts;
- como o DBML especial funciona;
- onde ficam os arquivos salvos;
- como exportar;
- limitações conhecidas.

Também considerar transformar `docs/system-report.tex` em Markdown ou manter os dois sincronizados. Hoje o `.tex` já explica bem a arquitetura, mas fica menos prático para usar como prompt.

## Coisas para tirar ou simplificar

1. Tirar duplicação de visual efetivo.

Não deixar `getEffectiveTableVisual` duplicado em canvas, painel e exportadores.

2. Tirar lógica de storage espalhada.

Centralizar `localStorage`, fetch de workspace e fallback de download.

3. Tirar campos não usados do modelo, se não forem implementados.

Principalmente offsets e `arrowColor`.

4. Tirar acoplamento entre parser e ordem das relações.

`@line` por índice é frágil.

5. Evitar aumentar ainda mais arquivos monolíticos.

Qualquer feature nova grande deveria primeiro criar componente/hook/helper próprio.

## Coisas que eu manteria

- SVG como render principal.
- DBML como fonte exportável.
- Comentários especiais para metadados visuais.
- Vitest para regras puras.
- ELK importado dinamicamente.
- jsPDF importado dinamicamente.
- Toolbar flutuante no canvas.
- Painéis colapsáveis.
- Undo/redo com batch para drag.
- Cores salvas no modelo do diagrama.

## Prompts prontos para próximas sessões

### Prompt 1 - Corrigir roundtrip de metadados

```text
Você é um engenheiro frontend/fullstack sênior neste repo. Quero corrigir problemas de roundtrip do DBML sem quebrar compatibilidade.

Tarefas:
- Fazer `@group` exportar e reimportar `tables=` corretamente.
- Fazer `@line` não depender apenas da ordem das relações.
- Usar a chave do bloco `@line` quando existir e manter fallback para arquivos antigos.
- Adicionar testes de parse/export/reparse cobrindo grupos com `tables=` e múltiplas relações reordenadas.
- Rodar typecheck, testes e build.

Critério de aceite:
- Salvar e reabrir DBML não perde `group.tables`.
- Comentários de linha continuam aplicados na relação correta mesmo com refs reordenadas.
- DBML antigo continua funcionando.
```

### Prompt 2 - Refatorar controller sem mudar comportamento

```text
Refatore `src/editor/useDiagramController.ts` por etapas, sem mudar comportamento.

Objetivo:
- Separar responsabilidades em arquivos menores.
- Manter a API pública `DiagramController` compatível.
- Não mexer no visual.

Sugestão:
- Extrair storage/persistência.
- Extrair history/undo/redo.
- Extrair comandos de table/column/relation/group.
- Extrair helpers de nomes e normalização.

Adicionar testes onde fizer sentido e rodar typecheck/test/build.
```

### Prompt 3 - Melhorar performance de drag/autosave/export

```text
Analise e otimize a performance durante drag, resize e edição contínua.

Foco:
- Evitar exportar DBML/TikZ a cada `pointermove`.
- Debounce/throttle de autosave e exports.
- Usar batch de histórico apenas no fim da interação.
- Manter UI responsiva.
- Não perder autosave depois que o usuário solta o mouse.

Adicionar testes unitários para helpers novos e validar manualmente no navegador.
```

### Prompt 4 - Criar testes E2E do fluxo principal

```text
Adicionar testes E2E com Playwright para o DBML Studio.

Cenários mínimos:
- abrir app;
- criar tabela;
- adicionar campo;
- criar relação clicando nos campos;
- adicionar/remover pontos da linha;
- garantir que linha continua existindo sem pontos;
- abrir Ajuda;
- exportar PDF e validar que arquivo tem duas páginas ou ao menos que a ação conclui sem erro.

Se precisar ajustar o app para ficar testável, adicionar labels/aria-labels sem mudar o design.
```

### Prompt 5 - Melhorar parser DBML oficial

```text
Melhorar compatibilidade do parser DBML.

Prioridades:
- `Project`;
- `TableGroup`;
- refs compostas;
- notes multiline;
- comentários inline dentro de strings;
- identificadores com schema e aspas.

Manter comentários especiais do DBML Studio funcionando.
Adicionar testes antes/depois para cada sintaxe nova.
```

### Prompt 6 - Criar menu de exportação

```text
Trocar o botão direto de PDF por um menu de exportação.

Opções:
- PDF normal;
- PDF com setas acesas;
- PDF com duas páginas;
- SVG;
- PNG;
- incluir/ocultar grid;
- escala/resolução.

Reaproveitar `pdfExport.ts` quando possível e extrair helpers comuns de export SVG/PNG.
Manter o design compacto do header.
```

### Prompt 7 - Melhorar biblioteca de diagramas

```text
Melhorar a gestão de diagramas no header.

Adicionar:
- excluir diagrama com confirmação;
- duplicar diagrama;
- renomear mantendo filename coerente;
- mostrar data de atualização;
- importar DBML;
- exportar DBML.

Garantir que autosave, localStorage e pasta `dbml/` continuam consistentes.
Adicionar testes para helpers de persistência.
```

### Prompt 8 - Centralizar visual selectors

```text
Criar `src/model/visualSelectors.ts` para centralizar regras visuais.

Extrair:
- `getTableGroupVisual`;
- `getEffectiveTableVisual`;
- `getRelationColor`;
- `getRelationFlowColor`;
- helpers para PDF/TikZ usarem a mesma cor do canvas.

Substituir duplicações em `SvgCanvas.tsx`, `PropertiesPanel.tsx`, `tikzExporter.ts` e `pdfExport.ts`.
Adicionar testes unitários.
```

### Prompt 9 - Acessibilidade e modal

```text
Revisar acessibilidade do app.

Foco:
- aria-label em botões icon-only;
- fechar modais com Esc;
- foco inicial no modal;
- prender foco dentro do modal;
- devolver foco ao botão que abriu;
- mensagens de status;
- atalhos documentados na Ajuda.

Não mudar a identidade visual, só deixar mais robusto e claro.
```

### Prompt 10 - Transformar Ajuda em tela dedicada

```text
Transformar a Ajuda em uma tela/seção dedicada integrada ao app.

Requisitos:
- acessível pelo header;
- não parecer landing page;
- ter exemplos DBML/SQL;
- explicar FK -> PK e direção das setas;
- explicar grupos, cores e exportação;
- manter layout limpo e responsivo;
- preservar o modal atual apenas se fizer sentido como atalho rápido.
```

## Ordem sugerida para próximas sessões

1. Prompt 1: corrigir roundtrip de metadados.
2. Prompt 8: centralizar visual selectors.
3. Prompt 3: performance de drag/autosave/export.
4. Prompt 4: testes E2E.
5. Prompt 2: refatorar controller.
6. Prompt 6 ou 7, dependendo se você quiser priorizar export ou gestão de arquivos.
7. Prompt 5: parser DBML mais completo.
8. Prompt 9 e 10: acessibilidade e ajuda dedicada.

## Checklist de validação para qualquer próxima mudança

Rodar:

```bash
npm run typecheck
npm test
npm run build
```

Validar manualmente:

- abrir `http://localhost:5174/`;
- criar uma linha;
- remover todos os pontos;
- salvar e reabrir;
- selecionar tabela PK e ver setas/linhas destacadas;
- exportar PDF;
- abrir Ajuda;
- testar painel em tela menor.

