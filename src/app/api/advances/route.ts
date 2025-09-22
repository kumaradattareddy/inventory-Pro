import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

type Payment = Database["public"]["Tables"]["payments"]["Insert"];

export async function POST(req: Request) {
  const supabase = createClient();
  const body = await req.json();

  const { date, customerName, amount, method, billNo, payouts } = body;

  if (!customerName || !amount) {
    return NextResponse.json({ error: "Customer Name and Amount are required." }, { status: 400 });
  }

  const transactionTimestamp = date ? new Date(date).toISOString() : new Date().toISOString();

  // 1. Find or create the customer
  let { data: customer, error: customerError } = await supabase.from("customers").select("id").eq("name", customerName).maybeSingle();
  if (customerError) return NextResponse.json({ error: `Customer lookup failed: ${customerError.message}` }, { status: 500 });

  if (!customer) {
    const { data: newCust, error: insertErr } = await supabase.from("customers").insert({ name: customerName }).select("id").single();
    if (insertErr) return NextResponse.json({ error: `Failed to create customer: ${insertErr.message}` }, { status: 500 });
    customer = newCust;
  }

  // 2. Prepare all payment records
  const paymentsToInsert: Payment[] = [];

  // Create the INCOMING advance payment record
  paymentsToInsert.push({
    ts: transactionTimestamp,
    customer_id: customer.id,
    party_type: 'customer',
    direction: 'in',
    amount: amount,
    method: method.toLowerCase(),
    bill_no: billNo || null, // Use billNo if provided
    notes: 'Advance Payment',
  });

  // Create the OUTGOING payout records
  if (payouts && payouts.length > 0) {
    const validPayouts = payouts.filter((p: any) => p.amount > 0 && p.recipientName.trim());
    for (const payout of validPayouts) {
      paymentsToInsert.push({
        ts: transactionTimestamp,
        other_name: payout.recipientName,
        party_type: 'others',
        direction: 'out',
        amount: parseFloat(payout.amount) || 0,
        method: payout.method.toLowerCase(),
        bill_no: billNo || null, // Link to the same reference bill
      });
    }
  }

  // 3. Insert all records into the database
  if (paymentsToInsert.length > 0) {
    const { error: payError } = await supabase.from("payments").insert(paymentsToInsert);
    if (payError) return NextResponse.json({ error: `Failed to save payments: ${payError.message}` }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: "Advance and payouts recorded successfully." });
}
