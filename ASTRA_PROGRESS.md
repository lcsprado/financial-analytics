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

### Checkpoint publicado — correção verificada na Preview
- Commit enviado à homologação: `2f14c0ec04973a6f79d4952d8960e0adc8863ab5` (`fix: proteger importação com autenticação da sandbox`).
- Deployment da correção: `dpl_DovvAjSjXnTjE2qV2JJigsdLLczv`, READY, target Preview, commit e branch conferidos via Vercel.
- Reteste no navegador em https://financial-analytics-ovpf9qoaz-lcshprado.vercel.app/importar: login obrigatório, nenhum controle de upload sem sessão, nenhum erro/warning capturado no console.
- Login local inspecionado visualmente em 390 x 844; campos e botão legíveis. Isso não valida o dashboard mobile autenticado.
- Este checkpoint também preserva o padrão LF dos arquivos alterados pelo conector.
- URL estável da homologação: https://financial-analytics-git-homologacao-consolidad-cc10ce-lcshprado.vercel.app/
- Próximo passo obrigatório: abrir essa URL estável, entrar com usuário da sandbox e executar a bateria autenticada/financeira listada acima. A solicitação de autenticação foi apresentada ao usuário; não foram fornecidas credenciais nem obtida sessão da aplicação nesta rodada.
- Não promover. Classificação atual: NÃO APTA PARA PRODUÇÃO por validação incompleta.

## Retomada autenticada e checkpoint após interrupção — 2026-09-09
- Alterações locais recuperadas: correção em `lib/parsers.ts` e novo teste `tests/receipt-invoice-numbers.test.ts`. Preservadas após revisão.
- A sessão autenticada da sandbox abriu normalmente na Preview. Navegação mobile por Menu → Importar e Recebimentos exercitada.
- Bases anteriores: 1.547 emissões, 2.509 recebimentos. Ano 1901 visível no filtro foi rastreado a uma data incorreta na planilha antiga; a conciliação atual já corrige essa data. Não foi inventada data nem alterada a planilha.
- Arquivos atuais indicados explicitamente pelo usuário: FINR020 em `C:\Relatorios ToTvs\finr020.xlsx`; conciliação na pasta corporativa `Financeiro - Documentos\Financeiro\BIOMEGA`.
- Importação real na Preview: FINR020 confirmou 1.650 emissões importadas com sucesso; conciliação chegou a 2.616 recebimentos. A conclusão da sincronização deve ser reconferida na retomada.
- Leitura local das fontes atuais pelo parser confirmou 1.650 emissões e 2.616 recebimentos; não há datas anteriores a 2020. Existem candidatos a duplicidade que ainda precisam ser investigados por título/origem antes de qualquer exclusão.
- Bug confirmado no navegador: descrição `NF 10833 - 50%` era identificada como `1083350`; casos equivalentes em NF 537 e 539. Corrigido o parser para retirar percentuais antes de extrair os números das notas, sem modificar valores, datas ou bancos.
- Em 09/09, os seis testes passaram: cinco de previsão/semanas/filtros e um teste de importação com seis cenários de NF, percentuais, números múltiplos, zeros à esquerda e ponto de milhar. A primeira tentativa da rodada anterior falhou porque a planilha sintética tinha um banco, enquanto o formato reconhecido requer dois; o fixture foi corrigido antes da interrupção.
- A interrupção anterior ocorreu por limite de uso na revisão automática de execução. Nenhum teste bloqueado foi declarado aprovado.
- Próximos passos: enviar esta correção à homologação, confirmar Preview READY, reimportar conciliação na versão corrigida, verificar NF 10833/537/539 e invariância dos valores. Conferir totais/líquidos por fonte, duplicidades, conciliação/vínculos, previsão, Cielo, Excel/PDF, sessão e mobile.
- Classificação mantida: NÃO APTA PARA PRODUÇÃO enquanto a validação crítica estiver incompleta. Main e produção não alteradas.

### Correção de persistência das NFs — 2026-09-09
- Commit de parser publicado: `62526b237433aaa2591f8fcdcb8cea42279dc489`; Preview READY `dpl_ANzwdZfp7MAvVx2pxqtyHyT9mhY4`.
- Sessão retomada no dia seguinte sem pedir login; perfil admin e base compartilhada carregados. A importação anterior foi sincronizada com sucesso.
- A fonte corporativa recebeu um novo lançamento desde 08/09: agora são 2.617 recebimentos (1.679 em 2026). Não atribuir a diferença de quantidade à correção de parser.
- Comparação do parser anterior e corrigido sobre os MESMOS bytes: nove NFs corrigidas, invariância exata de todos os demais campos dos 2.617 recebimentos.
- Reimportação na Preview corrigiu NF 10833 na tela, porém reload recuperou `1083350`. Causa confirmada: `dataFingerprint` ignorava invoiceNumbers, descrição e identificadores de clientes/títulos; mesma quantidade/data/valor impedia sincronização.
- Corrigida a comparação para incluir os campos persistidos de emissões e recebimentos, extraída para função pura testável. Mantidos autenticação, tabelas, autoria e permissões existentes.
- Oito testes automatizados passaram, incluindo detecção da correção de NF sem alteração de valores e alterações de identificação de cliente/título.
- Controle independente da FINR020: 1.650 linhas; bruto R$ 307.366.721,57, líquido R$ 287.059.537,44 e tributos R$ 20.307.184,13, diferença zero.
- Candidatos a duplicidade da fonte foram apresentados ao usuário e preservados: duas linhas de recebimento de R$ 300.000,00 em 27/05/2026; dez linhas de ACORDO de R$ 16.233,79. Outro par de mesma NF/valor tem títulos distintos.
- Diferença de arredondamento a investigar: total de recebimentos de 2026 exibido R$ 264.016.166,47 versus R$ 264.016.166,56 somando cada linha arredondada a centavos. Não corrigir sem rastrear a precisão da origem.
- Próximo passo: retestar persistência após deployment desta correção e concluir conferência de precisão, conciliação, Cielo, filtros/exportação/impressão e previsão.
