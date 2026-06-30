export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = createClient();
  const body = await req.json();

  const { supplierId, amount, method, notes, isAdjustment } = body;

  if (!supplierId || !amount || amount <= 0) {
    return NextResponse.json({ error: "Supplier ID and amount are required" }, { status: 400 });
  }

  const payment: any = {
    ts: new Date().toISOString(),
    party_type: "supplier",
    party_id: supplierId,
    direction: "out",
    amount: Number(amount),
    method: (method || "cash").toLowerCase(),
  };

  if (isAdjustment && notes) {
    payment.notes = `[Adjustment] ${notes}`;
  } else if (notes) {
    payment.notes = notes;
  }

  const { error } = await supabase.from("payments").insert(payment);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
