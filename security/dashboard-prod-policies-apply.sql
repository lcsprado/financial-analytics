-- Fase 1: políticas de produção. Compatível com o primeiro acesso do código atual.
-- Não modifica dados, perfis, usuários, view nem políticas de outras tabelas.
begin;
set local lock_timeout = '5s';

drop policy dashboard_prod_snapshots_read_authenticated on public.dashboard_prod_snapshots;
create policy dashboard_prod_snapshots_read_authenticated
  on public.dashboard_prod_snapshots
  for select to authenticated
  using (
    exists (
      select 1 from public.dashboard_prod_profiles p
      where p.user_id = (select auth.uid())
        and p.must_change_password = false
    )
  );

drop policy dashboard_prod_snapshots_insert_updaters on public.dashboard_prod_snapshots;
create policy dashboard_prod_snapshots_insert_updaters
  on public.dashboard_prod_snapshots
  for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and exists (
      select 1 from public.dashboard_prod_profiles p
      where p.user_id = (select auth.uid())
        and p.role in ('admin', 'updater')
        and p.must_change_password = false
    )
  );

drop policy dashboard_prod_snapshots_delete_admin on public.dashboard_prod_snapshots;
create policy dashboard_prod_snapshots_delete_admin
  on public.dashboard_prod_snapshots
  for delete to authenticated
  using (
    exists (
      select 1 from public.dashboard_prod_profiles p
      where p.user_id = (select auth.uid())
        and p.role = 'admin'
        and p.must_change_password = false
    )
  );

commit;

