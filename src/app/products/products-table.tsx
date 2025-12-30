'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { saveScroll } from '@/lib/scroll'

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
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [delta, setDelta] = useState<Record<number, number>>({})
  const [savingId, setSavingId] = useState<number | null>(null)

  // ✅ DEBOUNCE SEARCH (fixes lag)
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(query.trim().toLowerCase())
    }, 200) // fast but smooth

    return () => clearTimeout(t)
  }, [query])

  // ✅ FILTER ONLY WHEN DEBOUNCED QUERY CHANGES
  const filtered = useMemo(() => {
    if (!debouncedQuery) return rows

    return rows.filter((p) =>
      `${p.name} ${p.size} ${p.supplier_name ?? ''}`
        .toLowerCase()
        .includes(debouncedQuery)
    )
  }, [rows, debouncedQuery])

  const change = (id: number, by: number) => {
    setDelta((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + by }))
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

      // optimistic update
      setRows((prev) =>
        prev.map((r) =>
          r.id === p.id
            ? { ...r, current_stock: r.current_stock + d }
            : r
        )
      )

      setDelta((prev) => {
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
      {/* ✅ FULL WIDTH SEARCH BAR (OLD UI STYLE) */}
      <div style={{ padding: '16px' }}>
        <input
          type="search"
          placeholder="Search products..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '12px 14px',
            borderRadius: 8,
            border: '1px solid #d0d7de',
            fontSize: 15,
            outline: 'none',
          }}
        />
      </div>

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
          {filtered.map((p) => {
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

                <td>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button className="btn-icon" onClick={() => change(p.id, -1)}>−</button>
                    <button className="btn-icon" onClick={() => change(p.id, 1)}>+</button>

                    {d !== 0 && (
                      <button
                        className="btn-primary"
                        onClick={() => save(p)}
                        disabled={savingId === p.id}
                      >
                        Save
                      </button>
                    )}

                    <a
                      href={`/products/${p.id}`}
                      onClick={() => saveScroll('products-scroll')}
                      className="link"
                    >
                      View
                    </a>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </>
  )
}
