-- Restaura exatamente as três políticas registradas antes da correção.
begin;
set local lock_timeout = '5s';

drop policy dashboard_prod_snapshots_read_authenticated on public.dashboard_prod_snapshots;
create policy dashboard_prod_snapshots_read_authenticated
  on public.dashboard_prod_snapshots
  for select to authenticated
  using (true);

drop policy dashboard_prod_snapshots_insert_updaters on public.dashboard_prod_snapshots;
create policy dashboard_prod_snapshots_insert_updaters
  on public.dashboard_prod_snapshots
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.dashboard_prod_profiles p
      where p.user_id = auth.uid()
        and p.role = any (array['admin'::text, 'updater'::text])
    )
  );

drop policy dashboard_prod_snapshots_delete_admin on public.dashboard_prod_snapshots;
create policy dashboard_prod_snapshots_delete_admin
  on public.dashboard_prod_snapshots
  for delete to authenticated
  using (
    exists (
      select 1 from public.dashboard_prod_profiles p
      where p.user_id = auth.uid()
        and p.role = 'admin'
    )
  );

commit;

