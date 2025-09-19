
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"

// Define the shape of our SQL view
type SupplierTotal = {
  supplier_id: number
  supplier_name: string
  total_purchases: number
}

export default async function PartiesPage() {
  const supabase = await createClient()

  // 1. Fetch totals from view
  const { data: parties, error } = await supabase
    .from("supplier_totals" as any) // 👈 TS hack since it's a view
    .select("*")

  if (error || !parties) {
    return <div className="page">Error loading parties</div>
  }

  const safeParties: SupplierTotal[] = (parties ?? []) as unknown as SupplierTotal[]

  return (
    <div className="page">
      <div className="page-header">
        <h1 className="page-title">Parties</h1>
        <button className="btn">Add New Party</button>
      </div>

      <div className="card mt-4">
        <div className="card-body">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Total Purchases</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {safeParties.map((p) => (
                <tr key={p.supplier_id}>
                  <td>{p.supplier_name}</td>
                  <td>₹{(p.total_purchases || 0).toLocaleString()}</td>
                  <td>
                    <Link
                      href={`/parties/${p.supplier_id}`}
                      className="btn btn-sm"
                    >
                      View Details
                    </Link>
                  </td>
                </tr>
              ))}
              {!safeParties.length && (
                <tr>
                  <td colSpan={3} className="empty">
                    No suppliers found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
