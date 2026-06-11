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
  const supabase = useMemo(() => createClient(), [])

  const [rows, setRows] = useState(products)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [delta, setDelta] = useState<Record<number, number>>({})
  const [savingId, setSavingId] = useState<number | null>(null)

  // Restore scroll position when returning from product detail
  useEffect(() => {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual'
    }
    const y = sessionStorage.getItem('products-scroll')
    if (y) {
      setTimeout(() => {
        window.scrollTo(0, Number(y))
        sessionStorage.removeItem('products-scroll')
      }, 150)
    }
  }, [])

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
        ts: new Date().toISOString(),
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
    } catch {
      alert('Failed to save stock adjustment. Please try again.')
    } finally {
      setSavingId(null)
    }
  }

  return (
    <>
      {/* Header with Granite button */}
      <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 style={{ margin: 0, flex: 1 }}>Products</h2>
        <a
          href="/products/granite"
          className="btn"
          style={{ 
            display: 'inline-flex', 
            alignItems: 'center', 
            gap: 6, 
            fontSize: 14,
            fontWeight: 600,
            backgroundColor: '#dcfce7',
            color: '#166534',
            border: '1px solid #bbf7d0'
          }}
        >
          🪨 Granite Stock
        </a>
      </div>

      {/* Search Bar */}
      <div style={{ padding: '0 16px 16px' }}>
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
            <th style={{ minWidth: 200 }}>SIZE</th>
            <th>CURRENT STOCK</th>
            <th>UNIT</th>
            <th>SUPPLIER</th>
            <th>ACTIONS</th>
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
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', whiteSpace: 'nowrap' }}>
                    <button className="btn-icon" style={{ width: 28, height: 28, fontSize: 16 }} onClick={() => change(p.id, -1)}>−</button>
                    <input
                      type="number"
                      value={d || ''}
                      placeholder="0"
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 0
                        setDelta((prev) => ({ ...prev, [p.id]: val }))
                      }}
                      style={{
                        width: 48,
                        padding: '3px 4px',
                        textAlign: 'center',
                        borderRadius: 6,
                        border: '1px solid #d0d7de',
                        fontSize: 13,
                      }}
                    />
                    <button className="btn-icon" style={{ width: 28, height: 28, fontSize: 16 }} onClick={() => change(p.id, 1)}>+</button>

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
