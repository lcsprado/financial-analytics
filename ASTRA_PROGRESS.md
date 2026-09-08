# Consolidação TESTE + PRODUÇÃO — 2026-09-08

## Objetivo
Consolidar a base TESTE com tudo que está funcionando na PRODUÇÃO, preservando as inovações válidas da TESTE, sem alterar a produção durante esta etapa.

## Ambientes confirmados
- PRODUÇÃO: `main`
- Commit de produção no início da consolidação: `2f6fed3d1e47f58fd7a2ff027b5e0aad80d3c592`
- TESTE original: `feature/login-base-online`
- Commit da TESTE no início da consolidação: `61396073e9309fb8f310dcc38f0b84d4faa188fc`
- Merge base histórico: `27f876f0cbe3abc0829b9c144aba49cfaf0f28d1`
- Branch consolidada: `homologacao-consolidada-2026-09-08`
- Commit de consolidação: `81426bb58ce887fd6c6161afbb38ef79f9a839b9`

## Backups
- PRODUÇÃO: `backup-pre-astra-2026-09-08`
- TESTE: `backup-teste-pre-integracao-2026-09-08`
- Nenhuma branch de backup deve ser alterada.

## Divergência inicial
- TESTE possuía 48 commits exclusivos em relação à PRODUÇÃO.
- PRODUÇÃO possuía 24 commits exclusivos em relação à TESTE.

## Estado após consolidação
- A branch consolidada contém integralmente o commit atual de PRODUÇÃO como ancestral.
- Comparação `main -> homologacao-consolidada-2026-09-08`: `behind_by = 0`.
- Portanto, nenhuma alteração atual da PRODUÇÃO ficou faltando na branch consolidada no momento da integração.
- A PRODUÇÃO (`main`) não foi alterada.

## Recursos da TESTE preservados
- Autenticação/sandbox (`SandboxAuthGate`).
- Administração de usuários da base TESTE.
- Fluxo de primeiro acesso e senha temporária.
- Integração autenticada com Supabase na sandbox.
- Sincronização/hidratação de dados compartilhados da Cielo.
- Modo e refinamentos mobile específicos da sandbox.
- Registro/exibição de autor em ajustes de previsão.
- Revalidação de acesso e atualização direcionada do dashboard.
- Ajustes de layout da previsão existentes na TESTE.

## Avanços atuais da PRODUÇÃO incorporados
- Correções recentes de conciliação de contas a receber / FINR020.
- Correções de faixa de datas em recebimentos e emissões.
- Correções de semanas da previsão entre meses.
- Ajustes atuais de layout/tabela da previsão.
- Sincronização de navegação da previsão.
- Controles finos de vínculo de clientes nos recebimentos.
- Exportação Excel formatada dos recebimentos.
- Correções atuais de impressão e filtros.
- Ajustes recentes de CSP/Supabase, parsers e importação.

## Resolução das principais sobreposições
- `app/page.tsx`: combinados os wrappers da sandbox com todos os enhancers atuais da PRODUÇÃO.
- `components/PerformanceScopedEnhancers.tsx`: preservado o autor dos ajustes e o carregamento adiado dos enhancers de emissões da TESTE; mantida a decisão atual da PRODUÇÃO de não remontar os filtros de faixa de data antigos nesse componente.
- `components/ReceiptDateRangeFilter.tsx`: mantida a versão atual da PRODUÇÃO.
- `components/ReceiptForecastFilterLayoutFixV22.tsx`: preservada a evolução específica da TESTE.
- `lib/forecastManualAdjustments.ts`: mantida a tabela/fluxo autenticado da TESTE (`forecast_manual_adjustments`), e NÃO a tabela de produção, para impedir que a homologação escreva nos ajustes de produção. A adaptação final para promoção deve ser revisada explicitamente.

## Vercel / build
- Preview consolidada gerada pela Vercel: `financial-analytics-git-homologacao-consolidad-cc10ce-lcshprado.vercel.app`
- Deployment validado: `dpl_HDcxkwFBjxa5ZfacK24fwwvfmvYJ`
- Estado: `READY`.
- `next build` concluído com sucesso.
- Type checking concluído no build.
- Apenas warnings existentes de Autoprefixer sobre `end` vs `flex-end`; não bloquearam o build.
- Rotas geradas incluem `/`, `/importar` e `/api/dashboard-test/users`.

## Validações já concluídas
- PRODUÇÃO preservada e sem alteração.
- Backup de PRODUÇÃO existente.
- Backup da TESTE criado.
- PRODUÇÃO incorporada na homologação.
- Homologação está `behind_by = 0` em relação a `main`.
- Build da aplicação concluído com sucesso na Vercel.
- Preview da homologação em estado READY.

## Validações ainda pendentes — obrigatórias antes de qualquer promoção
- Login, logout, primeiro acesso, troca/redefinição de senha e expiração/desativação de usuário.
- Carregamento inicial após autenticação.
- Importação das planilhas reais de teste.
- FINR020 / conciliação de contas a receber.
- Recebimentos e filtros por datas.
- Vínculos de clientes e controles finos.
- Previsão de recebimentos, semanas, ajustes manuais e autor dos ajustes.
- Cielo compartilhado.
- Totais, saldos, líquidos, agrupamentos, duplicidades e KPIs.
- Exportação Excel.
- Impressão/PDF.
- Navegação entre telas.
- Desktop e mobile.
- Console do navegador e erros de runtime.

## Regras de segurança
- NÃO alterar `main` nesta etapa.
- NÃO alterar as branches de backup.
- NÃO fazer force push.
- NÃO trocar domínio de produção.
- NÃO promover a homologação para produção sem validação funcional posterior.
- Mudanças em valores, saldos, previsões, recebimentos, duplicidades ou agrupamentos exigem validação funcional específica.
- A homologação deve continuar usando dados/tabelas de TESTE até a etapa explícita de promoção.

## Próximo passo
Abrir a Preview consolidada em navegador, executar a bateria funcional acima, corrigir regressões somente na branch `homologacao-consolidada-2026-09-08` e emitir recomendação final: `APTA PARA PROMOÇÃO`, `APTA COM RESSALVAS` ou `NÃO APTA PARA PRODUÇÃO`.

## Validação funcional — rodada iniciada em 2026-09-08
- Trabalho restrito à branch `homologacao-consolidada-2026-09-08`, partindo de `5f03b9917d3605526f57bb11264ca526983410be`.
- Preview original conferida pela API Vercel: deployment `dpl_8zoMMiK1ktMrPuu36gkgMH23M6oN`, READY, ambiente Preview, mesma branch e commit.
- URL testada: https://financial-analytics-h960wgplm-lcshprado.vercel.app/
- O acesso inicial exigiu login Vercel; depois a página principal exibiu corretamente o login da aplicação. Ainda não há sessão autenticada de teste disponível.

### Bug confirmado e correção
- Acesso direto a `/importar` na Preview, sem sessão da aplicação, exibia os controles de upload. A rota não tinha `SandboxAuthGate`, ao contrário do dashboard; também não aplicava o fluxo de primeiro acesso.
- Adicionado `app/importar/layout.tsx` reutilizando o gate existente. Isso protege a montagem da página, aplica sessão/primeiro acesso e mantém a sincronização autenticada da sandbox.
- Corrigido o aviso da importação para informar que dados importados por administradores/atualizadores são sincronizados com a base de teste.
- Reprodução original no navegador: `/` mostrou login; `/importar` mostrou as duas áreas de upload sem login. Console da importação sem erros/warnings capturados.
- Reteste do build corrigido no navegador local em `http://127.0.0.1:3100/importar`: mostra login e não mostra os controles de upload.

### Verificações executadas
- Cinco testes existentes de `tests/receipt-forecast-weeks.test.ts`: todos passaram. Cobrem semanas completas, totais semanais/consolidados, recebimento de 02/09, início de setembro e filtros combinados.
- Build local antes e após a correção: concluídos com sucesso, incluindo tipos. Warnings preexistentes de Autoprefixer no primeiro build.
- Dependências locais instaladas com pnpm sem modificar o package-lock; a validação da Vercel com o lock do repositório ainda deve ser conferida no novo deployment.
- Esses testes sintéticos NÃO aprovam valores financeiros das planilhas reais nem substituem a bateria autenticada.

### Pendências e próximo passo
- Publicar esta correção somente na branch de homologação e confirmar o novo deployment Preview.
- Autenticar usuário de teste na aplicação para testar login positivo, logout, persistência/expiração da sessão, primeiro acesso e perfis.
- Executar importações com planilhas de teste e conferir valores de origem contra FINR020, recebimentos, conciliação/vínculos, previsão, líquidos/saldos/totais/semanas, filtros, Cielo compartilhado, Excel e PDF.
- Completar desktop/mobile, console/runtime e retestar o fluxo autenticado da rota corrigida.
- Classificação provisória: NÃO APTA PARA PRODUÇÃO, pois a validação funcional financeira e autenticada permanece pendente.
- Nenhuma alteração em main, backups, domínio ou deployment de produção.
