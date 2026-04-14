--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.1

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--



--
-- Name: department; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.department AS ENUM (
    'Financiación Pública',
    'Finanzas',
    'Asesoría Fiscal',
    'Asesoría Laboral',
    'Asesoría Legal',
    'Data / Tech'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'client',
    'admin',
    'superadmin'
);


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (
    NEW.id,
    NEW.email,
    CASE 
      WHEN (NEW.raw_user_meta_data->>'role') IS NOT NULL 
      THEN (NEW.raw_user_meta_data->>'role')::public.user_role
      ELSE NULL
    END
  );
  RETURN NEW;
END;
$$;


--
-- Name: is_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_admin(user_id uuid) RETURNS boolean
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = user_id AND role IN ('admin', 'superadmin')
  );
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: trigger_notify_enisa_submission(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_notify_enisa_submission() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://wgxugccbatusioubnsfl.supabase.co/functions/v1/notify-enisa-submission',
    body    := jsonb_build_object(
                 'record', jsonb_build_object(
                   'company_id',    NEW.company_id,
                   'submitted_by',  NEW.submitted_by
                 )
               ),
    headers := jsonb_build_object(
                 'Content-Type',     'application/json',
                 'x-webhook-secret', 'wh_lf_9f3k2m7p4x1r8s'
               )
  );
  RETURN NEW;
END;
$$;


--
-- Name: trigger_notify_enisa_welcome(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_notify_enisa_welcome() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://wgxugccbatusioubnsfl.supabase.co/functions/v1/notify-enisa-welcome',
    body    := jsonb_build_object(
                 'company_id',        NEW.company_id,
                 'notification_type', NEW.notification_type
               ),
    headers := jsonb_build_object(
                 'Content-Type',     'application/json',
                 'x-webhook-secret', 'wh_lf_9f3k2m7p4x1r8s'
               )
  );
  RETURN NEW;
END;
$$;


--
-- Name: trigger_notify_tax_models(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_notify_tax_models() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://wgxugccbatusioubnsfl.supabase.co/functions/v1/notify-tax-models',
    body    := jsonb_build_object(
                 'company_id',        NEW.company_id,
                 'year',              NEW.year,
                 'quarter',           NEW.quarter,
                 'notification_type', NEW.notification_type
               ),
    headers := jsonb_build_object(
                 'Content-Type',     'application/json',
                 'x-webhook-secret', 'wh_lf_9f3k2m7p4x1r8s'
               )
  );
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.companies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_name text NOT NULL,
    nif text NOT NULL,
    phone text,
    address text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    legal_name text NOT NULL,
    is_demo boolean DEFAULT false NOT NULL
);


--
-- Name: COLUMN companies.company_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.company_name IS 'Nombre comercial de la empresa (opcional, editable por admins)';


--
-- Name: COLUMN companies.legal_name; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.companies.legal_name IS 'Nombre legal/razón social de la empresa (obligatorio)';


--
-- Name: company_bank_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_bank_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    iban text NOT NULL,
    bank_name text,
    label text,
    is_default boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE company_bank_accounts; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.company_bank_accounts IS 'Cuentas bancarias (IBAN) de cada empresa cliente';


--
-- Name: company_services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    service_id uuid NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    contracted_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE company_services; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.company_services IS 'Tabla de unión: servicios contratados por cada empresa';


--
-- Name: company_technicians; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_technicians (
    company_id uuid NOT NULL,
    service_id uuid NOT NULL,
    technician_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: department_chiefs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.department_chiefs (
    profile_id uuid NOT NULL,
    department_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: department_services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.department_services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    department_id uuid NOT NULL,
    service_id uuid NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE department_services; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.department_services IS 'Servicios asociados a cada departamento interno';


--
-- Name: departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    chief_id uuid
);


--
-- Name: TABLE departments; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.departments IS 'Departamentos internos de LeanFinance';


--
-- Name: COLUMN departments.chief_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.departments.chief_id IS 'Jefe del departamento (profile de admin)';


--
-- Name: enisa_box_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enisa_box_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    document_type_key text NOT NULL,
    status text NOT NULL,
    rejection_comment text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT enisa_box_reviews_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'validated'::text, 'rejected'::text])))
);


--
-- Name: enisa_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enisa_credentials (
    company_id uuid NOT NULL,
    username text DEFAULT ''::text NOT NULL,
    password text DEFAULT ''::text NOT NULL,
    is_submitted boolean DEFAULT false NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: enisa_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enisa_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    document_type_key text NOT NULL,
    file_name text NOT NULL,
    file_path text NOT NULL,
    file_size bigint NOT NULL,
    mime_type text DEFAULT 'application/pdf'::text NOT NULL,
    is_submitted boolean DEFAULT false NOT NULL,
    uploaded_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: enisa_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enisa_notifications (
    company_id uuid NOT NULL,
    sent_by uuid NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    notification_type text DEFAULT 'welcome'::text NOT NULL,
    CONSTRAINT enisa_notifications_notification_type_check CHECK ((notification_type = ANY (ARRAY['welcome'::text, 'update'::text])))
);


--
-- Name: enisa_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.enisa_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    submitted_by uuid NOT NULL,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    recipient_id uuid NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    link text,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    company_id uuid
);


--
-- Name: TABLE notifications; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.notifications IS 'Inbox de notificaciones internas para admins y clientes';


--
-- Name: profile_companies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profile_companies (
    profile_id uuid NOT NULL,
    company_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profile_departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profile_departments (
    profile_id uuid NOT NULL,
    department_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    full_name text,
    role public.user_role,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    display_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE services; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.services IS 'Catálogo de servicios que LeanFinance ofrece a sus clientes';


--
-- Name: COLUMN services.slug; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.services.slug IS 'Identificador programático estable para uso en código';


--
-- Name: tax_client_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tax_client_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tax_entry_id uuid NOT NULL,
    bank_account_id uuid,
    approved boolean DEFAULT true NOT NULL,
    approved_by uuid NOT NULL,
    approved_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    CONSTRAINT tax_client_responses_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text])))
);


--
-- Name: TABLE tax_client_responses; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tax_client_responses IS 'Respuesta del cliente (OK + IBAN) por cada tax entry';


--
-- Name: tax_client_submissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tax_client_submissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    year integer NOT NULL,
    quarter integer NOT NULL,
    submitted_by uuid NOT NULL,
    submitted_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE tax_client_submissions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.tax_client_submissions IS 'Registro de cuándo el cliente envió sus respuestas de un trimestre al asesor';


--
-- Name: tax_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tax_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    tax_model_id uuid NOT NULL,
    amount numeric(12,2) DEFAULT 0 NOT NULL,
    entry_type text NOT NULL,
    filled_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT tax_entries_entry_type_check CHECK ((entry_type = ANY (ARRAY['pagar'::text, 'percibir'::text])))
);


--
-- Name: tax_models; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tax_models (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    year smallint DEFAULT 2026 NOT NULL,
    quarter smallint NOT NULL,
    model_code text NOT NULL,
    display_order smallint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    description text,
    is_informative boolean DEFAULT false NOT NULL,
    CONSTRAINT tax_models_quarter_check CHECK (((quarter >= 1) AND (quarter <= 4)))
);


--
-- Name: tax_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tax_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    year smallint NOT NULL,
    quarter smallint NOT NULL,
    notified_by uuid NOT NULL,
    notified_at timestamp with time zone DEFAULT now(),
    notification_type text DEFAULT 'update'::text NOT NULL,
    CONSTRAINT tax_notifications_type_check CHECK ((notification_type = ANY (ARRAY['update'::text, 'presentation'::text])))
);


--
-- Name: tax_quarter_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tax_quarter_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    company_id uuid NOT NULL,
    year integer NOT NULL,
    quarter integer NOT NULL,
    comment_text text DEFAULT ''::text NOT NULL,
    edited_by uuid,
    edited_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tax_quarter_comments_quarter_check CHECK (((quarter >= 1) AND (quarter <= 4)))
);


--
-- Name: companies companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.companies
    ADD CONSTRAINT companies_pkey PRIMARY KEY (id);


--
-- Name: company_bank_accounts company_bank_accounts_iban_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_bank_accounts
    ADD CONSTRAINT company_bank_accounts_iban_key UNIQUE (iban);


--
-- Name: company_bank_accounts company_bank_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_bank_accounts
    ADD CONSTRAINT company_bank_accounts_pkey PRIMARY KEY (id);


--
-- Name: company_services company_services_company_id_service_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_services
    ADD CONSTRAINT company_services_company_id_service_id_key UNIQUE (company_id, service_id);


--
-- Name: company_services company_services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_services
    ADD CONSTRAINT company_services_pkey PRIMARY KEY (id);


--
-- Name: company_technicians company_technicians_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_technicians
    ADD CONSTRAINT company_technicians_pkey PRIMARY KEY (company_id, service_id, technician_id);


--
-- Name: department_chiefs department_chiefs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_chiefs
    ADD CONSTRAINT department_chiefs_pkey PRIMARY KEY (profile_id, department_id);


--
-- Name: department_services department_services_department_id_service_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_services
    ADD CONSTRAINT department_services_department_id_service_id_key UNIQUE (department_id, service_id);


--
-- Name: department_services department_services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_services
    ADD CONSTRAINT department_services_pkey PRIMARY KEY (id);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (id);


--
-- Name: departments departments_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_slug_key UNIQUE (slug);


--
-- Name: enisa_box_reviews enisa_box_reviews_company_id_document_type_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enisa_box_reviews
    ADD CONSTRAINT enisa_box_reviews_company_id_document_type_key_key UNIQUE (company_id, document_type_key);


--
-- Name: enisa_box_reviews enisa_box_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enisa_box_reviews
    ADD CONSTRAINT enisa_box_reviews_pkey PRIMARY KEY (id);


--
-- Name: enisa_credentials enisa_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enisa_credentials
    ADD CONSTRAINT enisa_credentials_pkey PRIMARY KEY (company_id);


--
-- Name: enisa_documents enisa_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enisa_documents
    ADD CONSTRAINT enisa_documents_pkey PRIMARY KEY (id);


--
-- Name: enisa_notifications enisa_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enisa_notifications
    ADD CONSTRAINT enisa_notifications_pkey PRIMARY KEY (id);


--
-- Name: enisa_submissions enisa_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enisa_submissions
    ADD CONSTRAINT enisa_submissions_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: profile_companies profile_companies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_companies
    ADD CONSTRAINT profile_companies_pkey PRIMARY KEY (profile_id, company_id);


--
-- Name: profile_departments profile_departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_departments
    ADD CONSTRAINT profile_departments_pkey PRIMARY KEY (profile_id, department_id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: services services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_pkey PRIMARY KEY (id);


--
-- Name: services services_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.services
    ADD CONSTRAINT services_slug_key UNIQUE (slug);


--
-- Name: tax_client_responses tax_client_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_client_responses
    ADD CONSTRAINT tax_client_responses_pkey PRIMARY KEY (id);


--
-- Name: tax_client_responses tax_client_responses_tax_entry_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_client_responses
    ADD CONSTRAINT tax_client_responses_tax_entry_id_key UNIQUE (tax_entry_id);


--
-- Name: tax_client_submissions tax_client_submissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_client_submissions
    ADD CONSTRAINT tax_client_submissions_pkey PRIMARY KEY (id);


--
-- Name: tax_entries tax_entries_company_id_tax_model_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_entries
    ADD CONSTRAINT tax_entries_company_id_tax_model_id_key UNIQUE (company_id, tax_model_id);


--
-- Name: tax_entries tax_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_entries
    ADD CONSTRAINT tax_entries_pkey PRIMARY KEY (id);


--
-- Name: tax_models tax_models_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_models
    ADD CONSTRAINT tax_models_pkey PRIMARY KEY (id);


--
-- Name: tax_models tax_models_year_quarter_model_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_models
    ADD CONSTRAINT tax_models_year_quarter_model_code_key UNIQUE (year, quarter, model_code);


--
-- Name: tax_notifications tax_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_notifications
    ADD CONSTRAINT tax_notifications_pkey PRIMARY KEY (id);


--
-- Name: tax_quarter_comments tax_quarter_comments_company_id_year_quarter_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_quarter_comments
    ADD CONSTRAINT tax_quarter_comments_company_id_year_quarter_key UNIQUE (company_id, year, quarter);


--
-- Name: tax_quarter_comments tax_quarter_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_quarter_comments
    ADD CONSTRAINT tax_quarter_comments_pkey PRIMARY KEY (id);


--
-- Name: enisa_notifications_company_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX enisa_notifications_company_type_idx ON public.enisa_notifications USING btree (company_id, notification_type);


--
-- Name: idx_company_bank_accounts_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_bank_accounts_company_id ON public.company_bank_accounts USING btree (company_id);


--
-- Name: idx_company_services_company_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_services_company_id ON public.company_services USING btree (company_id);


--
-- Name: idx_company_services_service_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_services_service_id ON public.company_services USING btree (service_id);


--
-- Name: idx_department_services_department_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_department_services_department_id ON public.department_services USING btree (department_id);


--
-- Name: idx_department_services_service_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_department_services_service_id ON public.department_services USING btree (service_id);


--
-- Name: idx_enisa_docs_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enisa_docs_company ON public.enisa_documents USING btree (company_id);


--
-- Name: idx_enisa_docs_company_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enisa_docs_company_type ON public.enisa_documents USING btree (company_id, document_type_key);


--
-- Name: idx_enisa_submissions_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_enisa_submissions_company ON public.enisa_submissions USING btree (company_id);


--
-- Name: idx_notifications_recipient; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_recipient ON public.notifications USING btree (recipient_id);


--
-- Name: idx_notifications_recipient_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_recipient_company ON public.notifications USING btree (recipient_id, company_id);


--
-- Name: idx_notifications_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_unread ON public.notifications USING btree (recipient_id) WHERE (is_read = false);


--
-- Name: idx_one_default_per_company; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_one_default_per_company ON public.company_bank_accounts USING btree (company_id) WHERE (is_default = true);


--
-- Name: idx_tax_client_responses_tax_entry; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tax_client_responses_tax_entry ON public.tax_client_responses USING btree (tax_entry_id);


--
-- Name: idx_tax_client_submissions_company; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tax_client_submissions_company ON public.tax_client_submissions USING btree (company_id);


--
-- Name: tax_quarter_comments_company_id_year_quarter_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX tax_quarter_comments_company_id_year_quarter_idx ON public.tax_quarter_comments USING btree (company_id, year, quarter);


--
-- Name: companies companies_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER companies_updated_at BEFORE UPDATE ON public.companies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: enisa_submissions on_enisa_submission_inserted; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_enisa_submission_inserted AFTER INSERT ON public.enisa_submissions FOR EACH ROW EXECUTE FUNCTION public.trigger_notify_enisa_submission();


--
-- Name: enisa_notifications on_enisa_welcome_email_inserted; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_enisa_welcome_email_inserted AFTER INSERT ON public.enisa_notifications FOR EACH ROW EXECUTE FUNCTION public.trigger_notify_enisa_welcome();


--
-- Name: tax_notifications on_tax_notification_inserted; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER on_tax_notification_inserted AFTER INSERT ON public.tax_notifications FOR EACH ROW EXECUTE FUNCTION public.trigger_notify_tax_models();


--
-- Name: profiles profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: company_bank_accounts set_company_bank_accounts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_company_bank_accounts_updated_at BEFORE UPDATE ON public.company_bank_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: company_services set_company_services_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_company_services_updated_at BEFORE UPDATE ON public.company_services FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: department_services set_department_services_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_department_services_updated_at BEFORE UPDATE ON public.department_services FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: departments set_departments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_departments_updated_at BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: services set_services_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_services_updated_at BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: tax_client_responses set_tax_client_responses_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER set_tax_client_responses_updated_at BEFORE UPDATE ON public.tax_client_responses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: company_bank_accounts company_bank_accounts_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_bank_accounts
    ADD CONSTRAINT company_bank_accounts_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: company_services company_services_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_services
    ADD CONSTRAINT company_services_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: company_services company_services_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_services
    ADD CONSTRAINT company_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;


--
-- Name: company_technicians company_technicians_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_technicians
    ADD CONSTRAINT company_technicians_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: company_technicians company_technicians_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_technicians
    ADD CONSTRAINT company_technicians_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;


--
-- Name: company_technicians company_technicians_technician_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_technicians
    ADD CONSTRAINT company_technicians_technician_id_fkey FOREIGN KEY (technician_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: department_chiefs department_chiefs_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_chiefs
    ADD CONSTRAINT department_chiefs_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;


--
-- Name: department_chiefs department_chiefs_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_chiefs
    ADD CONSTRAINT department_chiefs_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: department_services department_services_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_services
    ADD CONSTRAINT department_services_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;


--
-- Name: department_services department_services_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.department_services
    ADD CONSTRAINT department_services_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;


--
-- Name: departments departments_chief_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_chief_id_fkey FOREIGN KEY (chief_id) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: enisa_box_reviews enisa_box_reviews_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enisa_box_reviews
    ADD CONSTRAINT enisa_box_reviews_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: enisa_box_reviews enisa_box_reviews_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enisa_box_reviews
    ADD CONSTRAINT enisa_box_reviews_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id);


--
-- Name: enisa_credentials enisa_credentials_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enisa_credentials
    ADD CONSTRAINT enisa_credentials_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: enisa_credentials enisa_credentials_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enisa_credentials
    ADD CONSTRAINT enisa_credentials_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id);


--
-- Name: enisa_documents enisa_documents_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enisa_documents
    ADD CONSTRAINT enisa_documents_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: enisa_documents enisa_documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enisa_documents
    ADD CONSTRAINT enisa_documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES auth.users(id);


--
-- Name: enisa_notifications enisa_notifications_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enisa_notifications
    ADD CONSTRAINT enisa_notifications_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: enisa_notifications enisa_notifications_sent_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enisa_notifications
    ADD CONSTRAINT enisa_notifications_sent_by_fkey FOREIGN KEY (sent_by) REFERENCES auth.users(id);


--
-- Name: enisa_submissions enisa_submissions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enisa_submissions
    ADD CONSTRAINT enisa_submissions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: enisa_submissions enisa_submissions_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.enisa_submissions
    ADD CONSTRAINT enisa_submissions_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES auth.users(id);


--
-- Name: notifications notifications_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_recipient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: profile_companies profile_companies_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_companies
    ADD CONSTRAINT profile_companies_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: profile_companies profile_companies_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_companies
    ADD CONSTRAINT profile_companies_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: profile_departments profile_departments_department_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_departments
    ADD CONSTRAINT profile_departments_department_id_fkey FOREIGN KEY (department_id) REFERENCES public.departments(id) ON DELETE CASCADE;


--
-- Name: profile_departments profile_departments_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profile_departments
    ADD CONSTRAINT profile_departments_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: tax_client_responses tax_client_responses_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_client_responses
    ADD CONSTRAINT tax_client_responses_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.profiles(id);


--
-- Name: tax_client_responses tax_client_responses_bank_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_client_responses
    ADD CONSTRAINT tax_client_responses_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.company_bank_accounts(id) ON DELETE RESTRICT;


--
-- Name: tax_client_responses tax_client_responses_tax_entry_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_client_responses
    ADD CONSTRAINT tax_client_responses_tax_entry_id_fkey FOREIGN KEY (tax_entry_id) REFERENCES public.tax_entries(id) ON DELETE CASCADE;


--
-- Name: tax_client_submissions tax_client_submissions_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_client_submissions
    ADD CONSTRAINT tax_client_submissions_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: tax_client_submissions tax_client_submissions_submitted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_client_submissions
    ADD CONSTRAINT tax_client_submissions_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES public.profiles(id);


--
-- Name: tax_entries tax_entries_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_entries
    ADD CONSTRAINT tax_entries_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: tax_entries tax_entries_filled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_entries
    ADD CONSTRAINT tax_entries_filled_by_fkey FOREIGN KEY (filled_by) REFERENCES auth.users(id);


--
-- Name: tax_entries tax_entries_tax_model_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_entries
    ADD CONSTRAINT tax_entries_tax_model_id_fkey FOREIGN KEY (tax_model_id) REFERENCES public.tax_models(id) ON DELETE CASCADE;


--
-- Name: tax_notifications tax_notifications_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_notifications
    ADD CONSTRAINT tax_notifications_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: tax_notifications tax_notifications_notified_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_notifications
    ADD CONSTRAINT tax_notifications_notified_by_fkey FOREIGN KEY (notified_by) REFERENCES auth.users(id);


--
-- Name: tax_quarter_comments tax_quarter_comments_company_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_quarter_comments
    ADD CONSTRAINT tax_quarter_comments_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE;


--
-- Name: tax_quarter_comments tax_quarter_comments_edited_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tax_quarter_comments
    ADD CONSTRAINT tax_quarter_comments_edited_by_fkey FOREIGN KEY (edited_by) REFERENCES public.profiles(id) ON DELETE SET NULL;


--
-- Name: companies Admins can manage companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can manage companies" ON public.companies USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::public.user_role, 'superadmin'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::public.user_role, 'superadmin'::public.user_role]))))));


--
-- Name: tax_entries Admins manage tax_entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage tax_entries" ON public.tax_entries USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::public.user_role, 'superadmin'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::public.user_role, 'superadmin'::public.user_role]))))));


--
-- Name: tax_notifications Admins manage tax_notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage tax_notifications" ON public.tax_notifications USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::public.user_role, 'superadmin'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::public.user_role, 'superadmin'::public.user_role]))))));


--
-- Name: tax_quarter_comments Admins manage tax_quarter_comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins manage tax_quarter_comments" ON public.tax_quarter_comments USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::public.user_role, 'superadmin'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::public.user_role, 'superadmin'::public.user_role]))))));


--
-- Name: tax_models Authenticated read tax_models; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated read tax_models" ON public.tax_models FOR SELECT TO authenticated USING (true);


--
-- Name: companies Clients can view own company; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients can view own company" ON public.companies FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profile_companies pc
  WHERE ((pc.profile_id = auth.uid()) AND (pc.company_id = companies.id)))));


--
-- Name: tax_entries Clients read own tax_entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients read own tax_entries" ON public.tax_entries FOR SELECT USING ((company_id IN ( SELECT pc.company_id
   FROM public.profile_companies pc
  WHERE (pc.profile_id = auth.uid()))));


--
-- Name: tax_quarter_comments Clients read own tax_quarter_comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Clients read own tax_quarter_comments" ON public.tax_quarter_comments FOR SELECT USING ((company_id IN ( SELECT pc.company_id
   FROM public.profile_companies pc
  WHERE (pc.profile_id = auth.uid()))));


--
-- Name: profiles Service role can manage profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Service role can manage profiles" ON public.profiles USING ((auth.role() = 'service_role'::text));


--
-- Name: profiles Users can view own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING ((auth.uid() = id));


--
-- Name: company_services admins_all_company_services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_all_company_services ON public.company_services USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::public.user_role, 'superadmin'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::public.user_role, 'superadmin'::public.user_role]))))));


--
-- Name: department_services admins_all_department_services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_all_department_services ON public.department_services USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::public.user_role, 'superadmin'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::public.user_role, 'superadmin'::public.user_role]))))));


--
-- Name: departments admins_all_departments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_all_departments ON public.departments USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::public.user_role, 'superadmin'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::public.user_role, 'superadmin'::public.user_role]))))));


--
-- Name: services admins_all_services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_all_services ON public.services USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::public.user_role, 'superadmin'::public.user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::public.user_role, 'superadmin'::public.user_role]))))));


--
-- Name: notifications admins_create_notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_create_notifications ON public.notifications FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::public.user_role, 'superadmin'::public.user_role]))))) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE (profiles.id = notifications.recipient_id)))));


--
-- Name: enisa_box_reviews admins_manage_reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_manage_reviews ON public.enisa_box_reviews USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'superadmin'::public.user_role]))))));


--
-- Name: enisa_notifications admins_manage_welcome; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_manage_welcome ON public.enisa_notifications USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'superadmin'::public.user_role]))))));


--
-- Name: enisa_credentials admins_read_all_credentials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_all_credentials ON public.enisa_credentials FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'superadmin'::public.user_role]))))));


--
-- Name: enisa_documents admins_read_all_enisa_docs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_all_enisa_docs ON public.enisa_documents FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'superadmin'::public.user_role]))))));


--
-- Name: profiles admins_read_all_profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_all_profiles ON public.profiles FOR SELECT USING (public.is_admin(auth.uid()));


--
-- Name: enisa_submissions admins_read_all_submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_all_submissions ON public.enisa_submissions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::public.user_role, 'superadmin'::public.user_role]))))));


--
-- Name: company_bank_accounts admins_read_bank_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_bank_accounts ON public.company_bank_accounts FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::public.user_role, 'superadmin'::public.user_role]))))));


--
-- Name: companies admins_read_companies; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_companies ON public.companies FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::public.user_role, 'superadmin'::public.user_role]))))));


--
-- Name: company_services admins_read_company_services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_company_services ON public.company_services FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::public.user_role, 'superadmin'::public.user_role]))))));


--
-- Name: department_services admins_read_department_services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_department_services ON public.department_services FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::public.user_role, 'superadmin'::public.user_role]))))));


--
-- Name: department_services admins_read_own_department_services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_own_department_services ON public.department_services FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::public.user_role, 'superadmin'::public.user_role]))))));


--
-- Name: tax_client_responses admins_read_responses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_responses ON public.tax_client_responses FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::public.user_role, 'superadmin'::public.user_role]))))));


--
-- Name: services admins_read_services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_services ON public.services FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::public.user_role, 'superadmin'::public.user_role]))))));


--
-- Name: tax_client_submissions admins_read_submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admins_read_submissions ON public.tax_client_submissions FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::public.user_role, 'superadmin'::public.user_role]))))));


--
-- Name: notifications clients_create_notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clients_create_notifications ON public.notifications FOR INSERT TO authenticated WITH CHECK (((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'client'::public.user_role)))) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = notifications.recipient_id) AND (profiles.role = ANY (ARRAY['admin'::public.user_role, 'superadmin'::public.user_role])))))));


--
-- Name: enisa_documents clients_delete_own_enisa_docs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clients_delete_own_enisa_docs ON public.enisa_documents FOR DELETE USING ((company_id IN ( SELECT pc.company_id
   FROM public.profile_companies pc
  WHERE (pc.profile_id = auth.uid()))));


--
-- Name: enisa_documents clients_insert_own_enisa_docs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clients_insert_own_enisa_docs ON public.enisa_documents FOR INSERT WITH CHECK (((company_id IN ( SELECT pc.company_id
   FROM public.profile_companies pc
  WHERE (pc.profile_id = auth.uid()))) AND (uploaded_by = auth.uid())));


--
-- Name: enisa_submissions clients_insert_own_submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clients_insert_own_submissions ON public.enisa_submissions FOR INSERT WITH CHECK (((company_id IN ( SELECT pc.company_id
   FROM public.profile_companies pc
  WHERE (pc.profile_id = auth.uid()))) AND (submitted_by = auth.uid())));


--
-- Name: company_bank_accounts clients_manage_own_bank_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clients_manage_own_bank_accounts ON public.company_bank_accounts USING ((EXISTS ( SELECT 1
   FROM (public.profiles p
     JOIN public.profile_companies pc ON ((pc.profile_id = p.id)))
  WHERE ((p.id = auth.uid()) AND (p.role = 'client'::public.user_role) AND (pc.company_id = company_bank_accounts.company_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.profiles p
     JOIN public.profile_companies pc ON ((pc.profile_id = p.id)))
  WHERE ((p.id = auth.uid()) AND (p.role = 'client'::public.user_role) AND (pc.company_id = company_bank_accounts.company_id)))));


--
-- Name: tax_client_responses clients_manage_own_responses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clients_manage_own_responses ON public.tax_client_responses USING ((EXISTS ( SELECT 1
   FROM ((public.tax_entries te
     JOIN public.profile_companies pc ON ((pc.company_id = te.company_id)))
     JOIN public.profiles p ON ((p.id = pc.profile_id)))
  WHERE ((te.id = tax_client_responses.tax_entry_id) AND (p.id = auth.uid()) AND (p.role = 'client'::public.user_role))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ((public.tax_entries te
     JOIN public.profile_companies pc ON ((pc.company_id = te.company_id)))
     JOIN public.profiles p ON ((p.id = pc.profile_id)))
  WHERE ((te.id = tax_client_responses.tax_entry_id) AND (p.id = auth.uid()) AND (p.role = 'client'::public.user_role)))));


--
-- Name: tax_client_submissions clients_manage_own_submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clients_manage_own_submissions ON public.tax_client_submissions USING ((EXISTS ( SELECT 1
   FROM (public.profiles p
     JOIN public.profile_companies pc ON ((pc.profile_id = p.id)))
  WHERE ((p.id = auth.uid()) AND (p.role = 'client'::public.user_role) AND (pc.company_id = tax_client_submissions.company_id))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (public.profiles p
     JOIN public.profile_companies pc ON ((pc.profile_id = p.id)))
  WHERE ((p.id = auth.uid()) AND (p.role = 'client'::public.user_role) AND (pc.company_id = tax_client_submissions.company_id)))));


--
-- Name: services clients_read_active_services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clients_read_active_services ON public.services FOR SELECT TO authenticated USING (((is_active = true) AND (EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'client'::public.user_role))))));


--
-- Name: departments clients_read_departments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clients_read_departments ON public.departments FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'client'::public.user_role)))));


--
-- Name: company_services clients_read_own_company_services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clients_read_own_company_services ON public.company_services FOR SELECT USING (((is_active = true) AND (EXISTS ( SELECT 1
   FROM (public.profiles p
     JOIN public.profile_companies pc ON ((pc.profile_id = p.id)))
  WHERE ((p.id = auth.uid()) AND (p.role = 'client'::public.user_role) AND (pc.company_id = company_services.company_id))))));


--
-- Name: enisa_credentials clients_read_own_credentials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clients_read_own_credentials ON public.enisa_credentials FOR SELECT USING ((company_id IN ( SELECT pc.company_id
   FROM public.profile_companies pc
  WHERE (pc.profile_id = auth.uid()))));


--
-- Name: enisa_documents clients_read_own_enisa_docs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clients_read_own_enisa_docs ON public.enisa_documents FOR SELECT USING ((company_id IN ( SELECT pc.company_id
   FROM public.profile_companies pc
  WHERE (pc.profile_id = auth.uid()))));


--
-- Name: tax_notifications clients_read_own_notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clients_read_own_notifications ON public.tax_notifications FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (public.profiles p
     JOIN public.profile_companies pc ON ((pc.profile_id = p.id)))
  WHERE ((p.id = auth.uid()) AND (p.role = 'client'::public.user_role) AND (pc.company_id = tax_notifications.company_id)))));


--
-- Name: enisa_box_reviews clients_read_own_reviews; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clients_read_own_reviews ON public.enisa_box_reviews FOR SELECT USING ((company_id IN ( SELECT pc.company_id
   FROM public.profile_companies pc
  WHERE (pc.profile_id = auth.uid()))));


--
-- Name: enisa_submissions clients_read_own_submissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clients_read_own_submissions ON public.enisa_submissions FOR SELECT USING ((company_id IN ( SELECT pc.company_id
   FROM public.profile_companies pc
  WHERE (pc.profile_id = auth.uid()))));


--
-- Name: enisa_credentials clients_update_own_credentials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clients_update_own_credentials ON public.enisa_credentials FOR UPDATE USING ((company_id IN ( SELECT pc.company_id
   FROM public.profile_companies pc
  WHERE (pc.profile_id = auth.uid()))));


--
-- Name: enisa_credentials clients_upsert_own_credentials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clients_upsert_own_credentials ON public.enisa_credentials FOR INSERT WITH CHECK ((company_id IN ( SELECT pc.company_id
   FROM public.profile_companies pc
  WHERE (pc.profile_id = auth.uid()))));


--
-- Name: companies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

--
-- Name: company_bank_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_bank_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: company_services; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_services ENABLE ROW LEVEL SECURITY;

--
-- Name: company_technicians; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_technicians ENABLE ROW LEVEL SECURITY;

--
-- Name: company_technicians company_technicians_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_technicians_admin_select ON public.company_technicians FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::public.user_role, 'superadmin'::public.user_role]))))));


--
-- Name: company_technicians company_technicians_chief_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY company_technicians_chief_manage ON public.company_technicians USING ((EXISTS ( SELECT 1
   FROM (public.department_chiefs dc
     JOIN public.department_services ds ON ((ds.department_id = dc.department_id)))
  WHERE ((dc.profile_id = auth.uid()) AND (ds.service_id = company_technicians.service_id)))));


--
-- Name: department_chiefs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.department_chiefs ENABLE ROW LEVEL SECURITY;

--
-- Name: department_chiefs department_chiefs_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY department_chiefs_admin_select ON public.department_chiefs FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::public.user_role, 'superadmin'::public.user_role]))))));


--
-- Name: department_chiefs department_chiefs_chief_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY department_chiefs_chief_manage ON public.department_chiefs USING ((profile_id = auth.uid()));


--
-- Name: department_services; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.department_services ENABLE ROW LEVEL SECURITY;

--
-- Name: departments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

--
-- Name: enisa_box_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.enisa_box_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: enisa_credentials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.enisa_credentials ENABLE ROW LEVEL SECURITY;

--
-- Name: enisa_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.enisa_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: enisa_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.enisa_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: enisa_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.enisa_submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: profile_companies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profile_companies ENABLE ROW LEVEL SECURITY;

--
-- Name: profile_companies profile_companies_admin_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profile_companies_admin_all ON public.profile_companies USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::public.user_role, 'superadmin'::public.user_role]))))));


--
-- Name: profile_companies profile_companies_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profile_companies_admin_select ON public.profile_companies FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::public.user_role, 'superadmin'::public.user_role]))))));


--
-- Name: profile_companies profile_companies_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profile_companies_select_own ON public.profile_companies FOR SELECT USING ((auth.uid() = profile_id));


--
-- Name: profile_departments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profile_departments ENABLE ROW LEVEL SECURITY;

--
-- Name: profile_departments profile_departments_admin_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profile_departments_admin_select ON public.profile_departments FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::public.user_role, 'superadmin'::public.user_role]))))));


--
-- Name: profile_departments profile_departments_chief_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profile_departments_chief_manage ON public.profile_departments USING ((EXISTS ( SELECT 1
   FROM public.department_chiefs dc
  WHERE (dc.profile_id = auth.uid()))));


--
-- Name: profile_departments profile_departments_select_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profile_departments_select_own ON public.profile_departments FOR SELECT USING ((auth.uid() = profile_id));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: services; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

--
-- Name: tax_client_responses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tax_client_responses ENABLE ROW LEVEL SECURITY;

--
-- Name: tax_client_submissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tax_client_submissions ENABLE ROW LEVEL SECURITY;

--
-- Name: tax_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tax_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: tax_models; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tax_models ENABLE ROW LEVEL SECURITY;

--
-- Name: tax_notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tax_notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: tax_quarter_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tax_quarter_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications users_read_own_notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_read_own_notifications ON public.notifications FOR SELECT USING ((recipient_id = auth.uid()));


--
-- Name: notifications users_update_own_notifications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY users_update_own_notifications ON public.notifications FOR UPDATE USING ((recipient_id = auth.uid())) WITH CHECK ((recipient_id = auth.uid()));


--
-- PostgreSQL database dump complete
--


