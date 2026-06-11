import { createClient } from '@/lib/supabase/server'
import BackButton from '@/components/BackButton'

type StockMove = {
  ts: string | null
  kind: string | null
  qty: number | null
  qty_pcs: number | null
  price_per_unit: number | null
  bill_no: string | null
  customers: { name: string } | null
  suppliers: { name: string } | null
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
      <div style={{ padding: 24 }}>
        <BackButton />
        <p>Invalid product</p>
      </div>
    )
  }

  const supabase = await createClient()

  // Fetch product name
  const { data: product } = await supabase
    .from('products')
    .select('name, material, size, unit')
    .eq('id', productId)
    .single()

  // Fetch all stock moves with pagination and related customer/supplier data
  const PAGE_SIZE = 1000
  let allMoves: StockMove[] = []
  let from = 0
  let keepGoing = true

  while (keepGoing) {
    const { data, error } = await supabase
      .from('stock_moves' as never)
      .select(`
        ts, kind, qty, qty_pcs, price_per_unit, bill_no,
        customers(name),
        suppliers(name)
      `)
      .eq('product_id', productId)
      .order('ts', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)

    if (error) throw new Error(error.message)

    const rows = (data ?? []) as StockMove[]
    allMoves = allMoves.concat(rows)

    if (rows.length < PAGE_SIZE) {
      keepGoing = false
    } else {
      from += PAGE_SIZE
    }
  }

  // Fetch executive info from sales_approvals by bill_no
  const billNos = [...new Set(allMoves.filter(m => m.bill_no).map(m => m.bill_no!))]
  const executiveMap: Record<string, string> = {}

  if (billNos.length > 0) {
    for (let i = 0; i < billNos.length; i += 200) {
      const batch = billNos.slice(i, i + 200)
      const { data: approvals } = await supabase
        .from('sales_approvals')
        .select('bill_no, executive')
        .in('bill_no', batch)

      if (approvals) {
        for (const a of approvals) {
          if (a.bill_no && a.executive) {
            executiveMap[a.bill_no] = a.executive
          }
        }
      }
    }
  }

  const productTitle = product
    ? `${product.name}${product.size ? ` (${product.size})` : ''}`
    : `Product #${productId}`

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div className="card">
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <BackButton />
            <div>
              <h2 style={{ margin: 0 }}>Product History</h2>
              {product && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                  {product.size && (
                    <span className="badge">{product.size}</span>
                  )}
                  {product.material && (
                    <span className="badge">{product.material}</span>
                  )}
                  {product.unit && (
                    <span className="badge">{product.unit}</span>
                  )}
                  <span style={{ fontSize: 13, color: '#9ca3af' }}>#{product.name}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <table className="table">
          <thead>
            <tr>
              <th>DATE</th>
              <th>TYPE</th>
              <th>EXECUTIVE</th>
              <th>SQ FT / QTY</th>
              <th>PCS</th>
              <th>PRICE</th>
              <th>AMOUNT</th>
              <th>BILL NO</th>
              <th>PARTY</th>
            </tr>
          </thead>

          <tbody>
            {allMoves.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: 48, color: '#6b7280' }}>
                  No stock movements found for this product.
                </td>
              </tr>
            )}
            {allMoves.map((m, i) => {
              const amount =
                m.qty && m.price_per_unit
                  ? m.qty * m.price_per_unit
                  : null

              const party =
                m.kind === 'sale'
                  ? m.customers?.name ?? '-'
                  : m.kind === 'purchase'
                  ? m.suppliers?.name ?? '-'
                  : '-'

              const executive =
                m.bill_no && executiveMap[m.bill_no]
                  ? executiveMap[m.bill_no]
                  : '-'

              const badgeClass =
                m.kind === 'sale'
                  ? 'stock-badge sale'
                  : m.kind === 'purchase'
                  ? 'stock-badge purchase'
                  : m.kind === 'adjustment_out'
                  ? 'stock-badge adj-out'
                  : 'stock-badge adj-in'

              return (
                <tr key={i}>
                  <td>
                    {m.ts
                      ? new Date(m.ts).toLocaleDateString('en-IN')
                      : '-'}
                  </td>
                  <td>
                    <span className={badgeClass}>
                      {m.kind?.replace(/_/g, ' ').toUpperCase()}
                    </span>
                  </td>
                  <td>
                    {executive !== '-' ? (
                      <span className="db-exec-badge">{executive}</span>
                    ) : '-'}
                  </td>
                  <td>{m.qty}</td>
                  <td style={{ color: m.qty_pcs ? '#1e40af' : undefined }}>
                    {m.qty_pcs ?? '-'}
                  </td>
                  <td>
                    {m.price_per_unit
                      ? `₹${m.price_per_unit.toLocaleString("en-IN")}`
                      : '-'}
                  </td>
                  <td style={{ fontWeight: 600 }}>
                    {amount ? `₹${amount.toLocaleString("en-IN")}` : '-'}
                  </td>
                  <td>{m.bill_no ?? '-'}</td>
                  <td style={{ fontWeight: 500 }}>{party}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
