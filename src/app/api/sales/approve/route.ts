import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/supabase";

type Payment        = Database["public"]["Tables"]["payments"]["Insert"];
type StockMove      = Database["public"]["Tables"]["stock_moves"]["Insert"];
type BillAdjustment = Database["public"]["Tables"]["bill_adjustments"]["Insert"];

export async function POST(req: Request) {
  const supabase = createClient();
  const { searchParams } = new URL(req.url);
  const approvalId = searchParams.get("approval_id");

  if (!approvalId) {
    return NextResponse.json({ error: "Missing approval_id" }, { status: 400 });
  }

  // 1. Verify it is pending
  const { data: approval, error: fetchError } = await supabase
    .from("sales_approvals" as any)
    .select("status")
    .eq("id", approvalId)
    .single();

  if (fetchError || !approval) {
    return NextResponse.json({ error: "Approval not found" }, { status: 404 });
  }

  const approvalData = approval as unknown as { status: string };

  if (approvalData.status !== "pending") {
    return NextResponse.json(
      { error: "Sale already processed (status: " + approvalData.status + ")" },
      { status: 400 }
    );
  }

  const body = await req.json();

  const {
    billNo,
    billDate,
    customerName,
    isNewCustomer,
    newCustomerOpeningBalance,
    executives = [],
    rows,
    customerPayment,
    payouts,
    gst,
    hamali,
    transport,
    extraCharges,
    discount,
  } = body;

  if (!billNo || !customerName) {
    return NextResponse.json(
      { error: "Bill Number and Customer Name are required." },
      { status: 400 }
    );
  }

  const ts = billDate
    ? new Date(billDate).toISOString()
    : new Date().toISOString();

  try {
    // ----------------------------------------------------------------------
    // REUSED LOGIC FROM /api/sales
    // ----------------------------------------------------------------------

    // 1) CUSTOMER
    let customer: { id: number } | null = null;

    if (isNewCustomer) {
      const { data, error } = await supabase
        .from("customers")
        .insert({
          name: customerName,
          opening_balance: newCustomerOpeningBalance || 0,
        })
        .select("id")
        .single();

      if (error) throw new Error(error.message);
      customer = data;
    } else {
      const { data, error } = await supabase
        .from("customers")
        .select("id")
        .eq("name", customerName)
        .maybeSingle();

      if (error) throw new Error(error.message);

      if (!data) {
        const ins = await supabase
          .from("customers")
          .insert({ name: customerName, opening_balance: 0 })
          .select("id")
          .single();
        if (ins.error) throw new Error(ins.error.message);
        customer = ins.data;
      } else {
        customer = data;
      }
    }

    if (!customer) throw new Error("Customer not resolved");

    // 2) STOCK MOVES
    const stockMoves: StockMove[] = (rows || [])
      .filter((r: any) => r.product_id && r.qty > 0)
      .map((r: any) => ({
        ts,
        kind: "sale",
        customer_id: customer.id,
        bill_no: billNo,
        bill_date: billDate,
        product_id: r.product_id,
        qty: r.qty,
        price_per_unit: r.rate,
      }));

    if (stockMoves.length) {
      const { error } = await supabase
        .from("stock_moves")
        .insert(stockMoves);
      if (error) throw new Error(error.message);
    }

    // 3) PAYMENTS
    const payments: Payment[] = [];
    const totalIn =
      (customerPayment?.advance || 0) +
      (customerPayment?.paidNow || 0);

    if (totalIn > 0) {
      payments.push({
        ts,
        customer_id: customer.id,
        party_type: "customer",
        direction: "in",
        amount: totalIn,
        method: customerPayment.method.toLowerCase(),
        bill_no: billNo,
      });
    }

    if (Array.isArray(payouts)) {
      for (const p of payouts) {
        if (p.amount > 0 && p.recipientName?.trim()) {
          // Attempt to find if this recipient is actually a tracked Party/Customer
          const { data: party } = await supabase
            .from("customers")
            .select("id")
            .eq("name", p.recipientName.trim())
            .maybeSingle();

          if (party) {
            payments.push({
              ts,
              party_type: "customer",
              customer_id: party.id,
              direction: "out",
              amount: p.amount,
              method: "cash",
              bill_no: billNo,
            });
          } else {
            payments.push({
              ts,
              party_type: "others",
              direction: "out",
              amount: p.amount,
              method: "cash",
              other_name: p.recipientName,
              bill_no: billNo,
            });
          }
        }
      }
    }

    if (payments.length) {
      const { error } = await supabase
        .from("payments")
        .insert(payments);
      if (error) throw new Error(error.message);
    }

    // 4) BILL ADJUSTMENTS
    const adjustments: BillAdjustment[] = [];

    for (const ex of executives) {
      if (ex?.trim()) {
        adjustments.push({
          created_at: ts,
          bill_no: billNo,
          customer_id: customer.id,
          type: "executive",
          details: ex,
          amount: 0,
        });
      }
    }

    if (gst > 0)
      adjustments.push({ created_at: ts, bill_no: billNo, customer_id: customer.id, type: "charge", details: "GST", amount: gst });
    if (hamali > 0)
      adjustments.push({ created_at: ts, bill_no: billNo, customer_id: customer.id, type: "charge", details: "Hamali", amount: hamali });
    if (transport > 0)
      adjustments.push({ created_at: ts, bill_no: billNo, customer_id: customer.id, type: "charge", details: "Transport", amount: transport });

    if (Array.isArray(extraCharges)) {
      for (const c of extraCharges) {
        if (c.name && c.amount > 0) {
          adjustments.push({
            created_at: ts,
            bill_no: billNo,
            customer_id: customer.id,
            type: "charge",
            details: c.name,
            amount: c.amount,
          });
        }
      }
    }

    if (discount?.amount > 0) {
      adjustments.push({
        created_at: ts,
        bill_no: billNo,
        customer_id: customer.id,
        type: "discount",
        details: discount.details || "Discount",
        amount: discount.amount,
      });
    }

    if (adjustments.length) {
      const { error } = await supabase
        .from("bill_adjustments")
        .insert(adjustments);
      if (error) throw new Error(error.message);
    }

    // ----------------------------------------------------------------------
    // FINAL STEP: Update Approval Status
    // ----------------------------------------------------------------------
    const { error: updateError } = await supabase
      .from("sales_approvals" as any)
      .update({ status: "approved" })
      .eq("id", approvalId);

    if (updateError) {
      console.error("CRITICAL: Data saved but status update failed", updateError);
      throw new Error(
        "Sale saved successfully, but failed to mark 'approved'. Please contact support."
      );
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
