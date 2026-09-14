-- HARDEN create_new_sale() — THE FUNCTION THAT PRODUCED 742833
--
-- The phone app's create_new_sale() computes the next bill number as
-- MAX(bill_no)+1, but for any bill_no that isn't a clean number it does:
--
--     regexp_replace(bill_no, '\D', '', 'g')::bigint
--
-- i.e. it deletes every non-digit character and casts what's left, instead
-- of ignoring the value. That's exactly how a malformed bill number became
-- "742832" and every bill after it inherited that poisoned baseline
-- (742833, 742834, ...).
--
-- Fix: only treat a bill_no as countable if it's ALREADY a clean number (or
-- "YYYY/nnnn"). Anything else is ignored, not mangled. No other behavior
-- changes — same lock, same insert.
--
-- Run this once in the Supabase SQL Editor.

CREATE OR REPLACE FUNCTION public.create_new_sale(
    _year int,
    _sale_data jsonb,
    _customer_name text,
    _executive text,
    _total_amount numeric,
    _bill_date date
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    max_bill_num bigint;
    new_bill_num bigint;
    new_bill_str text;
    new_sale_id bigint;
BEGIN
    PERFORM pg_advisory_xact_lock(12345, _year);

    SELECT COALESCE(MAX(
        CASE
            WHEN bill_no ~ '^[0-9]+/[0-9]+$' THEN split_part(bill_no, '/', 2)::bigint
            WHEN bill_no ~ '^[0-9]+$' THEN bill_no::bigint
            ELSE NULL  -- garbage / "PENDING" / "7428-32" / etc. — ignored, not mangled
        END
    ), 0)
    INTO max_bill_num
    FROM sales_approvals
    WHERE bill_no IS NOT NULL AND bill_no != '';

    new_bill_num := max_bill_num + 1;
    new_bill_str := new_bill_num::text;

    INSERT INTO public.sales_approvals (bill_no, status, customer_name, executive, total_amount, bill_date, sale_data, created_at)
    VALUES (new_bill_str, 'pending', _customer_name, _executive, _total_amount, _bill_date, _sale_data, now())
    RETURNING id INTO new_sale_id;

    RETURN json_build_object('bill_no', new_bill_str, 'id', new_sale_id);
END;
$$;

-- Same fix for the legacy bridge function (kept for old app versions per SQL_MASTER_FIX.sql).
CREATE OR REPLACE FUNCTION public.get_next_bill_no(
    _year int
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    max_bill_num bigint;
    new_bill_num bigint;
    new_bill_str text;
    new_reservation_id bigint;
BEGIN
    PERFORM pg_advisory_xact_lock(12345, _year);

    SELECT COALESCE(MAX(
        CASE
            WHEN bill_no ~ '^[0-9]+/[0-9]+$' THEN split_part(bill_no, '/', 2)::bigint
            WHEN bill_no ~ '^[0-9]+$' THEN bill_no::bigint
            ELSE NULL
        END
    ), 0)
    INTO max_bill_num
    FROM sales_approvals
    WHERE bill_no IS NOT NULL AND bill_no != '';

    new_bill_num := max_bill_num + 1;
    new_bill_str := new_bill_num::text;

    INSERT INTO public.sales_approvals (bill_no, status, created_at, sale_data)
    VALUES (new_bill_str, 'draft', now(), '{}'::jsonb)
    RETURNING id INTO new_reservation_id;

    RETURN json_build_object(
        'bill_no', new_bill_str,
        'reservation_id', new_reservation_id
    );
END;
$$;
