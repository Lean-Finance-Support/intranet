-- Añade el valor 'client_apartado' al enum permission_scope_type para que el
-- siguiente refactor pueda usarlo. Va en migración propia porque PostgreSQL
-- no permite usar un valor de enum recién añadido en la misma transacción.

ALTER TYPE public.permission_scope_type ADD VALUE IF NOT EXISTS 'client_apartado';
