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

  const [query, setQuery] = useState('')
  const [delta, setDelta] = useState<Record<number, number>>({})
  const [savingId, setSavingId] = useState<number | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return products
    return products.filter((p) =>
      `${p.name} ${p.size} ${p.supplier_name ?? ''}`.toLowerCase().includes(q)
    )
  }, [products, query])

  const change = (id: number, by: number) => {
    if (!Number.isFinite(id)) return
    setDelta((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + by }))
  }

  const save = async (p: Product) => {
    const id = Number(p.id)
    if (!Number.isFinite(id)) return

    const d = delta[id] ?? 0
    if (!d) return

    try {
      setSavingId(id)

      const { error } = await supabase.from('stock_moves').insert({
        product_id: id,
        qty: Math.abs(d),
        kind: d > 0 ? 'adjustment_in' : 'adjustment_out',
        notes: 'Manual stock adjustment',
      })

      if (error) throw error

      // reset delta for this product
      setDelta((prev) => {
        const copy = { ...prev }
        delete copy[id]
        return copy
      })

      // simplest reliable refresh
      location.reload()
    } finally {
      setSavingId(null)
    }
  }

  return (
    <>
      {/* ✅ Controlled search input (no SearchBar typing issues) */}
      <input
        className="input"
        placeholder="Search products..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 12 }}
      />

      {!filtered.length ? (
        <p className="empty">No products found.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Size</th>
              <th>Current Stock</th>
              <th>Unit</th>
              <th>Supplier</th>
              <th style={{ width: 220 }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((p) => {
              const id = Number(p.id)
              const isValidId = Number.isFinite(id)

              const d = isValidId ? delta[id] ?? 0 : 0
              const preview = p.current_stock + d

              return (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.size}</td>

                  <td className={preview < 0 ? 'low-stock' : ''}>{preview}</td>

                  <td>
                    <span className="badge">{p.unit}</span>
                  </td>

                  <td>{p.supplier_name ?? '-'}</td>

                  <td style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button
                      type="button"
                      onClick={() => change(id, -1)}
                      disabled={!isValidId || savingId === id}
                    >
                      -
                    </button>

                    <button
                      type="button"
                      onClick={() => change(id, 1)}
                      disabled={!isValidId || savingId === id}
                    >
                      +
                    </button>

                    {isValidId && d !== 0 && (
                      <button
                        type="button"
                        onClick={() => save(p)}
                        disabled={savingId === id}
                      >
                        {savingId === id ? 'Saving...' : 'Save'}
                      </button>
                    )}

                    {isValidId && (
                      <a href={`/products/${id}`} className="btn">
                        View
                      </a>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </>
  )
}
