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
    hamaliName,
    isHamaliPaid,
    transport,
    transportName,
    isTransportPaid,
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
    // BILL NUMBER ASSIGNMENT
    // ----------------------------------------------------------------------
    // The mobile app already assigns a correct, atomic, gapless bill number
    // at creation time (create_new_sale RPC). In the normal case that number
    // is already sitting on this approval row and is already unique — so we
    // just use it as-is, with no rewriting.
    //
    // We only ask the database for a *new* number when the proposed one is
    // genuinely taken by something else (a different approval, or a bill
    // that's already gone through to stock_moves). That allocation goes
    // through get_next_available_bill_no(), a single atomic, locked SQL
    // call (see SQL_ATOMIC_BILL_NO_FOR_APPROVALS.sql) — no client-side
    // retry loop, no text-sort mis-ordering, no random-suffix fallback.
    let finalBillNo = String(billNo).trim();
    const isAutoNumber = /^\d+$/.test(finalBillNo);

    if (isAutoNumber) {
      const [{ data: sameRowConflict }, { data: otherRowConflict }, { data: historical }] = await Promise.all([
        supabase.from("sales_approvals" as any).select("id").eq("id", approvalId).eq("bill_no", finalBillNo).maybeSingle(),
        supabase.from("sales_approvals" as any).select("id").eq("bill_no", finalBillNo).neq("id", approvalId).limit(1),
        supabase.from("stock_moves").select("id").eq("bill_no", finalBillNo).limit(1),
      ]);

      const alreadyOwnsThisNumber = !!sameRowConflict;
      const takenElsewhere = (otherRowConflict && otherRowConflict.length > 0) || (historical && historical.length > 0);

      if (!alreadyOwnsThisNumber && takenElsewhere) {
        const billYear = billDate ? new Date(billDate).getFullYear() : new Date().getFullYear();
        const { data: safeNo, error: rpcError } = await supabase.rpc("get_next_available_bill_no" as any, { _year: billYear });

        if (rpcError || !safeNo) {
          throw new Error("Could not securely allocate a bill number: " + (rpcError?.message || "unknown error"));
        }
        finalBillNo = safeNo as unknown as string;
      }
    }
    // Non-numeric (manually typed) bill numbers are trusted as-is, same as before.

    await supabase.from("sales_approvals" as any).update({ bill_no: finalBillNo }).eq("id", approvalId);

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
      .filter((r: any) => r.product_id && (Number(r.qty) > 0 || Number(r.qty_sqft) > 0))
      .map((r: any) => {
        const isGranite = r.material?.toLowerCase() === "granite";
        return {
          ts,
          kind: "sale",
          customer_id: customer.id,
          bill_no: finalBillNo,
          bill_date: billDate,
          product_id: r.product_id,
          qty: isGranite ? Number(r.qty_sqft) || 0 : Number(r.qty) || 0,
          qty_pcs: isGranite ? Number(r.qty) || 0 : null,
          price_per_unit: r.rate,
        };
      });

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
        bill_no: finalBillNo,
      });
    }

    if (Array.isArray(payouts)) {
      for (const p of payouts) {
        if (p.amount > 0 && p.recipientName?.trim()) {
          const rName = p.recipientName.trim();

          // 1. Check if recipient is a Supplier
          const { data: supplierMatch } = await supabase
            .from("suppliers")
            .select("id")
            .ilike("name", rName)
            .maybeSingle();

          if (supplierMatch) {
            payments.push({
              ts,
              party_type: "supplier",
              direction: "out",
              amount: p.amount,
              method: "cash",
              party_id: supplierMatch.id,
              bill_no: finalBillNo,
            });
            continue;
          }

          // 2. Check if recipient is a Customer
          const { data: customerMatch } = await supabase
            .from("customers")
            .select("id")
            .ilike("name", rName)
            .maybeSingle();

          if (customerMatch) {
            payments.push({
              ts,
              party_type: "customer",
              customer_id: customerMatch.id,
              direction: "out",
              amount: p.amount,
              method: "cash",
              bill_no: finalBillNo,
            });
            continue;
          }

          // 3. Otherwise treat as 'others'
          payments.push({
            ts,
            party_type: "others",
            direction: "out",
            amount: p.amount,
            method: "cash",
            other_name: p.recipientName,
            bill_no: finalBillNo,
          });
        }
      }
    }

    if (hamali > 0 && hamaliName?.trim() && isHamaliPaid) {
      payments.push({
        ts,
        party_type: "others",
        direction: "out",
        amount: hamali,
        method: "cash",
        other_name: hamaliName.trim(),
        bill_no: finalBillNo,
        notes: "Hamali (Paid instantly)",
      } as any);
    }

    if (transport > 0 && transportName?.trim() && isTransportPaid) {
      payments.push({
        ts,
        party_type: "others",
        direction: "out",
        amount: transport,
        method: "cash",
        other_name: transportName.trim(),
        bill_no: finalBillNo,
        notes: "Transport (Paid instantly)",
      } as any);
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
          bill_no: finalBillNo,
          customer_id: customer.id,
          type: "executive",
          details: ex,
          amount: 0,
        });
      }
    }

    if (gst > 0)
      adjustments.push({ created_at: ts, bill_no: finalBillNo, customer_id: customer.id, type: "charge", details: "GST", amount: gst });
    if (hamali > 0)
      adjustments.push({ created_at: ts, bill_no: finalBillNo, customer_id: customer.id, type: "charge", details: "Hamali", amount: hamali });
    if (transport > 0)
      adjustments.push({ created_at: ts, bill_no: finalBillNo, customer_id: customer.id, type: "charge", details: "Transport", amount: transport });

    if (Array.isArray(extraCharges)) {
      for (const c of extraCharges) {
        if (c.name && c.amount > 0) {
          adjustments.push({
            created_at: ts,
            bill_no: finalBillNo,
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
        bill_no: finalBillNo,
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
      .update({ status: "approved", bill_no: finalBillNo })
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
