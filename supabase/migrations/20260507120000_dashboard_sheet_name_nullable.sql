-- El render del dashboard pasó a leer las hojas crudas del Sheet
-- (facturasVentaHolded_lineas, Facturas_compra_holded, extractosBancarios)
-- y agregar en server, en vez de leer una pestaña concreta de KPIs.
-- Por eso `sheet_name` deja de ser obligatorio.

ALTER TABLE dashboard.client_dashboards ALTER COLUMN sheet_name DROP NOT NULL;
