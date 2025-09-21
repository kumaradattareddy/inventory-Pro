import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = createClient();
  const body = await req.json();

  const {
    method,
    recipientType,
    recipientId,
    otherName,
    amount,
    notes,
  } = body;

  if (!amount || amount <= 0) {
    return NextResponse.json(
      { error: "Payment amount is required" },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("payments").insert([
    {
      method: method.toLowerCase(),
      party_type: recipientType,
      customer_id: recipientType === "customer" ? recipientId : null,
      party_id: recipientType === "supplier" ? recipientId : null,
      other_name: recipientType === "others" ? otherName : null,
      amount,
      notes: notes ?? null,
      direction: recipientType === "customer" ? "in" : "out",
    },
  ]);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
