import { createClient } from '@/lib/supabase/server'
import BackButton from '@/components/BackButton'

export default async function ProductHistory({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const productId = Number(id)

  if (!Number.isFinite(productId)) {
    return (
      <div style={{ padding: 24 }}>
        <BackButton />
        <p>Invalid product</p>
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

  return (
    <div style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
      <div className="card">
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
            {(data ?? []).map((m, i) => {
              const amount =
                m.qty && m.price_per_unit
                  ? m.qty * m.price_per_unit
                  : null

              return (
                <tr key={i}>
                  <td>
                    {m.ts
                      ? new Date(m.ts).toLocaleDateString('en-IN')
                      : '-'}
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        m.kind === 'sale'
                          ? 'badge-red'
                          : 'badge-green'
                      }`}
                    >
                      {m.kind?.toUpperCase()}
                    </span>
                  </td>
                  <td>{m.qty}</td>
                  <td>
                    {m.price_per_unit
                      ? `₹${m.price_per_unit.toLocaleString("en-IN")}`
                      : '-'}
                  </td>
                  <td>
                    {amount ? `₹${amount.toLocaleString("en-IN")}` : '-'}
                  </td>
                  <td>{m.bill_no ?? '-'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
