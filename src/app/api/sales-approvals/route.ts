import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("sales_approvals" as any)
    .select("id, bill_no, bill_date, customer_name, total_amount")
    .eq("status", "pending")
    .order("created_at");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
