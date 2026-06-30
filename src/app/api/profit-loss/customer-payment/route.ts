export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = createClient();
  const body = await req.json();

  const { customerId, amount, method, notes } = body;

  if (!customerId || !amount || amount <= 0) {
    return NextResponse.json({ error: "Customer ID and amount are required" }, { status: 400 });
  }

  const payment: any = {
    ts: new Date().toISOString(),
    party_type: "customer",
    customer_id: customerId,
    direction: "in",
    amount: Number(amount),
    method: (method || "cash").toLowerCase(),
  };

  if (notes) {
    payment.notes = notes;
  }

  const { error } = await supabase.from("payments").insert(payment);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
