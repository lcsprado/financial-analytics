-- Restaura o GRANT observado na auditoria, caso a fase 2 precise ser revertida.
begin;
set local lock_timeout = '5s';
grant execute on function public.dashboard_prod_finish_password_change() to authenticated;
commit;

