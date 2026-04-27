-- Borra completamente el servicio "enisa-docs":
-- triggers + funciones de notificación, tablas de negocio, bucket de storage,
-- policy del bucket, permisos del catálogo y la fila en `services` (que cascadea
-- a `department_services`, `company_services` y `company_technicians`).

SET search_path = public;

-- 1) Triggers + funciones de notificación
DROP TRIGGER IF EXISTS on_enisa_submission_inserted ON public.enisa_submissions;
DROP TRIGGER IF EXISTS on_enisa_welcome_email_inserted ON public.enisa_notifications;
DROP FUNCTION IF EXISTS public.trigger_notify_enisa_submission();
DROP FUNCTION IF EXISTS public.trigger_notify_enisa_welcome();

-- 2) Tablas de negocio (cascade arrastra índices, FKs y políticas RLS)
DROP TABLE IF EXISTS public.enisa_box_reviews CASCADE;
DROP TABLE IF EXISTS public.enisa_credentials CASCADE;
DROP TABLE IF EXISTS public.enisa_documents CASCADE;
DROP TABLE IF EXISTS public.enisa_notifications CASCADE;
DROP TABLE IF EXISTS public.enisa_submissions CASCADE;

-- 3) Policy de lectura del bucket
DROP POLICY IF EXISTS admins_read_all_enisa ON storage.objects;

-- Nota: el bucket "enisa-documents" y sus objetos se eliminan aparte
-- (Supabase bloquea DELETE directo en storage.* desde SQL — usar dashboard
-- o Storage API).

-- 4) Permisos del catálogo (FK ON DELETE CASCADE limpia role_permissions y profile_permissions)
DELETE FROM public.permissions
WHERE code IN ('view_enisa_submissions', 'review_enisa_submission');

-- 5) Servicio (FK ON DELETE CASCADE limpia department_services, company_services y company_technicians)
DELETE FROM public.services WHERE slug = 'enisa-docs';
