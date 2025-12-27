'use client'

import { useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Product = {
  id: number
  name: string
  size: string
  unit: string
  current_stock: number
  supplier_name: string | null
}

export default function ProductsTable({ products }: { products: Product[] }) {
  const supabase = createClient()

  const [rows, setRows] = useState(products)
  const [query, setQuery] = useState('')
  const [delta, setDelta] = useState<Record<number, number>>({})
  const [savingId, setSavingId] = useState<number | null>(null)

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim()
    if (!q) return rows
    return rows.filter(p =>
      `${p.name} ${p.size} ${p.supplier_name ?? ''}`.toLowerCase().includes(q)
    )
  }, [rows, query])

  const change = (id: number, by: number) => {
    setDelta(prev => ({ ...prev, [id]: (prev[id] ?? 0) + by }))
  }

  const save = async (p: Product) => {
    const d = delta[p.id]
    if (!d) return

    try {
      setSavingId(p.id)

      const { error } = await supabase.from('stock_moves').insert({
        product_id: p.id,
        qty: Math.abs(d),
        kind: d > 0 ? 'adjustment_in' : 'adjustment_out',
        notes: 'Manual stock adjustment',
      })

      if (error) throw error

      // ✅ update UI without reload
      setRows(prev =>
        prev.map(r =>
          r.id === p.id
            ? { ...r, current_stock: r.current_stock + d }
            : r
        )
      )

      setDelta(prev => {
        const copy = { ...prev }
        delete copy[p.id]
        return copy
      })
    } finally {
      setSavingId(null)
    }
  }

  return (
    <>
      <input
        className="input"
        placeholder="Search products..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        style={{ marginBottom: 16, maxWidth: 420 }}
      />

      <table className="table">
        <thead>
          <tr>
            <th>NAME</th>
            <th>SIZE</th>
            <th>CURRENT STOCK</th>
            <th>UNIT</th>
            <th>SUPPLIER</th>
            <th style={{ width: 220 }}>ACTIONS</th>
          </tr>
        </thead>

        <tbody>
          {filtered.map(p => {
            const d = delta[p.id] ?? 0
            const preview = p.current_stock + d

            return (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.size}</td>

                <td className={preview < 0 ? 'low-stock' : ''}>
                  {preview}
                </td>

                <td><span className="badge">{p.unit}</span></td>
                <td>{p.supplier_name ?? '-'}</td>

                <td style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => change(p.id, -1)} disabled={savingId === p.id}>−</button>
                  <button onClick={() => change(p.id, 1)} disabled={savingId === p.id}>+</button>

                  {d !== 0 && (
                    <button
                      className="btn-primary"
                      onClick={() => save(p)}
                      disabled={savingId === p.id}
                    >
                      Save
                    </button>
                  )}

                  <a href={`/products/${p.id}`} className="link">
                    View
                  </a>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </>
  )
}
