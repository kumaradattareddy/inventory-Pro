import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = createClient();
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q");

  if (!query) return NextResponse.json([], { status: 200 });

  // This fetches distinct (unique) recipient names from your payments table
  const { data, error } = await supabase
    .from("payments")
    .select("other_name")
    .eq("party_type", "others")
    .ilike("other_name", `%${query}%`)
    .not("other_name", "is", null)
    .limit(10);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  
  // Post-process to get a unique list of names in the desired format
  const uniqueNames = Array.from(new Set(data.map(item => item.other_name)))
    .map(name => ({ name }));

  return NextResponse.json(uniqueNames);
}
