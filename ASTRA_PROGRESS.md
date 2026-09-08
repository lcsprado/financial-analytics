# Consolidação TESTE + PRODUÇÃO — 2026-09-08

## Objetivo
Consolidar a base TESTE com tudo que está funcionando na PRODUÇÃO, preservando as inovações válidas da TESTE, sem alterar a produção durante esta etapa.

## Ambientes confirmados
- PRODUÇÃO: `main`
- Commit de produção no início da consolidação: `2f6fed3d1e47f58fd7a2ff027b5e0aad80d3c592`
- TESTE: `feature/login-base-online`
- Commit da TESTE no início da consolidação: `61396073e9309fb8f310dcc38f0b84d4faa188fc`
- Merge base histórico: `27f876f0cbe3abc0829b9c144aba49cfaf0f28d1`

## Backups
- PRODUÇÃO: `backup-pre-astra-2026-09-08`
- TESTE: `backup-teste-pre-integracao-2026-09-08`
- Branch de trabalho: `homologacao-consolidada-2026-09-08`

## Divergência inicial
- TESTE possui 48 commits exclusivos em relação à PRODUÇÃO.
- PRODUÇÃO possui 24 commits exclusivos em relação à TESTE.

## Principais recursos exclusivos da TESTE identificados
- Autenticação/sandbox (`SandboxAuthGate`).
- Administração de usuários da base TESTE.
- Fluxo de primeiro acesso e senha temporária.
- Integração com Supabase para a sandbox.
- Sincronização/hidratação de dados compartilhados da Cielo.
- Modo e refinamentos mobile específicos da sandbox.
- Registro/exibição de autor em ajustes de previsão.
- Revalidação de acesso e atualização direcionada do dashboard.

## Principais avanços exclusivos da PRODUÇÃO identificados
- Correções recentes de conciliação de contas a receber / FINR020.
- Correções de faixa de datas em recebimentos e emissões.
- Correções de semanas da previsão entre meses.
- Ajustes de layout/tabela da previsão.
- Sincronização de navegação da previsão.
- Controles finos de vínculo de clientes nos recebimentos.
- Exportação Excel formatada dos recebimentos.
- Correções de impressão e filtros.
- Ajustes recentes de CSP/Supabase e parsers.

## Arquivos com sobreposição relevante entre as duas linhas
- `app/page.tsx`
- `components/PerformanceScopedEnhancers.tsx`
- `components/ReceiptDateRangeFilter.tsx`
- `lib/forecastManualAdjustments.ts`
- `components/ReceiptForecastFilterLayoutFixV22.tsx`

## Regras de segurança
- NÃO alterar `main` nesta etapa.
- NÃO alterar as branches de backup.
- NÃO fazer force push.
- NÃO trocar domínio de produção.
- NÃO promover a homologação para produção sem validação posterior.
- Em conflito, preservar comportamento comprovadamente correto da PRODUÇÃO por padrão, mantendo recursos intencionais da TESTE quando compatíveis.
- Mudanças em valores, saldos, previsões, recebimentos, duplicidades ou agrupamentos exigem validação funcional específica.

## Próximo passo
Trazer PRODUÇÃO -> `homologacao-consolidada-2026-09-08`, resolver sobreposições de forma controlada e então executar validação de build/runtime e fluxos financeiros antes de qualquer promoção.
