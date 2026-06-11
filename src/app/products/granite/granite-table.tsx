'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { saveScroll } from '@/lib/scroll'

type GraniteProduct = {
  id: number
  name: string
  size: string
  unit: string
  stock_pcs: number
  stock_sqft: number
  supplier_name: string | null
}

type Delta = {
  pcs: number
  sqft: number
}

export default function GraniteTable({ products }: { products: GraniteProduct[] }) {
  const supabase = useMemo(() => createClient(), [])

  const [rows, setRows] = useState(products)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [delta, setDelta] = useState<Record<number, Delta>>({})
  const [savingId, setSavingId] = useState<number | null>(null)

  // Restore scroll position
  useEffect(() => {
    if ('scrollRestoration' in history) {
      history.scrollRestoration = 'manual'
    }
    const y = sessionStorage.getItem('granite-scroll')
    if (y) {
      setTimeout(() => {
        window.scrollTo(0, Number(y))
        sessionStorage.removeItem('granite-scroll')
      }, 150)
    }
  }, [])

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(query.trim().toLowerCase())
    }, 200)
    return () => clearTimeout(t)
  }, [query])

  const filtered = useMemo(() => {
    if (!debouncedQuery) return rows
    return rows.filter((p) =>
      `${p.name} ${p.size} ${p.supplier_name ?? ''}`
        .toLowerCase()
        .includes(debouncedQuery)
    )
  }, [rows, debouncedQuery])

  const getDelta = (id: number): Delta => delta[id] ?? { pcs: 0, sqft: 0 }

  const changePcs = (id: number, by: number) => {
    setDelta((prev) => {
      const current = prev[id] ?? { pcs: 0, sqft: 0 }
      return { ...prev, [id]: { ...current, pcs: current.pcs + by } }
    })
  }

  const changeSqft = (id: number, by: number) => {
    setDelta((prev) => {
      const current = prev[id] ?? { pcs: 0, sqft: 0 }
      return { ...prev, [id]: { ...current, sqft: current.sqft + by } }
    })
  }

  const setPcsDelta = (id: number, val: number) => {
    setDelta((prev) => {
      const current = prev[id] ?? { pcs: 0, sqft: 0 }
      return { ...prev, [id]: { ...current, pcs: val } }
    })
  }

  const setSqftDelta = (id: number, val: number) => {
    setDelta((prev) => {
      const current = prev[id] ?? { pcs: 0, sqft: 0 }
      return { ...prev, [id]: { ...current, sqft: val } }
    })
  }

  const hasDelta = (id: number) => {
    const d = getDelta(id)
    return d.pcs !== 0 || d.sqft !== 0
  }

  const save = async (p: GraniteProduct) => {
    const d = getDelta(p.id)
    if (!d.pcs && !d.sqft) return

    // Determine direction — both must agree
    const pcsSign = d.pcs > 0 ? 1 : d.pcs < 0 ? -1 : 0
    const sqftSign = d.sqft > 0 ? 1 : d.sqft < 0 ? -1 : 0

    if (pcsSign !== 0 && sqftSign !== 0 && pcsSign !== sqftSign) {
      alert('PCS and SQ FT must both be positive (add) or both negative (remove).')
      return
    }

    if (p.stock_sqft + d.sqft < 0) {
      alert('Cannot reduce SQ FT below 0.')
      return
    }

    if (p.stock_pcs + d.pcs < 0) {
      alert('Cannot reduce PCS below 0.')
      return
    }

    const direction = pcsSign || sqftSign
    const kind = direction >= 0 ? 'adjustment_in' : 'adjustment_out'

    try {
      setSavingId(p.id)

      const { error } = await supabase.from('stock_moves').insert({
        product_id: p.id,
        qty: Math.abs(d.sqft),     // MAIN qty is SQ FT
        qty_pcs: Math.abs(d.pcs),  // SECONDARY qty is PCS
        kind,
        notes: 'Manual granite stock adjustment',
        ts: new Date().toISOString(),
      })

      if (error) throw error

      // Optimistic update
      setRows((prev) =>
        prev.map((r) =>
          r.id === p.id
            ? {
                ...r,
                stock_pcs: r.stock_pcs + d.pcs,
                stock_sqft: r.stock_sqft + d.sqft,
              }
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
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-table { width: 100%; border-collapse: collapse; }
          .print-table th, .print-table td { padding: 8px; border: 1px solid #ddd; }
        }
      `}</style>
      
      {/* Header */}
      <div style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <a href="/products" className="link no-print" style={{ fontSize: 14 }}>← Products</a>
        <h2 style={{ margin: 0, fontSize: 22, flex: 1 }}>🪨 Granite Stock</h2>
        <span className="badge">{rows.length} items</span>
        <button className="btn btn-secondary no-print" onClick={() => window.print()}>🖨️ Print</button>
      </div>

      {/* Search */}
      <div className="no-print" style={{ padding: '0 16px 16px' }}>
        <input
          type="search"
          placeholder="Search granite products..."
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
            <th style={{ minWidth: 180 }}>SIZE</th>
            <th>STOCK (SQ FT)</th>
            <th>STOCK (PCS)</th>
            <th>SUPPLIER</th>
            <th className="no-print">ACTIONS</th>
          </tr>
        </thead>

        <tbody>
          {filtered.length === 0 && (
            <tr>
              <td colSpan={6} style={{ textAlign: 'center', padding: 48, color: '#6b7280' }}>
                No granite products found.
              </td>
            </tr>
          )}
          {filtered.map((p) => {
            const d = getDelta(p.id)
            const previewPcs = p.stock_pcs + d.pcs
            const previewSqft = p.stock_sqft + d.sqft

            return (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.size}</td>

                <td className={previewSqft < 0 ? 'low-stock' : ''} style={{ fontWeight: 600 }}>
                  {previewSqft}
                </td>

                <td className={previewPcs < 0 ? 'low-stock' : ''} style={{ fontWeight: 600, color: previewPcs > 0 ? '#1e40af' : undefined }}>
                  {previewPcs}
                </td>

                <td>{p.supplier_name ?? '-'}</td>

                <td className="no-print">
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', whiteSpace: 'nowrap' }}>
                    <input
                      type="number"
                      value={d.sqft || ''}
                      placeholder="sq ft"
                      onChange={(e) => setSqftDelta(p.id, parseFloat(e.target.value) || 0)}
                      style={{
                        width: 60,
                        padding: '3px 4px',
                        textAlign: 'center',
                        borderRadius: 6,
                        border: '1px solid #d0d7de',
                        fontSize: 13,
                      }}
                    />

                    <button className="btn-icon" style={{ width: 28, height: 28, fontSize: 16, marginLeft: 8 }} onClick={() => changePcs(p.id, -1)}>−</button>
                    <input
                      type="number"
                      value={d.pcs || ''}
                      placeholder="pcs"
                      onChange={(e) => setPcsDelta(p.id, parseInt(e.target.value) || 0)}
                      style={{
                        width: 48,
                        padding: '3px 4px',
                        textAlign: 'center',
                        borderRadius: 6,
                        border: '1px solid #93c5fd',
                        fontSize: 13,
                        backgroundColor: '#eff6ff',
                      }}
                    />
                    <button className="btn-icon" style={{ width: 28, height: 28, fontSize: 16 }} onClick={() => changePcs(p.id, 1)}>+</button>

                    {hasDelta(p.id) && (
                      <button
                        className="btn-primary"
                        onClick={() => save(p)}
                        disabled={savingId === p.id}
                        style={{ padding: '4px 10px', fontSize: 13 }}
                      >
                        Save
                      </button>
                    )}

                    <a
                      href={`/products/${p.id}`}
                      onClick={() => saveScroll('granite-scroll')}
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
