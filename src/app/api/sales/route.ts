import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

type StockMove = Database["public"]["Tables"]["stock_moves"]["Insert"];
type Payment = Database["public"]["Tables"]["payments"]["Insert"];

export async function POST(req: Request) {
  const supabase = createClient();
  const body = await req.json();

  const { billNo, billDate, customerName, openingBalance, advance, amountPaidNow, rows, payment } = body;

  // ensure customer exists
  let { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id")
    .eq("name", customerName)
    .maybeSingle();

  if (!customer) {
    const { data: newCust, error: insertErr } = await supabase
      .from("customers")
      .insert({ name: customerName, opening_balance: openingBalance ?? 0 })
      .select("id")
      .single();
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
    customer = newCust;
  }

  // stock_moves insert (save rows JSON as single sale record)
  const stockMove: StockMove = {
    ts: new Date().toISOString(),
    kind: "sale",
    customer_id: customer.id,
    bill_no: billNo,
    bill_date: billDate,
    items: rows,
    notes: `Advance: ${advance}, AmountPaidNow: ${amountPaidNow}`,
  };

  const { error: smError } = await supabase.from("stock_moves").insert(stockMove);
  if (smError) return NextResponse.json({ error: smError.message }, { status: 500 });

  // payments insert
  if (payment.amount > 0) {
    const pay: Payment = {
      ts: new Date().toISOString(),
      customer_id: payment.recipientType === "customer" ? customer.id : null,
      party_id: payment.recipientType === "supplier" ? payment.recipientId : null,
      other_name: payment.recipientType === "others" ? payment.otherName : null,
      amount: payment.amount,
      method: payment.method.toLowerCase(),
      notes: null,
      direction: payment.recipientType === "customer" ? "in" : "out",
      party_type: payment.recipientType,
    };

    const { error: payError } = await supabase.from("payments").insert(pay);
    if (payError) return NextResponse.json({ error: payError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
