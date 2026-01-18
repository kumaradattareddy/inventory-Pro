import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = createClient();
  
  // 1. Create a dummy test approval
  const dummyPayload = {
    billNo: "TEST-001",
    billDate: new Date().toISOString().split("T")[0],
    customerName: "Test Customer",
    isNewCustomer: true,
    introBalance: 500,
    executives: ["Raziya", "Test Exec"],
    rows: [
      {
        product_id: null,
        product: "Test Product",
        material: "Test Mat",
        size: "10x10",
        unit: "box",
        qty: 10,
        rate: 100,
      },
    ],
    customerPayment: {
      advance: 200,
      paidNow: 0,
      method: "Cash",
    },
    payouts: [],
    gst: 18,
    hamali: 10,
    transport: 50,
    discount: {
      details: "Test Discount",
      amount: 20,
    }
  };

  const { data, error } = await supabase
    .from("sales_approvals" as any)
    .insert({
      bill_no: "TEST-001",
      bill_date: new Date().toISOString(),
      customer_name: "Test Customer",
      executive: "Raziya",
      total_amount: 1000,
      status: "pending",
      sale_data: dummyPayload,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ 
    success: true, 
    message: "Created test approval! Go to /approvals to see it.",
    data 
  });
}
