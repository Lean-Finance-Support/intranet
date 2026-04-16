-- Caja de "Observaciones del trimestre" del cliente en Modelos Fiscales.
-- Espejo de public.tax_quarter_comments (que escribe el asesor) pero escribible
-- por clientes de la empresa correspondiente y solo-lectura para admins.
-- Una fila por (company_id, year, quarter).

SET search_path = public;

CREATE TABLE public.tax_quarter_client_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    year integer NOT NULL,
    quarter integer NOT NULL,
    comment_text text DEFAULT ''::text NOT NULL,
    edited_by uuid,
    edited_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tax_quarter_client_comments_quarter_check CHECK (quarter >= 1 AND quarter <= 4)
);

ALTER TABLE ONLY public.tax_quarter_client_comments
    ADD CONSTRAINT tax_quarter_client_comments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.tax_quarter_client_comments
    ADD CONSTRAINT tax_quarter_client_comments_company_year_quarter_key
    UNIQUE (company_id, year, quarter);

CREATE INDEX tax_quarter_client_comments_company_year_quarter_idx
    ON public.tax_quarter_client_comments USING btree (company_id, year, quarter);

ALTER TABLE ONLY public.tax_quarter_client_comments
    ADD CONSTRAINT tax_quarter_client_comments_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.tax_quarter_client_comments
    ADD CONSTRAINT tax_quarter_client_comments_edited_by_fkey
    FOREIGN KEY (edited_by) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.tax_quarter_client_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY admins_read_tax_quarter_client_comments
    ON public.tax_quarter_client_comments
    FOR SELECT USING (is_admin(auth.uid()));

CREATE POLICY clients_read_own_tax_quarter_client_comments
    ON public.tax_quarter_client_comments
    FOR SELECT USING (
        is_client(auth.uid()) AND EXISTS (
            SELECT 1 FROM profile_companies pc
            WHERE pc.profile_id = auth.uid()
              AND pc.company_id = tax_quarter_client_comments.company_id
        )
    );

CREATE POLICY clients_insert_own_tax_quarter_client_comments
    ON public.tax_quarter_client_comments
    FOR INSERT WITH CHECK (
        is_client(auth.uid()) AND EXISTS (
            SELECT 1 FROM profile_companies pc
            WHERE pc.profile_id = auth.uid()
              AND pc.company_id = tax_quarter_client_comments.company_id
        )
    );

CREATE POLICY clients_update_own_tax_quarter_client_comments
    ON public.tax_quarter_client_comments
    FOR UPDATE USING (
        is_client(auth.uid()) AND EXISTS (
            SELECT 1 FROM profile_companies pc
            WHERE pc.profile_id = auth.uid()
              AND pc.company_id = tax_quarter_client_comments.company_id
        )
    ) WITH CHECK (
        is_client(auth.uid()) AND EXISTS (
            SELECT 1 FROM profile_companies pc
            WHERE pc.profile_id = auth.uid()
              AND pc.company_id = tax_quarter_client_comments.company_id
        )
    );
