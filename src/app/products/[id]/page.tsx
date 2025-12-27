import { createClient } from '@/lib/supabase/server'
import BackButton from '@/components/BackButton'

type StockMoveRow = {
  ts: string | null
  kind: string | null
  qty: number | null
  price_per_unit: number | null
  bill_no: string | null
}

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
        <BackButton />
        <p className="empty">Invalid product.</p>
      </div>
    )
  }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('stock_moves')
    .select('ts, kind, qty, price_per_unit, bill_no')
    .eq('product_id', productId)
    .order('ts', { ascending: false })

  if (error) throw new Error(error.message)

  const rows = (data ?? []) as StockMoveRow[]

  return (
    <div className="card" style={{ maxWidth: 900 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <BackButton />
        <h2 style={{ margin: 0 }}>Product History</h2>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>DATE</th>
            <th>TYPE</th>
            <th>QTY</th>
            <th>PRICE</th>
            <th>AMOUNT</th>
            <th>BILL NO</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((m, i) => {
            const qty = m.qty ?? 0
            const price = m.price_per_unit ?? 0
            const amount = qty && price ? qty * price : null

            return (
              <tr key={i}>
                {/* DATE */}
                <td>
                  {m.ts
                    ? new Date(m.ts).toLocaleDateString('en-IN')
                    : '-'}
                </td>

                {/* TYPE */}
                <td>
                  {m.kind ? (
                    <span
                      className={`badge ${
                        m.kind === 'sale'
                          ? 'badge-red'
                          : 'badge-green'
                      }`}
                    >
                      {m.kind.toUpperCase()}
                    </span>
                  ) : (
                    '-'
                  )}
                </td>

                {/* QTY */}
                <td>{m.qty ?? '-'}</td>

                {/* PRICE */}
                <td>
                  {m.price_per_unit
                    ? `₹${m.price_per_unit.toLocaleString()}`
                    : '-'}
                </td>

                {/* AMOUNT */}
                <td>
                  {amount
                    ? `₹${amount.toLocaleString()}`
                    : '-'}
                </td>

                {/* BILL NO */}
                <td>{m.bill_no ?? '-'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
