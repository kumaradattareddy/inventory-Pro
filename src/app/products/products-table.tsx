'use client'

import { useState } from 'react'
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
  const [query, setQuery] = useState('')
  const [delta, setDelta] = useState<Record<number, number>>({})

  const filtered = products.filter(p =>
    [p.name, p.size, p.supplier_name ?? '']
      .join(' ')
      .toLowerCase()
      .includes(query.toLowerCase())
  )

  const change = (id: number, val: number) => {
    setDelta(prev => ({
      ...prev,
      [id]: (prev[id] ?? 0) + val
    }))
  }

  const save = async (p: Product) => {
    const d = delta[p.id]
    if (!d) return

    await supabase.from('stock_moves').insert({
      product_id: p.id,
      qty: Math.abs(d),
      kind: d > 0 ? 'adjustment_in' : 'adjustment_out',
      notes: 'Manual stock adjustment'
    })

    location.reload()
  }

  return (
    <>
      {/* Local controlled search input (NO SearchBar type issues) */}
      <input
        className="input"
        placeholder="Search products..."
        value={query}
        onChange={e => setQuery(e.target.value)}
      />

      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Size</th>
            <th>Current Stock</th>
            <th>Unit</th>
            <th>Supplier</th>
            <th>Actions</th>
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

                <td>{p.unit}</td>
                <td>{p.supplier_name ?? '-'}</td>

                <td style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => change(p.id, -1)}>-</button>
                  <button onClick={() => change(p.id, 1)}>+</button>

                  {d !== 0 && (
                    <button onClick={() => save(p)}>Save</button>
                  )}

                  <a href={`/products/${p.id}`} className="btn">
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
