import Link from "next/link"
import { createClient } from "@/lib/supabase/server"

// Type for our SQL view
type SupplierTransaction = {
  id: number
  supplier_id: number
  supplier_name: string
  product_name: string
  qty: number
  unit: string
  price_per_unit: number
  total_amount: number
  ts: string // timestamp string
}

export default async function PartyDetailsPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const supplierId = Number(id)
  const supabase = await createClient()

  // 1. Fetch supplier
  const { data: supplier, error: supplierError } = await supabase
    .from("suppliers")
    .select("*")
    .eq("id", supplierId)
    .single()

  if (supplierError || !supplier) {
    return <div className="page">Error loading supplier</div>
  }

  // 2. Fetch transactions from view
  const { data: transactions, error: txError } = await supabase
    .from("supplier_transactions" as any) // TS hack for view
    .select("*")
    .eq("supplier_id", supplierId)

  if (txError) {
    return <div className="page">Error loading transactions</div>
  }

  const safeTransactions: SupplierTransaction[] =
    (transactions ?? []) as unknown as SupplierTransaction[]

  // 3. Compute balance
  const balance = safeTransactions.reduce(
    (sum, t) => sum + (t.total_amount || 0),
    0
  )

  return (
    <div className="page">
      {/* Header with Back button */}
      <div className="page-header flex items-center justify-between">
        <h1 className="page-title">{supplier.name}</h1>
        <Link href="/parties" className="btn btn-sm">
          ← Back
        </Link>
      </div>

      <p className="text-muted">Supplier</p>

      <div className="balance credit">
        Current Balance: ₹{balance.toLocaleString()} (You owe)
      </div>

      {/* Transaction history */}
      <div className="card mt-4">
        <div className="card-body">
          <h2 className="section-title">Transaction History</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Details</th>
                <th>Credit (Billed)</th>
              </tr>
            </thead>
            <tbody>
              {safeTransactions.length ? (
                safeTransactions.map((t, idx) => (
                  <tr key={`${t.id}-${idx}`}>
                    <td>
                      {t.ts
                        ? new Date(t.ts).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </td>
                    <td>
                      {t.qty} {t.unit} of {t.product_name} @ ₹{t.price_per_unit}
                    </td>
                    <td className="credit">
                      ₹{(t.total_amount || 0).toLocaleString()}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="empty">
                    No purchases found
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
