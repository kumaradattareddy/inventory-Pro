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

  return (
    <div className="card" style={{ maxWidth: 900 }}>
      <BackButton />

      <h2>Product History</h2>

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
                <td>{m.ts ? new Date(m.ts).toLocaleString() : '-'}</td>
                <td>
                  <span className={`badge ${m.kind === 'sale' ? 'red' : 'green'}`}>
                    {m.kind}
                  </span>
                </td>
                <td>{m.qty}</td>
                <td>{m.price_per_unit ?? '-'}</td>
                <td>{amount ?? '-'}</td>
                <td>{m.bill_no ?? '-'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
