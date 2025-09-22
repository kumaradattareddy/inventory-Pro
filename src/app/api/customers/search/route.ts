import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = createClient();
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q");

  if (!query) return NextResponse.json([], { status: 200 });

  const { data, error } = await supabase
    .from("customers")
    .select("id, name")
    .ilike("name", `%${query}%`)
    .limit(5);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
