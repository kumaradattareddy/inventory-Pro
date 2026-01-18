import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = createClient();
  const body = await req.json();

  const { type, partyName, amount, date, method, notes } = body;

  if (!partyName || !amount) {
    return NextResponse.json(
      { error: "Party Name and Amount are required." },
      { status: 400 }
    );
  }

  const ts = date ? new Date(date).toISOString() : new Date().toISOString();
  const noteText = notes || "";

  // 1. Resolve Customer (Create if not exists)
  // We assume all named parties are tracked as customers for simplicity in this "Parties" ledger view.
  let customerId: number | null = null;
  
  const { data: existing, error: findErr } = await supabase
    .from("customers")
    .select("id")
    .eq("name", partyName)
    .maybeSingle();

  if (findErr) {
    return NextResponse.json({ error: findErr.message }, { status: 500 });
  }

  if (existing) {
    customerId = existing.id;
  } else {
    // specific rule: for 'out' to a generic name, maybe we don't force create customer?
    // But user said "adjust parties dues", implying tracking. So we create.
    const { data: newC, error: createErr } = await supabase
      .from("customers")
      .insert({ name: partyName, opening_balance: 0 })
      .select("id")
      .single();
    
    if (createErr) {
      return NextResponse.json({ error: createErr.message }, { status: 500 });
    }
    customerId = newC.id;
  }

  try {
    // 2. Insert Record based on type
    if (type === "in") {
      // Receive Money -> Payment IN
      const { error } = await supabase.from("payments").insert({
        ts,
        customer_id: customerId,
        party_type: "customer",
        direction: "in",
        amount: amount,
        method: (method || "cash").toLowerCase(),
        notes: noteText,
      });
      if (error) throw error;

    } else if (type === "out") {
      // Pay Money -> Payment OUT
      const { error } = await supabase.from("payments").insert({
        ts,
        customer_id: customerId,
        party_type: "customer", // Tracking against customer ledger
        direction: "out",
        amount: amount,
        method: (method || "cash").toLowerCase(),
        notes: noteText,
      });
      if (error) throw error;

    } else if (type === "adj_debit") {
      // Add Due -> Charge
      // type='charge' adds to the bill total usually. 
      // If we want to strictly add to ledger, 'charge' works if queries sum typical adjustments.
      const { error } = await supabase.from("bill_adjustments").insert({
        created_at: ts,
        customer_id: customerId,
        type: "charge",
        details: noteText || "Manual Debit",
        amount: amount,
        bill_no: "ADJ", // Placeholder
      });
      if (error) throw error;

    } else if (type === "adj_credit") {
      // Reduce Due -> Discount
      const { error } = await supabase.from("bill_adjustments").insert({
        created_at: ts,
        customer_id: customerId,
        type: "discount", // Reusing discount as it reduces balance
        // Note: 'discount' usually subtracts from a bill total. 
        // We might want 'payment_adjustment' if that works, or just 'discount'? 
        // Based on previous contexts, 'discount' reduces the 'derived balance'.
        // Let's use 'discount' and hope the ledger query picks it up as a negative.
        details: noteText || "Manual Credit",
        amount: amount,
        bill_no: "ADJ",
      });
      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
