import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

type Payment = Database["public"]["Tables"]["payments"]["Insert"];
type StockMove = Database["public"]["Tables"]["stock_moves"]["Insert"];

export async function POST(req: Request) {
  const supabase = createClient();
  const body = await req.json();

  const { billNo, billDate, customerName, rows, customerPayment, payouts } = body;

  if (!billNo || !customerName) {
    return NextResponse.json({ error: "Bill Number and Customer Name are required." }, { status: 400 });
  }

  // ✅ --- START OF FIX ---
  // If billDate is provided, use it. Otherwise, default to the current time.
  // This ensures the timestamp is consistent with the selected date on the form.
  const transactionTimestamp = billDate ? new Date(billDate).toISOString() : new Date().toISOString();
  // ✅ --- END OF FIX ---

  // 1. Find or create the customer
  let { data: customer, error: customerError } = await supabase.from("customers").select("id").eq("name", customerName).maybeSingle();

  if (customerError) return NextResponse.json({ error: `Customer lookup failed: ${customerError.message}` }, { status: 500 });

  if (!customer) {
    const { data: newCust, error: insertErr } = await supabase.from("customers").insert({ name: customerName }).select("id").single();
    if (insertErr) return NextResponse.json({ error: `Failed to create customer: ${insertErr.message}` }, { status: 500 });
    customer = newCust;
  }

  // 2. Insert sale items (stock_moves)
  const stockMovesToInsert: StockMove[] = rows
    .filter((row: any) => row.product_id && row.qty > 0 && row.rate > 0)
    .map((row: any) => ({
      ts: transactionTimestamp, // ✅ Use the corrected timestamp
      kind: "sale",
      customer_id: customer!.id,
      bill_no: billNo,
      bill_date: billDate,
      product_id: row.product_id,
      qty: row.qty,
      price_per_unit: row.rate,
    }));

  if (stockMovesToInsert.length > 0) {
    const { error: smError } = await supabase.from("stock_moves").insert(stockMovesToInsert);
    if (smError) return NextResponse.json({ error: `Failed to save sale items: ${smError.message}` }, { status: 500 });
  }

  // 3. Prepare all payment and payout records
  const paymentsToInsert: Payment[] = [];
  const totalCustomerPayment = (customerPayment.advance || 0) + (customerPayment.paidNow || 0);

  if (totalCustomerPayment > 0) {
    paymentsToInsert.push({
      ts: transactionTimestamp, // ✅ Use the corrected timestamp
      customer_id: customer.id,
      party_type: 'customer',
      direction: 'in',
      amount: totalCustomerPayment,
      method: customerPayment.method.toLowerCase(),
      bill_no: billNo,
    });
  }

  if (payouts && payouts.length > 0) {
    const validPayouts = payouts.filter((p: any) => p.amount > 0 && p.recipientName.trim());
    for (const payout of validPayouts) {
      paymentsToInsert.push({
        ts: transactionTimestamp, // ✅ Use the corrected timestamp
        other_name: payout.recipientName,
        party_type: 'others',
        direction: 'out',
        amount: payout.amount,
        method: payout.method.toLowerCase(),
        bill_no: billNo,
      });
    }
  }

  // 4. Insert all payment/payout records
  if (paymentsToInsert.length > 0) {
    const { error: payError } = await supabase.from("payments").insert(paymentsToInsert);
    if (payError) return NextResponse.json({ error: `Sale items saved, but payments failed: ${payError.message}` }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: "Sale and all associated payments recorded successfully." });
}

