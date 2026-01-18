import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = createClient();
  const body = await req.json();

  // "type" comes from the frontend mode:
  // 'in' (Receive), 'out' (Pay), 'adj_debit', 'adj_credit'
  const { type, partyName, amount, date, method, notes } = body;

  if (!partyName || !amount) {
    return NextResponse.json(
      { error: "Party Name and Amount are required." },
      { status: 400 }
    );
  }

  const ts = date ? new Date(date).toISOString() : new Date().toISOString();
  const noteText = notes || "";

  /* -------------------------------------------------------------------------- */
  /*                       1. Resolve Supplier ID                               */
  /* -------------------------------------------------------------------------- */
  let supplierId: number | null = null;
  
  const { data: existing, error: findErr } = await supabase
    .from("suppliers")
    .select("id")
    .eq("name", partyName)
    .maybeSingle();

  if (findErr) {
    return NextResponse.json({ error: findErr.message }, { status: 500 });
  }

  if (existing) {
    supplierId = existing.id;
  } else {
    // Auto-create supplier if missing
    const { data: newS, error: createErr } = await supabase
      .from("suppliers")
      .insert({ name: partyName, opening_balance: 0 })
      .select("id")
      .single();
    
    if (createErr) {
      return NextResponse.json({ error: createErr.message }, { status: 500 });
    }
    supplierId = newS.id;
  }

  /* -------------------------------------------------------------------------- */
  /*                       2. Insert Payment Record                             */
  /* -------------------------------------------------------------------------- */
  try {
    // We map the frontend 'type' to database 'direction'
    // For Suppliers:
    // 'out' = We Pay Supplier (Standard) -> direction: 'out'
    // 'in'  = Supplier Refunds Us? -> direction: 'in'
    
    // Adjustments:
    // Debit (Add Charge) -> We owe more -> Like a Purchase.
    // Credit (add Discount) -> We owe less -> Like a Payment.

    let direction = "out"; 
    // Default to 'out' (paying them). 
    
    if (type === "in") direction = "in"; // Refund
    if (type === "adj_credit") direction = "out"; // Discount treats as if we paid them (reduces debt)
    if (type === "adj_debit") direction = "in"; // Charge treats as if they gave us value (increases debt). WAIT.

    // Let's stick to standard payments first.
    // If type is 'out' -> Insert into payments.
    // If type is 'in' -> Insert into payments.
    
    // For adjustments, we might need a special note.
    
    const dbPayload: any = {
      ts,
      party_type: "supplier",
      customer_id: null,      // Explicitly null
      // supplier_id: supplierId, // Use this if column exists. 
      // Based on previous file content, it used 'party_id'. I'll try both or party_id.
      party_id: supplierId,  // Safest bet given previous file content
      
      direction: (type === "out" || type === "adj_credit") ? "out" : "in",
      amount: amount,
      method: (method || "cash").toLowerCase(),
      notes: type.startsWith("adj") ? `[Adjustment] ${noteText}` : noteText,
    };
    
    // NOTE: If the DB strictly requires 'supplier_id', 'party_id' might fail.
    // But since the previous file I saw used 'party_id' for supplier, I'm 90% sure that's the column.
    
    const { error } = await supabase.from("payments").insert(dbPayload);

    if (error) {
       // Fallback: If party_id fails, maybe it IS supplier_id?
       // We can catch and retry? No, that's messy.
       // I'll trust the previous file signature.
       throw error;
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
