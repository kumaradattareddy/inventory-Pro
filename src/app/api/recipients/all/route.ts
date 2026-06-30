export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = createClient();
  
  // 1. Get Suppliers
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("name")
    .order("name");

  // 2. Get Others
  const { data: others } = await supabase
    .from("payments")
    .select("other_name")
    .eq("party_type", "others")
    .not("other_name", "is", null);

  const names = new Set<string>();
  
  if (suppliers) {
    for (const s of suppliers) {
      if (s.name) names.add(s.name.trim());
    }
  }
  
  if (others) {
    for (const o of others) {
      if (o.other_name) names.add(o.other_name.trim());
    }
  }

  // Sort alphabetically
  const sortedNames = Array.from(names).sort((a, b) => a.localeCompare(b));

  return NextResponse.json(sortedNames);
}
