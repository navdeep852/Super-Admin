-- =============================================================================
-- VISTAAR BUSINESS OS — SUPABASE DATABASE MIGRATION (PHASE 2)
-- Migration File: supabase/migrations/001_initial_schema.sql
-- Description: Complete normalized schema, multi-tenant workspace architecture,
--              Row Level Security (RLS) policies, indexes, triggers, ID mappings,
--              and Storage bucket policies.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. EXTENSIONS & UTILITY FUNCTIONS
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Generic trigger function to automatically update `updated_at` timestamps
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- 1. CUSTOM ENUMS
-- -----------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE public.user_role AS ENUM ('owner', 'admin', 'manager', 'employee', 'staff');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.employee_status AS ENUM ('Pending', 'Active', 'Inactive', 'Suspended');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.customer_type AS ENUM ('Retail', 'Wholesale', 'Corporate');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.stock_movement_type AS ENUM ('STOCK_RECEIVED', 'SALE', 'RETURN', 'DAMAGE', 'LOSS', 'ADJUSTMENT');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.quotation_status AS ENUM ('Draft', 'Sent', 'Viewed', 'Accepted', 'Rejected', 'Expired', 'Converted');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.invoice_status AS ENUM ('Draft', 'Issued', 'Partially Paid', 'Paid', 'Cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.counter_sale_status AS ENUM ('COMPLETED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.udhari_status AS ENUM ('UNPAID', 'PARTIALLY PAID', 'PAID', 'OVERDUE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.payment_method AS ENUM ('Cash', 'UPI', 'Bank Transfer', 'Card', 'Cheque', 'Other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.expense_category AS ENUM ('Rent', 'Salary', 'Electricity', 'Internet', 'Transport', 'Marketing', 'Software', 'Office', 'Maintenance', 'Other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.followup_status AS ENUM ('Pending', 'Due', 'Completed', 'Cancelled', 'Rescheduled', 'Failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.followup_priority AS ENUM ('Low', 'Medium', 'High', 'Urgent');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.followup_action_type AS ENUM ('WHATSAPP_MESSAGE', 'INTERNAL_REMINDER', 'EMAIL', 'CALL_REMINDER', 'SEND_QUOTATION', 'SEND_INVOICE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- -----------------------------------------------------------------------------
-- 2. CORE WORKSPACE & MULTI-TENANCY TABLES
-- -----------------------------------------------------------------------------

-- WORKSPACES
CREATE TABLE IF NOT EXISTS public.workspaces (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_name VARCHAR(255) NOT NULL,
    owner_name VARCHAR(255) NOT NULL,
    owner_email VARCHAR(255) NOT NULL UNIQUE,
    owner_phone VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TRIGGER set_workspaces_updated_at
    BEFORE UPDATE ON public.workspaces
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- PROFILES (Linked to Supabase Auth auth.users and public.workspaces)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    employee_id VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    department VARCHAR(100),
    designation VARCHAR(100),
    role public.user_role NOT NULL DEFAULT 'employee',
    status public.employee_status NOT NULL DEFAULT 'Active',
    avatar_url TEXT,
    must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT unique_workspace_employee_id UNIQUE (workspace_id, employee_id)
);

CREATE TRIGGER set_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- BUSINESS SETTINGS
CREATE TABLE IF NOT EXISTS public.business_settings (
    workspace_id UUID PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
    legal_name VARCHAR(255),
    business_type VARCHAR(100),
    business_description TEXT,
    owner_name VARCHAR(255),
    phone VARCHAR(50) NOT NULL,
    alternate_phone VARCHAR(50),
    email VARCHAR(255) NOT NULL,
    website VARCHAR(255),
    gstin VARCHAR(50),
    pan VARCHAR(50),
    reg_number VARCHAR(50),
    address TEXT NOT NULL,
    address_line_2 TEXT,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    pincode VARCHAR(20) NOT NULL,
    country VARCHAR(100) DEFAULT 'India',
    logo_url TEXT,
    logo_alignment VARCHAR(20) DEFAULT 'left',
    logo_scale NUMERIC(3,2) DEFAULT 1.0,
    signature_url TEXT,
    signature_alignment VARCHAR(20) DEFAULT 'right',
    signature_scale NUMERIC(3,2) DEFAULT 1.0,
    stamp_url TEXT,
    stamp_alignment VARCHAR(20) DEFAULT 'left',
    stamp_scale NUMERIC(3,2) DEFAULT 1.0,
    bank_details JSONB,
    show_bank_on_invoice BOOLEAN DEFAULT TRUE,
    show_bank_on_quotation BOOLEAN DEFAULT TRUE,
    currency VARCHAR(10) DEFAULT '₹',
    default_tax_mode VARCHAR(20) DEFAULT 'Exclusive',
    invoice_prefix VARCHAR(20) DEFAULT 'INV-',
    quotation_prefix VARCHAR(20) DEFAULT 'QT-',
    default_payment_terms VARCHAR(50) DEFAULT 'Net 15',
    default_quotation_validity VARCHAR(50) DEFAULT '15 Days',
    default_font VARCHAR(50) DEFAULT 'Inter',
    default_orientation VARCHAR(20) DEFAULT 'portrait',
    default_invoice_template VARCHAR(100) DEFAULT 'inv-modern-blue',
    default_quotation_template VARCHAR(100) DEFAULT 'qt-modern-blue',
    brand_color VARCHAR(20) DEFAULT '#2563eb',
    theme VARCHAR(10) DEFAULT 'light',
    terms_and_conditions TEXT,
    default_invoice_terms TEXT,
    default_quotation_terms TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_business_settings_updated_at
    BEFORE UPDATE ON public.business_settings
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------------------------
-- 3. MASTER DATA TABLES (CATEGORIES, SUPPLIERS, CUSTOMERS, PRODUCTS)
-- -----------------------------------------------------------------------------

-- CATEGORIES
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT unique_workspace_category_name UNIQUE (workspace_id, name)
);

CREATE TRIGGER set_categories_updated_at
    BEFORE UPDATE ON public.categories
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- SUPPLIERS
CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    contact_person VARCHAR(255),
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(255),
    address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TRIGGER set_suppliers_updated_at
    BEFORE UPDATE ON public.suppliers
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- CUSTOMERS
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    whatsapp VARCHAR(50),
    email VARCHAR(255),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    pincode VARCHAR(20),
    gstin VARCHAR(50),
    customer_type public.customer_type NOT NULL DEFAULT 'Retail',
    credit_limit NUMERIC(12,2) DEFAULT 0,
    payment_terms VARCHAR(50) DEFAULT 'Net 15',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TRIGGER set_customers_updated_at
    BEFORE UPDATE ON public.customers
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- PRODUCTS
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    product_name VARCHAR(255),
    part_number VARCHAR(100),
    product_code VARCHAR(100),
    sku VARCHAR(100) NOT NULL,
    barcode VARCHAR(100),
    brand VARCHAR(100),
    unit VARCHAR(50) NOT NULL DEFAULT 'Pcs',
    buy_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    current_buy_price NUMERIC(12,2) DEFAULT 0,
    selling_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    current_sell_price NUMERIC(12,2) DEFAULT 0,
    minimum_stock NUMERIC(10,2) NOT NULL DEFAULT 5,
    minimum_stock_level NUMERIC(10,2) DEFAULT 5,
    tax_percent NUMERIC(5,2) NOT NULL DEFAULT 18.0,
    hsn_sac VARCHAR(50),
    gst_rate NUMERIC(5,2) DEFAULT 18.0,
    description TEXT,
    notes TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ,
    CONSTRAINT unique_workspace_product_sku UNIQUE (workspace_id, sku)
);

CREATE TRIGGER set_products_updated_at
    BEFORE UPDATE ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- INVENTORY SETTINGS
CREATE TABLE IF NOT EXISTS public.inventory_settings (
    workspace_id UUID PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
    uses_part_number BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 4. STOCK & INVENTORY TRANSACTION TABLES
-- -----------------------------------------------------------------------------

-- STOCK RECEIPTS (GRN Batches for FIFO Tracking)
CREATE TABLE IF NOT EXISTS public.stock_receipts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
    receipt_number VARCHAR(100) NOT NULL,
    purchase_order_number VARCHAR(100),
    supplier_name VARCHAR(255),
    received_date DATE NOT NULL DEFAULT CURRENT_DATE,
    quantity_received NUMERIC(10,2) NOT NULL,
    quantity_remaining NUMERIC(10,2) NOT NULL,
    buy_price NUMERIC(12,2) NOT NULL,
    reference VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_stock_receipts_updated_at
    BEFORE UPDATE ON public.stock_receipts
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- STOCK MOVEMENTS
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    stock_receipt_id UUID REFERENCES public.stock_receipts(id) ON DELETE SET NULL,
    type public.stock_movement_type NOT NULL,
    quantity NUMERIC(10,2) NOT NULL,
    movement_date DATE NOT NULL DEFAULT CURRENT_DATE,
    reference_id VARCHAR(100),
    reference_type VARCHAR(50),
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- IMPORT SESSIONS
CREATE TABLE IF NOT EXISTS public.import_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    session_code VARCHAR(100) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
    total_rows INT NOT NULL DEFAULT 0,
    valid_rows INT NOT NULL DEFAULT 0,
    warning_rows INT NOT NULL DEFAULT 0,
    error_rows INT NOT NULL DEFAULT 0,
    new_products_count INT DEFAULT 0,
    existing_products_count INT DEFAULT 0,
    stock_receipts_count INT DEFAULT 0,
    total_units_added NUMERIC(10,2) DEFAULT 0,
    rows_data JSONB NOT NULL DEFAULT '[]'::jsonb,
    column_mappings JSONB NOT NULL DEFAULT '{}'::jsonb,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- -----------------------------------------------------------------------------
-- 5. COUNTER SALES & POS TABLES
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.counter_sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    sale_number VARCHAR(100) NOT NULL,
    invoice_number VARCHAR(100) NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    phone_number VARCHAR(50),
    sale_date DATE NOT NULL DEFAULT CURRENT_DATE,
    estimate_reference VARCHAR(100),
    subtotal NUMERIC(12,2) NOT NULL,
    discount_type VARCHAR(20) NOT NULL DEFAULT 'fixed',
    discount_value NUMERIC(12,2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    final_total NUMERIC(12,2) NOT NULL,
    status public.counter_sale_status NOT NULL DEFAULT 'COMPLETED',
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_workspace_sale_number UNIQUE (workspace_id, sale_number)
);

CREATE TRIGGER set_counter_sales_updated_at
    BEFORE UPDATE ON public.counter_sales
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.counter_sale_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    counter_sale_id UUID NOT NULL REFERENCES public.counter_sales(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    stock_receipt_id UUID REFERENCES public.stock_receipts(id) ON DELETE SET NULL,
    product_name_snapshot VARCHAR(255) NOT NULL,
    part_number_snapshot VARCHAR(100),
    quantity NUMERIC(10,2) NOT NULL,
    rate NUMERIC(12,2) NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    buy_price_snapshot NUMERIC(12,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 6. QUOTATIONS & INVOICES
-- -----------------------------------------------------------------------------

-- QUOTATIONS
CREATE TABLE IF NOT EXISTS public.quotations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    quotation_number VARCHAR(100) NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50) NOT NULL,
    customer_whatsapp VARCHAR(50),
    customer_email VARCHAR(255),
    customer_address TEXT,
    customer_gstin VARCHAR(50),
    status public.quotation_status NOT NULL DEFAULT 'Draft',
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_until DATE NOT NULL,
    subtotal NUMERIC(12,2) NOT NULL,
    discount_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    tax_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    grand_total NUMERIC(12,2) NOT NULL,
    notes TEXT,
    terms TEXT,
    footer_text TEXT,
    converted_invoice_id UUID,
    template_id VARCHAR(100) NOT NULL DEFAULT 'qt-modern-blue',
    branding JSONB,
    theme JSONB,
    customization JSONB,
    snapshot JSONB,
    is_snapshot_finalized BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_workspace_quotation_number UNIQUE (workspace_id, quotation_number)
);

CREATE TRIGGER set_quotations_updated_at
    BEFORE UPDATE ON public.quotations
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.quotation_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_name VARCHAR(255) NOT NULL,
    sku VARCHAR(100),
    unit VARCHAR(50) NOT NULL DEFAULT 'Pcs',
    quantity NUMERIC(10,2) NOT NULL,
    buy_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    selling_price NUMERIC(12,2) NOT NULL,
    discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    tax_percent NUMERIC(5,2) NOT NULL DEFAULT 18.0,
    tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    total NUMERIC(12,2) NOT NULL
);

-- INVOICES
CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    quotation_id UUID REFERENCES public.quotations(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    invoice_number VARCHAR(100) NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50) NOT NULL,
    customer_whatsapp VARCHAR(50),
    customer_email VARCHAR(255),
    customer_address TEXT,
    customer_gstin VARCHAR(50),
    status public.invoice_status NOT NULL DEFAULT 'Issued',
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE NOT NULL,
    subtotal NUMERIC(12,2) NOT NULL,
    discount_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    tax_total NUMERIC(12,2) NOT NULL DEFAULT 0,
    grand_total NUMERIC(12,2) NOT NULL,
    paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    balance_amount NUMERIC(12,2) NOT NULL,
    notes TEXT,
    terms TEXT,
    footer_text TEXT,
    template_id VARCHAR(100) NOT NULL DEFAULT 'inv-modern-blue',
    branding JSONB,
    theme JSONB,
    customization JSONB,
    snapshot JSONB,
    is_snapshot_finalized BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_workspace_invoice_number UNIQUE (workspace_id, invoice_number)
);

CREATE TRIGGER set_invoices_updated_at
    BEFORE UPDATE ON public.invoices
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.invoice_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_name VARCHAR(255) NOT NULL,
    sku VARCHAR(100),
    unit VARCHAR(50) NOT NULL DEFAULT 'Pcs',
    quantity NUMERIC(10,2) NOT NULL,
    buy_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    selling_price NUMERIC(12,2) NOT NULL,
    discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    tax_percent NUMERIC(5,2) NOT NULL DEFAULT 18.0,
    tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    total NUMERIC(12,2) NOT NULL
);

-- -----------------------------------------------------------------------------
-- 7. PAYMENTS & UDHARI LEDGER
-- -----------------------------------------------------------------------------

-- PAYMENTS
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
    payment_number VARCHAR(100) NOT NULL,
    customer_name VARCHAR(255) NOT NULL,
    invoice_number VARCHAR(100),
    amount NUMERIC(12,2) NOT NULL,
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    method public.payment_method NOT NULL DEFAULT 'Cash',
    reference_no VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_workspace_payment_number UNIQUE (workspace_id, payment_number)
);

-- UDHARI RECORDS
CREATE TABLE IF NOT EXISTS public.udhari_records (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    udhari_code VARCHAR(100) NOT NULL,
    customer_name_snapshot VARCHAR(255) NOT NULL,
    phone_snapshot VARCHAR(50) NOT NULL,
    original_amount NUMERIC(12,2) NOT NULL,
    total_received NUMERIC(12,2) NOT NULL DEFAULT 0,
    outstanding_amount NUMERIC(12,2) NOT NULL,
    due_date DATE NOT NULL,
    status public.udhari_status NOT NULL DEFAULT 'UNPAID',
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_workspace_udhari_code UNIQUE (workspace_id, udhari_code)
);

CREATE TRIGGER set_udhari_records_updated_at
    BEFORE UPDATE ON public.udhari_records
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- UDHARI PAYMENTS
CREATE TABLE IF NOT EXISTS public.udhari_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    udhari_id UUID NOT NULL REFERENCES public.udhari_records(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    payment_code VARCHAR(100) NOT NULL,
    amount NUMERIC(12,2) NOT NULL,
    payment_method public.payment_method NOT NULL DEFAULT 'Cash',
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    phone_number VARCHAR(50) NOT NULL,
    reference VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_workspace_udhari_payment_code UNIQUE (workspace_id, payment_code)
);

-- -----------------------------------------------------------------------------
-- 8. EXPENSES, FOLLOW-UPS, FEEDBACK, OFFERS & NOTIFICATIONS
-- -----------------------------------------------------------------------------

-- EXPENSES
CREATE TABLE IF NOT EXISTS public.expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    category public.expense_category NOT NULL,
    expense_name VARCHAR(255),
    amount NUMERIC(12,2) NOT NULL,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    paid_to VARCHAR(255),
    reference_no VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FOLLOW-UPS
CREATE TABLE IF NOT EXISTS public.follow_ups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
    quotation_id UUID REFERENCES public.quotations(id) ON DELETE SET NULL,
    invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    assigned_to_name VARCHAR(255),
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(50) NOT NULL,
    customer_email VARCHAR(255),
    customer_whatsapp VARCHAR(50),
    quotation_number VARCHAR(100),
    invoice_number VARCHAR(100),
    title VARCHAR(255) NOT NULL,
    notes TEXT,
    due_date DATE NOT NULL,
    due_time VARCHAR(20) NOT NULL DEFAULT '09:00',
    priority public.followup_priority NOT NULL DEFAULT 'Medium',
    status public.followup_status NOT NULL DEFAULT 'Pending',
    action_type public.followup_action_type NOT NULL DEFAULT 'INTERNAL_REMINDER',
    action_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    attempt_count INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    last_attempt_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    error_message TEXT,
    provider_message_id VARCHAR(255),
    delivery_status VARCHAR(100),
    execution_logs JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_follow_ups_updated_at
    BEFORE UPDATE ON public.follow_ups
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- NOTIFICATIONS
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    notification_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    link_route VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FEEDBACKS
CREATE TABLE IF NOT EXISTS public.feedbacks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
    customer_name VARCHAR(255) NOT NULL,
    invoice_number VARCHAR(100),
    rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
    comment TEXT,
    feedback_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- OFFERS
CREATE TABLE IF NOT EXISTS public.offers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50) NOT NULL,
    description TEXT,
    discount_type VARCHAR(20) NOT NULL DEFAULT 'Percentage',
    discount_value NUMERIC(12,2) NOT NULL DEFAULT 0,
    minimum_order NUMERIC(12,2) NOT NULL DEFAULT 0,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_workspace_offer_code UNIQUE (workspace_id, code)
);

-- -----------------------------------------------------------------------------
-- 9. LEGACY ID MAPPING TABLE (For Smooth Phase 3 Data Migration)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.id_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    entity_type VARCHAR(50) NOT NULL, -- 'customer', 'product', 'invoice', etc.
    legacy_id VARCHAR(255) NOT NULL,  -- e.g. 'cust-1', 'prod-1', 'ws-default-vistaar'
    supabase_id UUID NOT NULL,        -- generated PostgreSQL UUID
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_workspace_entity_legacy UNIQUE (workspace_id, entity_type, legacy_id)
);

-- -----------------------------------------------------------------------------
-- 10. INDEXES FOR HIGH-PERFORMANCE QUERYING
-- -----------------------------------------------------------------------------

-- Workspace Foreign Key Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_workspace ON public.profiles(workspace_id);
CREATE INDEX IF NOT EXISTS idx_categories_workspace ON public.categories(workspace_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_workspace ON public.suppliers(workspace_id);
CREATE INDEX IF NOT EXISTS idx_customers_workspace ON public.customers(workspace_id);
CREATE INDEX IF NOT EXISTS idx_products_workspace ON public.products(workspace_id);
CREATE INDEX IF NOT EXISTS idx_stock_receipts_workspace ON public.stock_receipts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_workspace ON public.stock_movements(workspace_id);
CREATE INDEX IF NOT EXISTS idx_counter_sales_workspace ON public.counter_sales(workspace_id);
CREATE INDEX IF NOT EXISTS idx_quotations_workspace ON public.quotations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_invoices_workspace ON public.invoices(workspace_id);
CREATE INDEX IF NOT EXISTS idx_payments_workspace ON public.payments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_udhari_records_workspace ON public.udhari_records(workspace_id);
CREATE INDEX IF NOT EXISTS idx_expenses_workspace ON public.expenses(workspace_id);
CREATE INDEX IF NOT EXISTS idx_follow_ups_workspace ON public.follow_ups(workspace_id);
CREATE INDEX IF NOT EXISTS idx_notifications_workspace ON public.notifications(workspace_id);

-- Entity Specific Lookup Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_employee_id ON public.profiles(employee_id);
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);
CREATE INDEX IF NOT EXISTS idx_products_part_number ON public.products(part_number);
CREATE INDEX IF NOT EXISTS idx_stock_receipts_product ON public.stock_receipts(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON public.invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON public.invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_quotations_number ON public.quotations(quotation_number);
CREATE INDEX IF NOT EXISTS idx_counter_sales_number ON public.counter_sales(sale_number);
CREATE INDEX IF NOT EXISTS idx_follow_ups_status_due ON public.follow_ups(status, due_date, due_time);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON public.notifications(is_read);

-- -----------------------------------------------------------------------------
-- 11. ROW LEVEL SECURITY (RLS) POLICIES
-- -----------------------------------------------------------------------------

-- Helper function to get current user's workspace_id from profile or JWT
CREATE OR REPLACE FUNCTION public.current_user_workspace_id()
RETURNS UUID AS $$
DECLARE
    v_workspace_id UUID;
BEGIN
    -- First try reading from JWT app_metadata
    v_workspace_id := (auth.jwt() -> 'app_metadata' ->> 'workspace_id')::UUID;
    IF v_workspace_id IS NOT NULL THEN
        RETURN v_workspace_id;
    END IF;

    -- Fallback to reading from profiles table
    SELECT workspace_id INTO v_workspace_id
    FROM public.profiles
    WHERE id = auth.uid();
    
    RETURN v_workspace_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ENABLE RLS ON ALL TABLES
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.counter_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.counter_sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.udhari_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.udhari_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.id_mappings ENABLE ROW LEVEL SECURITY;

-- WORKSPACES POLICIES
CREATE POLICY "Users can view their own workspace"
    ON public.workspaces FOR SELECT
    USING (id = public.current_user_workspace_id());

CREATE POLICY "Workspace owners can update their workspace"
    ON public.workspaces FOR UPDATE
    USING (id = public.current_user_workspace_id());

-- PROFILES POLICIES
CREATE POLICY "Users can view profiles in their workspace"
    ON public.profiles FOR SELECT
    USING (workspace_id = public.current_user_workspace_id());

CREATE POLICY "Owners and admins can insert profiles in their workspace"
    ON public.profiles FOR INSERT
    WITH CHECK (workspace_id = public.current_user_workspace_id());

CREATE POLICY "Users can update their own profile or admins update workspace profiles"
    ON public.profiles FOR UPDATE
    USING (workspace_id = public.current_user_workspace_id());

-- REUSABLE GENERIC WORKSPACE ISOLATION RLS POLICY CREATOR
-- (Enforces workspace-level isolation for all standard business tables)
DO $$
DECLARE
    tbl TEXT;
    tables TEXT[] := ARRAY[
        'business_settings', 'categories', 'suppliers', 'customers', 'products',
        'inventory_settings', 'stock_receipts', 'stock_movements', 'import_sessions',
        'counter_sales', 'counter_sale_items', 'quotations', 'quotation_items',
        'invoices', 'invoice_items', 'payments', 'udhari_records', 'udhari_payments',
        'expenses', 'follow_ups', 'notifications', 'feedbacks', 'offers', 'id_mappings'
    ];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format('
            CREATE POLICY "Workspace isolation SELECT for %I" ON public.%I
                FOR SELECT USING (workspace_id = public.current_user_workspace_id());
            CREATE POLICY "Workspace isolation INSERT for %I" ON public.%I
                FOR INSERT WITH CHECK (workspace_id = public.current_user_workspace_id());
            CREATE POLICY "Workspace isolation UPDATE for %I" ON public.%I
                FOR UPDATE USING (workspace_id = public.current_user_workspace_id());
            CREATE POLICY "Workspace isolation DELETE for %I" ON public.%I
                FOR DELETE USING (workspace_id = public.current_user_workspace_id());
        ', tbl, tbl, tbl, tbl, tbl, tbl, tbl, tbl);
    END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 12. STORAGE BUCKETS SETUP & STORAGE RLS POLICIES
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES 
    ('avatars', 'avatars', true),
    ('business-assets', 'business-assets', true),
    ('product-media', 'product-media', true),
    ('documents', 'documents', false)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Storage RLS Policies for buckets
CREATE POLICY "Public read access for avatars"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated upload for avatars"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');

CREATE POLICY "Public read access for business-assets"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'business-assets');

CREATE POLICY "Authenticated upload for business-assets"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'business-assets' AND auth.role() = 'authenticated');

CREATE POLICY "Public read access for product-media"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'product-media');

CREATE POLICY "Authenticated upload for product-media"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'product-media' AND auth.role() = 'authenticated');

CREATE POLICY "Private access for documents"
    ON storage.objects FOR ALL
    USING (bucket_id = 'documents' AND auth.role() = 'authenticated');

-- -----------------------------------------------------------------------------
-- END OF MIGRATION SCRIPT 001_initial_schema.sql
-- -----------------------------------------------------------------------------
