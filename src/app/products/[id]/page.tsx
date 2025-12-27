import { createClient } from '@/lib/supabase/server'

export default async function ProductHistory({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const productId = Number(id)

  if (!Number.isFinite(productId)) {
    return (
      <div className="card">
        <h2>Product History</h2>
        <p className="empty">Invalid product id.</p>
      </div>
    )
  }

  const supabase = await createClient()

  // 1) Get moves
  const { data: moves, error: movesError } = await supabase
    .from('stock_moves')
    .select('ts, kind, qty, bill_no, supplier_id, customer_id')
    .eq('product_id', productId)
    .order('ts', { ascending: false })

  if (movesError) throw new Error(movesError.message)

  const safeMoves = moves ?? []

  // 2) Collect supplier/customer ids
  const supplierIds = Array.from(
    new Set(safeMoves.map((m: any) => m.supplier_id).filter((x: any) => Number.isFinite(Number(x))))
  ).map(Number)

  const customerIds = Array.from(
    new Set(safeMoves.map((m: any) => m.customer_id).filter((x: any) => Number.isFinite(Number(x))))
  ).map(Number)

  // 3) Fetch names (robust, no relationship join assumptions)
  const suppliersMap = new Map<number, string>()
  const customersMap = new Map<number, string>()

  if (supplierIds.length) {
    const { data: suppliers } = await supabase
      .from('suppliers')
      .select('id, name')
      .in('id', supplierIds)

    ;(suppliers ?? []).forEach((s: any) => suppliersMap.set(Number(s.id), s.name))
  }

  if (customerIds.length) {
    const { data: customers } = await supabase
      .from('customers')
      .select('id, name')
      .in('id', customerIds)

    ;(customers ?? []).forEach((c: any) => customersMap.set(Number(c.id), c.name))
  }

  return (
    <div className="card">
      <h2>Product History</h2>

      {!safeMoves.length ? (
        <p className="empty">No history found.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Qty</th>
              <th>Party</th>
              <th>Bill No</th>
            </tr>
          </thead>

          <tbody>
            {safeMoves.map((m: any, i: number) => {
              const party =
                (Number.isFinite(Number(m.supplier_id)) &&
                  suppliersMap.get(Number(m.supplier_id))) ||
                (Number.isFinite(Number(m.customer_id)) &&
                  customersMap.get(Number(m.customer_id))) ||
                '-'

              return (
                <tr key={i}>
                  <td>{m.ts ? new Date(m.ts).toLocaleString() : '-'}</td>
                  <td>{m.kind ?? '-'}</td>
                  <td>{m.qty ?? '-'}</td>
                  <td>{party}</td>
                  <td>{m.bill_no ?? '-'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
