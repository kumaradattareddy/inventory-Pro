-- ATOMIC, LOCKED "NEXT BILL NUMBER" FOR THE DESKTOP APPROVAL FLOW
--
-- Replaces the old JS retry-loop in /api/sales/approve/route.ts that computed
-- the "next" bill number by sorting bill_no as TEXT (not a number) and, when
-- that lookup came up empty, fell back to "<guess>-<random 0-99>" (this is
-- literally how "7428-32" got created).
--
-- This function:
--   1. Takes the SAME advisory lock key the mobile app's create_new_sale RPC
--      uses (12345, _year), so desktop approvals and mobile bill creation
--      can never race each other for the same number.
--   2. Computes the max the SAFE way: only counting strings that are purely
--      digits (or "YYYY/nnnn"), everything else is ignored rather than
--      mis-parsed.
--   3. Does NOT insert a row (unlike create_new_sale) — it just returns the
--      next free number for the caller to use on the approval row that
--      already exists.
--
-- Run this once in the Supabase SQL Editor.

CREATE OR REPLACE FUNCTION public.get_next_available_bill_no(_year int)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    max_bill_num bigint;
BEGIN
    -- Same lock key as create_new_sale() — serializes against mobile bill creation too.
    PERFORM pg_advisory_xact_lock(12345, _year);

    SELECT GREATEST(
        COALESCE((
            SELECT MAX(
                CASE
                    WHEN bill_no ~ '^[0-9]+$' THEN bill_no::bigint
                    WHEN bill_no ~ '^[0-9]+/[0-9]+$' THEN split_part(bill_no, '/', 2)::bigint
                    ELSE NULL
                END
            )
            FROM sales_approvals
            WHERE bill_no IS NOT NULL
        ), 0),
        COALESCE((
            SELECT MAX(
                CASE
                    WHEN bill_no ~ '^[0-9]+$' THEN bill_no::bigint
                    WHEN bill_no ~ '^[0-9]+/[0-9]+$' THEN split_part(bill_no, '/', 2)::bigint
                    ELSE NULL
                END
            )
            FROM stock_moves
            WHERE bill_no IS NOT NULL
        ), 0)
    )
    INTO max_bill_num;

    RETURN (max_bill_num + 1)::text;
END;
$$;

-- Allow the app (using the anon/service role via PostgREST) to call it.
GRANT EXECUTE ON FUNCTION public.get_next_available_bill_no(int) TO authenticated, anon, service_role;
