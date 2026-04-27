-- Habilita Supabase Realtime sobre public.notifications.
-- La RLS users_read_own_notifications (recipient_id = auth.uid()) sigue aplicando
-- en el canal, por lo que cada usuario solo recibe sus propias filas.

alter table public.notifications replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end$$;
