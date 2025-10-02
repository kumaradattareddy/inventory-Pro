import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

type Payment        = Database["public"]["Tables"]["payments"]["Insert"];
type StockMove      = Database["public"]["Tables"]["stock_moves"]["Insert"];
type BillAdjustment = Database["public"]["Tables"]["bill_adjustments"]["Insert"];

export async function POST(req: Request) {
  const supabase = createClient();
  const body = await req.json();

  const {
    billNo,
    billDate,
    customerName,
    isNewCustomer,
    newCustomerOpeningBalance,
    executives = [],     // string[]
    rows,
    customerPayment,
    payouts,
    gst,                 // NEW
    hamali,
    transport,
    extraCharges,
    discount,
  } = body;

  if (!billNo || !customerName) {
    return NextResponse.json({ error: "Bill Number and Customer Name are required." }, { status: 400 });
  }

  const ts = billDate ? new Date(billDate).toISOString() : new Date().toISOString();

  try {
    // 1) customer
    let customer: { id: number } | null = null;

    if (isNewCustomer) {
      const { data, error } = await supabase
        .from("customers").insert({ name: customerName, opening_balance: newCustomerOpeningBalance || 0 })
        .select("id").single();
      if (error) throw new Error(`Failed to create new customer: ${error.message}`);
      customer = data;
    } else {
      let { data, error } = await supabase.from("customers").select("id").eq("name", customerName).maybeSingle();
      if (error) throw new Error(`Customer lookup failed: ${error.message}`);
      if (!data) {
        const ins = await supabase.from("customers").insert({ name: customerName, opening_balance: 0 }).select("id").single();
        if (ins.error) throw new Error(`Failed to create fallback customer: ${ins.error.message}`);
        customer = ins.data;
      } else customer = data;
    }
    if (!customer) throw new Error("Could not find or create a customer.");

    // 2) sale items
    const sm: StockMove[] = (rows || [])
      .filter((r: any) => r.product_id && r.qty > 0)
      .map((r: any) => ({
        ts, kind: "sale", customer_id: customer!.id, bill_no: billNo, bill_date: billDate,
        product_id: r.product_id, qty: r.qty, price_per_unit: r.rate,
      }));
    if (sm.length) {
      const { error } = await supabase.from("stock_moves").insert(sm);
      if (error) throw new Error(`Failed to save sale items: ${error.message}`);
    }

    // 3) payments & payouts
    const pay: Payment[] = [];
    const totalIn = (customerPayment?.advance || 0) + (customerPayment?.paidNow || 0);
    if (totalIn > 0) {
      pay.push({ ts, customer_id: customer.id, party_type: "customer", direction: "in", amount: totalIn, method: (customerPayment?.method || "cash").toLowerCase(), bill_no: billNo });
    }
    if (Array.isArray(payouts) && payouts.length) {
      for (const p of payouts) {
        if ((p?.amount || 0) > 0 && String(p?.recipientName || "").trim()) {
          pay.push({ ts, other_name: p.recipientName, party_type: "others", direction: "out", amount: p.amount, method: "cash", bill_no: billNo });
        }
      }
    }
    if (pay.length) {
      const { error } = await supabase.from("payments").insert(pay);
      if (error) throw new Error(`Payments failed: ${error.message}`);
    }

    // 4) adjustments: executives + GST + hamali + transport + other charges + discount
    const adj: BillAdjustment[] = [];

    if (Array.isArray(executives)) {
      for (const raw of executives) {
        const name = String(raw || "").trim();
        if (!name) continue;
        adj.push({ created_at: ts, bill_no: billNo, customer_id: customer.id, type: "executive", details: name, amount: 0 });
      }
    }

    if (gst && Number(gst) > 0) {
      adj.push({ created_at: ts, bill_no: billNo, customer_id: customer.id, type: "charge", details: "GST", amount: Number(gst) });
    }
    if (hamali && Number(hamali) > 0) {
      adj.push({ created_at: ts, bill_no: billNo, customer_id: customer.id, type: "charge", details: "Hamali", amount: Number(hamali) });
    }
    if (transport && Number(transport) > 0) {
      adj.push({ created_at: ts, bill_no: billNo, customer_id: customer.id, type: "charge", details: "Transport", amount: Number(transport) });
    }
    if (Array.isArray(extraCharges) && extraCharges.length) {
      for (const c of extraCharges) {
        if (c?.name && (c?.amount || 0) > 0) {
          adj.push({ created_at: ts, bill_no: billNo, customer_id: customer.id, type: "charge", details: c.name, amount: c.amount });
        }
      }
    }
    if (discount && (discount.amount || 0) > 0) {
      adj.push({ created_at: ts, bill_no: billNo, customer_id: customer.id, type: "discount", details: discount.details || "Discount", amount: discount.amount });
    }

    if (adj.length) {
      const { error } = await supabase.from("bill_adjustments").insert(adj);
      if (error) throw new Error(`Adjustments failed: ${error.message}`);
    }

    return NextResponse.json({ success: true, message: "Sale recorded successfully." });
  } catch (e: any) {
    console.error("Error in /api/sales:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
