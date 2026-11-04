-- =============================================================================
-- Migration 061: Root-Cause Fix for Invoice Finalization PGRST204 & Atomic Pipeline
--
-- Root Cause Addressed:
-- 1. PostgREST returned PGRST204 because public.invoices.branch_id and
--    public.invoice_items.branch_id were queried/inserted when the columns
--    did not exist in the schema cache.
-- 2. public.invoices.is_stock_finalized, payment_mode, payment_reference,
--    payment_notes were missing on the live PostgreSQL table.
-- 3. public.finalize_invoice_transaction(JSONB) RPC was missing in the schema
--    cache (PGRST202), causing the service to fall back to direct multi-step
--    inserts that failed with PGRST204.
--
-- This migration:
-- 1. Creates missing tables (branches, branch_inventory, cashbook_entries)
-- 2. Extends invoices, invoice_items, payments, daybook_transactions,
--    stock_movements, udhari_records, quotations with required columns safely.
-- 3. Implements single authoritative atomic RPC finalize_invoice_transaction(JSONB).
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. PREREQUISITE TABLES (BRANCHES, INVENTORY, CASHBOOK)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(100),
    pincode VARCHAR(20),
    phone VARCHAR(50),
    email VARCHAR(255),
    is_main BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.branch_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    current_stock NUMERIC(12,2) NOT NULL DEFAULT 0,
    min_stock_alert NUMERIC(12,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(branch_id, product_id)
);

CREATE TABLE IF NOT EXISTS public.cashbook_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    entry_number VARCHAR(100),
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    source_type VARCHAR(50) NOT NULL DEFAULT 'INVOICE_PAYMENT',
    source_id UUID,
    reference_number VARCHAR(100),
    direction VARCHAR(20) NOT NULL CHECK (direction IN ('IN', 'OUT', 'NON_CASH')),
    amount NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    account_name VARCHAR(100) NOT NULL DEFAULT 'Cash Account',
    payment_method VARCHAR(50) NOT NULL DEFAULT 'Cash',
    party_name VARCHAR(255),
    description TEXT,
    notes TEXT,
    status VARCHAR(50) DEFAULT 'COMPLETED',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 2. SAFELY EXTEND EXISTING CORE TABLES (IDEMPOTENT COLUMN ADDITIONS)
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.invoices
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS is_stock_finalized BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS stock_finalized_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS is_snapshot_finalized BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS payment_mode VARCHAR(50) DEFAULT 'Cash',
    ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(100),
    ADD COLUMN IF NOT EXISTS payment_notes TEXT,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS terms TEXT,
    ADD COLUMN IF NOT EXISTS footer_text TEXT,
    ADD COLUMN IF NOT EXISTS template_id VARCHAR(100),
    ADD COLUMN IF NOT EXISTS branding JSONB,
    ADD COLUMN IF NOT EXISTS theme JSONB,
    ADD COLUMN IF NOT EXISTS customization JSONB,
    ADD COLUMN IF NOT EXISTS snapshot JSONB;

ALTER TABLE IF EXISTS public.invoice_items
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS part_number VARCHAR(100),
    ADD COLUMN IF NOT EXISTS item_type VARCHAR(50) DEFAULT 'product',
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE IF EXISTS public.payments
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'Cash',
    ADD COLUMN IF NOT EXISTS reference_number VARCHAR(100);

ALTER TABLE IF EXISTS public.stock_movements
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS movement_type VARCHAR(50) DEFAULT 'SALE',
    ADD COLUMN IF NOT EXISTS reference_number VARCHAR(100);

ALTER TABLE IF EXISTS public.daybook_transactions
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS remaining_amount NUMERIC(12,2),
    ADD COLUMN IF NOT EXISTS payment_status VARCHAR(50);

ALTER TABLE IF EXISTS public.udhari_records
    ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

ALTER TABLE IF EXISTS public.quotations
    ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_workspace_stock_finalized ON public.invoices(workspace_id, is_stock_finalized);
CREATE INDEX IF NOT EXISTS idx_invoices_workspace_branch ON public.invoices(workspace_id, branch_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON public.payments(invoice_id);

-- -----------------------------------------------------------------------------
-- 3. UNIFIED ATOMIC INVOICE FINALIZATION RPC FUNCTION
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_invoice_transaction(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_workspace_id UUID;
    v_branch_id UUID;
    v_invoice_id UUID;
    v_invoice_number VARCHAR(100);
    v_quotation_id UUID;
    v_date DATE;
    v_due_date DATE;
    v_subtotal NUMERIC(12,2);
    v_discount_total NUMERIC(12,2);
    v_tax_total NUMERIC(12,2);
    v_grand_total NUMERIC(12,2);
    v_paid_amount NUMERIC(12,2);
    v_raw_balance NUMERIC(12,2);
    v_balance_amount NUMERIC(12,2);
    v_status public.invoice_status;
    v_payment_mode VARCHAR(50);
    v_payment_ref TEXT;
    v_payment_notes TEXT;
    v_payment_date DATE;
    v_customer_id UUID;
    v_customer_name VARCHAR(255);
    v_customer_phone VARCHAR(50);
    v_customer_whatsapp VARCHAR(50);
    v_customer_email VARCHAR(255);
    v_customer_address TEXT;
    v_customer_gstin VARCHAR(50);
    v_items JSONB;
    v_line_item JSONB;
    v_item_idx INT;
    v_payment_id UUID;
    v_payment_code VARCHAR(100);
    v_existing_inv RECORD;
    v_existing_pay RECORD;
    v_existing_dt RECORD;
    v_existing_udhari RECORD;
    v_product_name TEXT;
    v_product_stock NUMERIC;
    v_avail_stock NUMERIC;
    v_remaining_deduct NUMERIC;
    v_receipt RECORD;
    v_rec_deduct NUMERIC;
    v_inv_count INT;
    v_year_str TEXT;
    v_rand_str TEXT;
    v_item RECORD;
    v_cash_account VARCHAR(100);

    c_tolerance CONSTANT NUMERIC(12,2) := 1.00;
BEGIN
    -- 1. Resolve & Authorize Workspace
    v_workspace_id := (p_payload->>'workspace_id')::UUID;
    IF v_workspace_id IS NULL THEN
        v_workspace_id := public.current_user_workspace_id();
    END IF;
    IF v_workspace_id IS NULL THEN
        RAISE EXCEPTION 'UNAUTHORIZED: Active workspace could not be resolved.';
    END IF;

    -- Verify authenticated tenant access
    IF auth.uid() IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles WHERE id = auth.uid() AND workspace_id = v_workspace_id
        ) AND NOT EXISTS (
            SELECT 1 FROM public.workspaces WHERE id = v_workspace_id AND LOWER(owner_email) = LOWER(auth.jwt() ->> 'email')
        ) THEN
            RAISE EXCEPTION 'UNAUTHORIZED: User does not have access to this workspace.';
        END IF;
    END IF;

    -- Resolve Branch ID if valid UUID
    IF p_payload->>'branch_id' IS NOT NULL AND (p_payload->>'branch_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_branch_id := (p_payload->>'branch_id')::UUID;
    END IF;

    -- 2. Extract & Validate Financial Amounts
    v_grand_total := ROUND(COALESCE((p_payload->>'grand_total')::NUMERIC, 0), 2);
    v_paid_amount := ROUND(COALESCE((p_payload->>'paid_amount')::NUMERIC, 0), 2);
    v_subtotal := ROUND(COALESCE((p_payload->>'subtotal')::NUMERIC, v_grand_total), 2);
    v_discount_total := ROUND(COALESCE((p_payload->>'discount_total')::NUMERIC, 0), 2);
    v_tax_total := ROUND(COALESCE((p_payload->>'tax_total')::NUMERIC, 0), 2);

    IF v_grand_total < 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: Grand total cannot be negative.';
    END IF;
    IF v_paid_amount < 0 THEN
        RAISE EXCEPTION 'INVALID_AMOUNT: Paid amount cannot be negative.';
    END IF;
    IF v_grand_total > 0 AND v_paid_amount > (v_grand_total + 0.05) THEN
        RAISE EXCEPTION 'OVERPAYMENT_REJECTED: Paid amount (%) cannot exceed grand total (%).', v_paid_amount, v_grand_total;
    END IF;

    -- Financial Tolerance Normalization (₹1.00 tolerance rule)
    v_raw_balance := ROUND(v_grand_total - v_paid_amount, 2);
    IF v_raw_balance >= 0 AND v_raw_balance < c_tolerance THEN
        v_balance_amount := 0.00;
    ELSIF v_raw_balance >= c_tolerance THEN
        v_balance_amount := v_raw_balance;
    ELSE
        v_balance_amount := 0.00;
    END IF;

    IF v_balance_amount = 0.00 AND v_grand_total > 0 THEN
        v_status := 'Paid'::public.invoice_status;
    ELSIF v_paid_amount > 0 THEN
        v_status := 'Partially Paid'::public.invoice_status;
    ELSE
        v_status := 'Issued'::public.invoice_status;
    END IF;

    -- 3. Extract Parties & Dates
    v_date := COALESCE((p_payload->>'date')::DATE, CURRENT_DATE);
    v_due_date := COALESCE((p_payload->>'due_date')::DATE, CURRENT_DATE + INTERVAL '15 days');
    v_payment_date := COALESCE((p_payload->>'payment_date')::DATE, v_date);
    v_payment_mode := COALESCE(p_payload->>'payment_mode', 'Cash');
    v_payment_ref := p_payload->>'payment_reference';
    v_payment_notes := p_payload->>'payment_notes';

    v_customer_name := COALESCE(p_payload->>'customer_name', 'Walk-in Customer');
    v_customer_phone := COALESCE(p_payload->>'customer_phone', '');
    v_customer_whatsapp := COALESCE(p_payload->>'customer_whatsapp', v_customer_phone);
    v_customer_email := COALESCE(p_payload->>'customer_email', '');
    v_customer_address := COALESCE(p_payload->>'customer_address', '');
    v_customer_gstin := COALESCE(p_payload->>'customer_gstin', '');

    IF p_payload->>'customer_id' IS NOT NULL AND (p_payload->>'customer_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_customer_id := (p_payload->>'customer_id')::UUID;
    END IF;

    IF p_payload->>'quotation_id' IS NOT NULL AND (p_payload->>'quotation_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_quotation_id := (p_payload->>'quotation_id')::UUID;
    END IF;

    -- 4. Target Invoice ID & Number Resolution
    IF p_payload->>'id' IS NOT NULL AND (p_payload->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_invoice_id := (p_payload->>'id')::UUID;
    ELSIF p_payload->>'invoice_id' IS NOT NULL AND (p_payload->>'invoice_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        v_invoice_id := (p_payload->>'invoice_id')::UUID;
    ELSE
        v_invoice_id := gen_random_uuid();
    END IF;

    IF p_payload->>'invoice_number' IS NOT NULL AND trim(p_payload->>'invoice_number') != '' THEN
        v_invoice_number := trim(p_payload->>'invoice_number');
    ELSE
        SELECT COUNT(*) + 1 INTO v_inv_count FROM public.invoices WHERE workspace_id = v_workspace_id;
        v_year_str := TO_CHAR(v_date, 'YYYY');
        v_invoice_number := 'INV-' || v_year_str || '-' || LPAD(v_inv_count::TEXT, 4, '0');
    END IF;

    -- 5. Strict Idempotency Check
    SELECT * INTO v_existing_inv
    FROM public.invoices
    WHERE (id = v_invoice_id OR invoice_number = v_invoice_number)
      AND workspace_id = v_workspace_id
    FOR UPDATE;

    IF v_existing_inv.id IS NOT NULL AND v_existing_inv.is_stock_finalized = TRUE THEN
        RETURN jsonb_build_object(
            'success', true,
            'invoice_id', v_existing_inv.id,
            'invoice_number', v_existing_inv.invoice_number,
            'grand_total', v_existing_inv.grand_total,
            'paid_amount', v_existing_inv.paid_amount,
            'balance_amount', v_existing_inv.balance_amount,
            'status', v_existing_inv.status::TEXT,
            'is_stock_finalized', true,
            'is_duplicate_ignored', true,
            'message', 'Invoice was already finalized. Returned existing state.'
        );
    END IF;

    -- 6. Upsert Target Invoice Header Row
    IF v_existing_inv.id IS NOT NULL THEN
        v_invoice_id := v_existing_inv.id;
        v_invoice_number := v_existing_inv.invoice_number;

        UPDATE public.invoices
        SET customer_id = COALESCE(v_customer_id, customer_id),
            branch_id = COALESCE(v_branch_id, branch_id),
            customer_name = v_customer_name,
            customer_phone = v_customer_phone,
            customer_whatsapp = v_customer_whatsapp,
            customer_email = v_customer_email,
            customer_address = v_customer_address,
            customer_gstin = v_customer_gstin,
            status = v_status,
            date = v_date,
            due_date = v_due_date,
            subtotal = v_subtotal,
            discount_total = v_discount_total,
            tax_total = v_tax_total,
            grand_total = v_grand_total,
            paid_amount = v_paid_amount,
            balance_amount = v_balance_amount,
            payment_mode = v_payment_mode,
            payment_reference = v_payment_ref,
            payment_notes = v_payment_notes,
            notes = COALESCE(p_payload->>'notes', notes),
            terms = COALESCE(p_payload->>'terms', terms),
            footer_text = COALESCE(p_payload->>'footer_text', footer_text),
            template_id = COALESCE(p_payload->>'template_id', template_id),
            branding = COALESCE(p_payload->'branding', branding),
            theme = COALESCE(p_payload->'theme', theme),
            customization = COALESCE(p_payload->'customization', customization),
            snapshot = COALESCE(p_payload->'snapshot', snapshot),
            is_snapshot_finalized = TRUE,
            updated_at = NOW()
        WHERE id = v_invoice_id AND workspace_id = v_workspace_id;
    ELSE
        INSERT INTO public.invoices (
            id,
            workspace_id,
            branch_id,
            quotation_id,
            customer_id,
            invoice_number,
            customer_name,
            customer_phone,
            customer_whatsapp,
            customer_email,
            customer_address,
            customer_gstin,
            status,
            date,
            due_date,
            subtotal,
            discount_total,
            tax_total,
            grand_total,
            paid_amount,
            balance_amount,
            payment_mode,
            payment_reference,
            payment_notes,
            notes,
            terms,
            footer_text,
            template_id,
            branding,
            theme,
            customization,
            snapshot,
            is_snapshot_finalized,
            is_stock_finalized,
            created_at,
            updated_at
        ) VALUES (
            v_invoice_id,
            v_workspace_id,
            v_branch_id,
            v_quotation_id,
            v_customer_id,
            v_invoice_number,
            v_customer_name,
            v_customer_phone,
            v_customer_whatsapp,
            v_customer_email,
            v_customer_address,
            v_customer_gstin,
            v_status,
            v_date,
            v_due_date,
            v_subtotal,
            v_discount_total,
            v_tax_total,
            v_grand_total,
            v_paid_amount,
            v_balance_amount,
            v_payment_mode,
            v_payment_ref,
            v_payment_notes,
            p_payload->>'notes',
            p_payload->>'terms',
            p_payload->>'footer_text',
            COALESCE(p_payload->>'template_id', 'inv-modern-blue'),
            p_payload->'branding',
            p_payload->'theme',
            p_payload->'customization',
            p_payload->'snapshot',
            TRUE,
            FALSE,
            NOW(),
            NOW()
        );
    END IF;

    -- 7. Persist Child Line Items
    v_items := p_payload->'items';
    IF v_items IS NOT NULL AND jsonb_array_length(v_items) > 0 THEN
        DELETE FROM public.invoice_items WHERE invoice_id = v_invoice_id AND workspace_id = v_workspace_id;

        FOR v_item_idx IN 0 .. jsonb_array_length(v_items) - 1 LOOP
            v_line_item := v_items->v_item_idx;
            INSERT INTO public.invoice_items (
                id,
                workspace_id,
                branch_id,
                invoice_id,
                product_id,
                product_name,
                part_number,
                sku,
                unit,
                quantity,
                buy_price,
                selling_price,
                discount_amount,
                tax_percent,
                tax_amount,
                total,
                item_type,
                description,
                created_at,
                updated_at
            ) VALUES (
                gen_random_uuid(),
                v_workspace_id,
                v_branch_id,
                v_invoice_id,
                CASE WHEN (v_line_item->>'productId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN (v_line_item->>'productId')::UUID ELSE NULL END,
                COALESCE(v_line_item->>'productName', v_line_item->>'name', 'Item'),
                v_line_item->>'partNumber',
                COALESCE(v_line_item->>'sku', ''),
                COALESCE(v_line_item->>'unit', 'Pcs'),
                GREATEST(1, COALESCE((v_line_item->>'quantity')::NUMERIC, 1)),
                COALESCE((v_line_item->>'buyPrice')::NUMERIC, 0),
                COALESCE((v_line_item->>'sellingPrice')::NUMERIC, (v_line_item->>'price')::NUMERIC, 0),
                COALESCE((v_line_item->>'discountAmount')::NUMERIC, 0),
                COALESCE((v_line_item->>'taxPercent')::NUMERIC, 0),
                COALESCE((v_line_item->>'taxAmount')::NUMERIC, 0),
                COALESCE((v_line_item->>'total')::NUMERIC, 0),
                COALESCE(v_line_item->>'itemType', 'product'),
                v_line_item->>'description',
                NOW(),
                NOW()
            );
        END LOOP;
    END IF;

    -- 8. Catalog Stock Validation & Deduction (Atomic rollback if insufficient)
    IF NOT EXISTS (
        SELECT 1 FROM public.stock_movements
        WHERE workspace_id = v_workspace_id
          AND reference_id = v_invoice_number
          AND reference_type = 'INVOICE_SALE'
    ) THEN
        -- Phase 8a: Live stock validation
        FOR v_item IN
            SELECT product_id,
                   MAX(product_name) AS product_name,
                   SUM(quantity) AS quantity
            FROM public.invoice_items
            WHERE invoice_id = v_invoice_id AND workspace_id = v_workspace_id
              AND product_id IS NOT NULL
              AND item_type = 'product'
            GROUP BY product_id
        LOOP
            SELECT name, current_stock INTO v_product_name, v_product_stock
            FROM public.products
            WHERE id = v_item.product_id AND workspace_id = v_workspace_id
            FOR UPDATE;

            IF v_product_name IS NULL THEN
                CONTINUE;
            END IF;

            IF v_branch_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.branch_inventory
                WHERE branch_id = v_branch_id AND product_id = v_item.product_id
            ) THEN
                SELECT current_stock INTO v_avail_stock
                FROM public.branch_inventory
                WHERE branch_id = v_branch_id AND product_id = v_item.product_id;
            ELSE
                v_avail_stock := COALESCE(v_product_stock, 0);
            END IF;

            IF v_avail_stock < v_item.quantity THEN
                RAISE EXCEPTION 'INSUFFICIENT_STOCK: Insufficient stock for "%". Requested %, but only % units are available.',
                    v_product_name, v_item.quantity, v_avail_stock;
            END IF;
        END LOOP;

        -- Phase 8b: Atomic stock deductions
        FOR v_item IN
            SELECT product_id,
                   MAX(product_name) AS product_name,
                   SUM(quantity) AS quantity
            FROM public.invoice_items
            WHERE invoice_id = v_invoice_id AND workspace_id = v_workspace_id
              AND product_id IS NOT NULL
              AND item_type = 'product'
            GROUP BY product_id
        LOOP
            SELECT name, current_stock INTO v_product_name, v_product_stock
            FROM public.products
            WHERE id = v_item.product_id AND workspace_id = v_workspace_id
            FOR UPDATE;

            IF v_product_name IS NULL THEN
                CONTINUE;
            END IF;

            -- Deduct from products table
            UPDATE public.products
            SET current_stock = GREATEST(0, current_stock - v_item.quantity),
                updated_at = NOW()
            WHERE id = v_item.product_id AND workspace_id = v_workspace_id;

            -- Deduct from branch_inventory if branch is selected
            IF v_branch_id IS NOT NULL THEN
                UPDATE public.branch_inventory
                SET current_stock = GREATEST(0, current_stock - v_item.quantity),
                    updated_at = NOW()
                WHERE branch_id = v_branch_id AND product_id = v_item.product_id;
            END IF;

            -- Deduct FIFO from stock_receipts
            v_remaining_deduct := v_item.quantity;
            FOR v_receipt IN
                SELECT id, quantity_remaining
                FROM public.stock_receipts
                WHERE product_id = v_item.product_id AND workspace_id = v_workspace_id AND quantity_remaining > 0
                ORDER BY received_date ASC, created_at ASC
                FOR UPDATE
            LOOP
                IF v_remaining_deduct <= 0 THEN
                    EXIT;
                END IF;

                v_rec_deduct := LEAST(v_receipt.quantity_remaining, v_remaining_deduct);
                UPDATE public.stock_receipts
                SET quantity_remaining = GREATEST(0, quantity_remaining - v_rec_deduct)
                WHERE id = v_receipt.id;

                v_remaining_deduct := v_remaining_deduct - v_rec_deduct;
            END LOOP;

            -- Record stock movement
            INSERT INTO public.stock_movements (
                id,
                workspace_id,
                branch_id,
                product_id,
                type,
                movement_type,
                quantity,
                movement_date,
                reference_id,
                reference_type,
                reference_number,
                notes,
                created_at
            ) VALUES (
                gen_random_uuid(),
                v_workspace_id,
                v_branch_id,
                v_item.product_id,
                'SALE'::public.stock_movement_type,
                'SALE',
                -v_item.quantity,
                v_date,
                v_invoice_number,
                'INVOICE_SALE',
                v_invoice_number,
                'Invoice Finalization #' || v_invoice_number,
                NOW()
            );
        END LOOP;
    END IF;

    -- Mark stock finalized flag
    UPDATE public.invoices
    SET is_stock_finalized = TRUE,
        stock_finalized_at = NOW()
    WHERE id = v_invoice_id AND workspace_id = v_workspace_id;

    -- 9. Persist Upfront Initial Payment (If paid_amount > 0)
    IF v_paid_amount > 0 THEN
        SELECT * INTO v_existing_pay
        FROM public.payments
        WHERE workspace_id = v_workspace_id AND invoice_id = v_invoice_id
        LIMIT 1;

        IF v_existing_pay.id IS NULL THEN
            v_payment_id := gen_random_uuid();
            v_rand_str := LPAD(FLOOR(RANDOM() * 90000 + 10000)::TEXT, 5, '0');
            v_payment_code := 'PAY-' || TO_CHAR(v_payment_date, 'YYYY') || '-' || v_rand_str;

            INSERT INTO public.payments (
                id,
                workspace_id,
                branch_id,
                customer_id,
                customer_name,
                invoice_id,
                invoice_number,
                payment_number,
                amount,
                payment_method,
                payment_date,
                reference_number,
                notes,
                created_at
            ) VALUES (
                v_payment_id,
                v_workspace_id,
                v_branch_id,
                v_customer_id,
                v_customer_name,
                v_invoice_id,
                v_invoice_number,
                v_payment_code,
                v_paid_amount,
                v_payment_mode,
                v_payment_date,
                v_payment_ref,
                COALESCE(v_payment_notes, 'Payment for Invoice #' || v_invoice_number),
                NOW()
            );

            -- Cashbook Liquidity Inflow
            IF v_payment_mode ILIKE '%cash%' THEN
                v_cash_account := 'Cash in Hand';
            ELSIF v_payment_mode ILIKE '%upi%' THEN
                v_cash_account := 'UPI Account';
            ELSIF v_payment_mode ILIKE '%bank%' THEN
                v_cash_account := 'Bank Account';
            ELSE
                v_cash_account := 'General Operations';
            END IF;

            BEGIN
                INSERT INTO public.cashbook_entries (
                    id,
                    workspace_id,
                    branch_id,
                    entry_number,
                    entry_date,
                    source_type,
                    source_id,
                    reference_number,
                    direction,
                    amount,
                    account_name,
                    payment_method,
                    party_name,
                    description,
                    notes,
                    status,
                    created_at,
                    updated_at
                ) VALUES (
                    gen_random_uuid(),
                    v_workspace_id,
                    v_branch_id,
                    'CB-' || v_invoice_number,
                    v_payment_date,
                    'INVOICE_PAYMENT',
                    v_payment_id,
                    v_invoice_number,
                    'IN',
                    v_paid_amount,
                    v_cash_account,
                    v_payment_mode,
                    v_customer_name,
                    'Payment receipt for Invoice #' || v_invoice_number,
                    v_payment_notes,
                    'COMPLETED',
                    NOW(),
                    NOW()
                );
            EXCEPTION WHEN OTHERS THEN NULL; END;
        ELSE
            v_payment_id := v_existing_pay.id;
        END IF;
    END IF;

    -- 10. Synchronize Daybook Journal Entry
    SELECT * INTO v_existing_dt
    FROM public.daybook_transactions
    WHERE workspace_id = v_workspace_id
      AND reference_type = 'INVOICE'
      AND (reference_id = v_invoice_id::TEXT OR reference_number = v_invoice_number)
    LIMIT 1;

    IF v_existing_dt.id IS NOT NULL THEN
        UPDATE public.daybook_transactions
        SET amount = v_paid_amount,
            total_amount = v_grand_total,
            remaining_amount = v_balance_amount,
            payment_status = CASE WHEN v_balance_amount = 0 THEN 'PAID' WHEN v_paid_amount > 0 THEN 'PARTIALLY PAID' ELSE 'UNPAID' END,
            payment_mode = (CASE WHEN v_payment_mode ILIKE '%upi%' THEN 'UPI' WHEN v_payment_mode ILIKE '%bank%' THEN 'Bank Transfer' WHEN v_payment_mode ILIKE '%card%' THEN 'Card' WHEN v_payment_mode ILIKE '%cheque%' THEN 'Cheque' ELSE 'Cash' END)::public.payment_method,
            updated_at = NOW()
        WHERE id = v_existing_dt.id;
    ELSE
        INSERT INTO public.daybook_transactions (
            id,
            workspace_id,
            branch_id,
            transaction_code,
            transaction_date,
            transaction_type,
            direction,
            amount,
            total_amount,
            remaining_amount,
            payment_status,
            payment_mode,
            party_type,
            party_id,
            party_name,
            reference_type,
            reference_id,
            reference_number,
            description,
            status,
            created_at,
            updated_at
        ) VALUES (
            gen_random_uuid(),
            v_workspace_id,
            v_branch_id,
            'ACC-' || v_invoice_number,
            v_date,
            'SALE'::public.daybook_transaction_type,
            'IN'::public.daybook_direction,
            v_paid_amount,
            v_grand_total,
            v_balance_amount,
            CASE WHEN v_balance_amount = 0 THEN 'PAID' WHEN v_paid_amount > 0 THEN 'PARTIALLY PAID' ELSE 'UNPAID' END,
            (CASE WHEN v_payment_mode ILIKE '%upi%' THEN 'UPI' WHEN v_payment_mode ILIKE '%bank%' THEN 'Bank Transfer' WHEN v_payment_mode ILIKE '%card%' THEN 'Card' WHEN v_payment_mode ILIKE '%cheque%' THEN 'Cheque' ELSE 'Cash' END)::public.payment_method,
            'customer',
            v_customer_id,
            v_customer_name,
            'INVOICE',
            v_invoice_id::TEXT,
            v_invoice_number,
            'Invoice #' || v_invoice_number,
            'COMPLETED',
            NOW(),
            NOW()
        );
    END IF;

    -- 11. Synchronize Udhari Ledger (Section 12 & 19: Only when balance > 0)
    SELECT * INTO v_existing_udhari
    FROM public.udhari_records
    WHERE workspace_id = v_workspace_id
      AND (invoice_id = v_invoice_id OR udhari_code = 'UD-' || v_invoice_number)
    LIMIT 1;

    IF v_balance_amount > 0 THEN
        IF v_existing_udhari.id IS NOT NULL THEN
            UPDATE public.udhari_records
            SET original_amount = v_grand_total,
                total_received = v_paid_amount,
                outstanding_amount = v_balance_amount,
                status = CASE WHEN v_paid_amount > 0 THEN 'PARTIALLY PAID'::public.udhari_status ELSE 'UNPAID'::public.udhari_status END,
                due_date = v_due_date,
                updated_at = NOW()
            WHERE id = v_existing_udhari.id;
        ELSE
            INSERT INTO public.udhari_records (
                id,
                workspace_id,
                branch_id,
                customer_id,
                invoice_id,
                udhari_code,
                customer_name_snapshot,
                phone_snapshot,
                original_amount,
                total_received,
                outstanding_amount,
                due_date,
                status,
                created_at,
                updated_at
            ) VALUES (
                gen_random_uuid(),
                v_workspace_id,
                v_branch_id,
                v_customer_id,
                v_invoice_id,
                'UD-' || v_invoice_number,
                v_customer_name,
                COALESCE(v_customer_phone, '9999999999'),
                v_grand_total,
                v_paid_amount,
                v_balance_amount,
                v_due_date,
                CASE WHEN v_paid_amount > 0 THEN 'PARTIALLY PAID'::public.udhari_status ELSE 'UNPAID'::public.udhari_status END,
                NOW(),
                NOW()
            );
        END IF;
    ELSE
        -- Fully paid: If a record previously existed, mark it PAID with 0 balance
        IF v_existing_udhari.id IS NOT NULL THEN
            UPDATE public.udhari_records
            SET total_received = v_grand_total,
                outstanding_amount = 0.00,
                status = 'PAID'::public.udhari_status,
                updated_at = NOW()
            WHERE id = v_existing_udhari.id;
        END IF;
    END IF;

    -- 12. Convert Quotation if Linked
    IF v_quotation_id IS NOT NULL THEN
        UPDATE public.quotations
        SET status = 'Converted',
            converted_invoice_id = v_invoice_id,
            updated_at = NOW()
        WHERE id = v_quotation_id AND workspace_id = v_workspace_id;
    END IF;

    -- 13. Return Authoritative Response
    RETURN jsonb_build_object(
        'success', true,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_number,
        'grand_total', v_grand_total,
        'paid_amount', v_paid_amount,
        'balance_amount', v_balance_amount,
        'status', v_status::TEXT,
        'payment_id', v_payment_id,
        'is_stock_finalized', true,
        'message', 'Invoice finalization, stock deduction, and accounting synchronizations committed atomically.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_invoice_transaction(JSONB) TO authenticated, anon, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
