import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createClient();
  const { id } = await params;

  const { data, error } = await supabase
    .from("sales_approvals" as any)
    .select("sale_data, bill_no")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Auto-generate next bill number if both are PENDING/empty
  const record = data as any;
  const jsonBillNo = record?.sale_data?.billNo;
  const tableBillNo = record?.bill_no;
  const isPending = (v: any) => !v || v === "PENDING";

  let next_bill_no: string | null = null;
  if (isPending(jsonBillNo) && isPending(tableBillNo)) {
    // Find highest numeric bill_no from stock_moves
    const { data: maxRow } = await supabase
      .from("stock_moves")
      .select("bill_no")
      .not("bill_no", "is", null)
      .order("bill_no", { ascending: false })
      .limit(200);

    let maxNum = 0;
    if (maxRow) {
      for (const r of maxRow as any[]) {
        const num = parseInt(r.bill_no, 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    }
    next_bill_no = String(maxNum + 1);
  }

  return NextResponse.json({ ...record, next_bill_no });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createClient();
  const { id } = await params;

  const { error } = await supabase
    .from("sales_approvals" as any)
    .update({ status: "rejected" })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
