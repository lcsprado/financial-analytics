-- Fase 2: executar somente após a rota /api/dashboard/password estar em produção.
begin;
set local lock_timeout = '5s';
revoke execute on function public.dashboard_prod_finish_password_change() from authenticated;
commit;

