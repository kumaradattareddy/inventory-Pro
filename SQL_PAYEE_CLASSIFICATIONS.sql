-- Run this SQL once in your Supabase SQL Editor.
--
-- Tells the Profit & Loss statement how to treat money paid out to "others"
-- (bill payouts). Many payouts are not expenses — e.g. depositing customer
-- money into the shop's own bank account, or paying a supplier.
--
--   treatment = 'expense'   -> counted as an expense (category = expense group, e.g. Hamali)
--   treatment = 'transfer'  -> moved to own bank / cash account; NOT in P&L
--   treatment = 'supplier'  -> payment to a supplier; NOT in P&L (goods cost is already in COGS)
--   treatment = 'drawings'  -> owner's personal withdrawal; shown below Net Profit, not an expense
--
-- payee is stored lower-case and trimmed.

create table if not exists public.payee_classifications (
  payee text not null,
  treatment text not null default 'expense',
  category text null,
  updated_at timestamp with time zone not null default now(),
  constraint payee_classifications_pkey primary key (payee),
  constraint payee_classifications_treatment_check check (
    treatment = any (array['expense', 'transfer', 'supplier', 'drawings'])
  )
);
