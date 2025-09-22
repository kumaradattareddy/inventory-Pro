import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

type StockMove = Database["public"]["Tables"]["stock_moves"]["Insert"];
type Payment = Database["public"]["Tables"]["payments"]["Insert"];

export async function POST(req: Request) {
  const supabase = createClient();
  const body = await req.json();

  const { billNo, billDate, customerName, openingBalance, advance, rows, payment } = body;

  // 1. Find or create the customer (No changes here)
  let { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id")
    .eq("name", customerName)
    .maybeSingle();

  if (customerError) return NextResponse.json({ error: `Customer lookup failed: ${customerError.message}` }, { status: 500 });

  if (!customer) {
    const { data: newCust, error: insertErr } = await supabase
      .from("customers")
      .insert({ name: customerName, opening_balance: openingBalance ?? 0 })
      .select("id")
      .single();
    if (insertErr) return NextResponse.json({ error: `Failed to create customer: ${insertErr.message}` }, { status: 500 });
    customer = newCust;
  }

  // 2. Prepare stock_moves records for each item (No changes here)
  const stockMovesToInsert: StockMove[] = rows
    .filter((row: any) => row.product_id && row.qty > 0)
    .map((row: any) => ({
      ts: new Date().toISOString(),
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

  // ✅ 3. DYNAMICALLY record the payment based on the "Recipient" dropdown
  if (payment && payment.amount > 0) {
    let paymentToInsert: Payment;

    if (payment.recipientType === 'customer') {
      paymentToInsert = {
        ts: new Date().toISOString(),
        customer_id: customer.id, // Link to the customer
        party_type: 'customer',
        direction: 'in', // Money comes IN from the customer
        amount: payment.amount,
        method: payment.method.toLowerCase(),
        bill_no: billNo,
      };
    } else if (payment.recipientType === 'others') {
      paymentToInsert = {
        ts: new Date().toISOString(),
        other_name: payment.otherName, // Save the recipient's name (e.g., Vikas)
        party_type: 'others',
        direction: 'out', // Money goes OUT to the third party
        amount: payment.amount,
        method: payment.method.toLowerCase(),
        bill_no: billNo,
      };
    } else {
      // You can add logic for 'supplier' or other types here if needed
      return NextResponse.json({ error: "Unsupported recipient type" }, { status: 400 });
    }

    const { error: payError } = await supabase.from("payments").insert(paymentToInsert);
    if (payError) return NextResponse.json({ error: `Sale saved, but payment failed: ${payError.message}` }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: "Sale recorded successfully." });
}