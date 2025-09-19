import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = createClient();
  const formData = await request.formData();

  const supplier_id = Number(formData.get("supplier_id"));
  const product_id = Number(formData.get("product_id"));
  const qty = Number(formData.get("qty"));
  const price_per_unit = Number(formData.get("price_per_unit"));
  const notes = formData.get("notes") as string | null;

  const { error } = await supabase.from("stock_moves").insert([
    {
      kind: "purchase",
      supplier_id,
      product_id,
      qty,
      price_per_unit,
      notes,
    },
  ]);

  if (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.redirect(new URL("/purchases", request.url));
}
