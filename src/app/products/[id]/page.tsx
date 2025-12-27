import { createClient } from '@/lib/supabase/server'

export default async function ProductHistory({
  params,
}: {
  params: { id: string }
}) {
  const productId = Number(params.id)
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('stock_moves')
    .select(`
      ts,
      kind,
      qty,
      bill_no,
      suppliers(name),
      customers(name)
    `)
    .eq('product_id', productId)
    .order('ts', { ascending: false })

  if (error) throw new Error(error.message)

  return (
    <div className="card">
      <h2>Product History</h2>

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
          {data?.map((m, i) => (
            <tr key={i}>
              <td>{m.ts ? new Date(m.ts).toLocaleString() : '-'}</td>
              <td>{m.kind}</td>
              <td>{m.qty}</td>
              <td>{m.suppliers?.name || m.customers?.name || '-'}</td>
              <td>{m.bill_no ?? '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
