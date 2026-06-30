'use client'

import { useEffect, useMemo, useState, useRef } from 'react'
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
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([])
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [delta, setDelta] = useState<Record<number, number>>({})
  const [savingId, setSavingId] = useState<number | null>(null)
  const [visibleCount, setVisibleCount] = useState(100)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
      }
    }
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isDropdownOpen])

  // Extract unique suppliers for the dropdown
  const suppliers = useMemo(() => {
    const set = new Set<string>()
    rows.forEach(r => {
      if (r.supplier_name) set.add(r.supplier_name)
    })
    return Array.from(set).sort()
  }, [rows])

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

  // Reset visible count when search or filter changes
  useEffect(() => {
    setVisibleCount(100)
  }, [debouncedQuery, selectedSuppliers])

  // ✅ FILTER ONLY WHEN DEBOUNCED QUERY OR SUPPLIER CHANGES
  const filtered = useMemo(() => {
    return rows.filter((p) => {
      if (selectedSuppliers.length > 0 && (!p.supplier_name || !selectedSuppliers.includes(p.supplier_name))) {
        return false
      }
      if (debouncedQuery) {
        if (!`${p.name} ${p.size} ${p.supplier_name ?? ''}`.toLowerCase().includes(debouncedQuery)) {
          return false
        }
      }
      return true
    })
  }, [rows, debouncedQuery, selectedSuppliers])

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
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-table { width: 100%; border-collapse: collapse; }
          .print-table th, .print-table td { padding: 8px; border: 1px solid #ddd; }
        }
      `}</style>

      {/* Header with Granite button */}
      <div className="no-print" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 style={{ margin: 0, flex: 1 }}>Products</h2>
        {selectedSuppliers.length > 0 && (
          <button 
            className="btn btn-secondary" 
            onClick={() => {
              // Force load ALL products for this supplier into the DOM before printing
              setVisibleCount(filtered.length)
              // Wait 100ms for React to actually render them before opening the print dialog
              setTimeout(() => window.print(), 100)
            }}
            style={{ fontWeight: 600 }}
          >
            🖨️ Print
          </button>
        )}
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

      {/* Search Bar & Filter */}
      <div className="no-print" style={{ padding: '0 16px 16px', display: 'flex', gap: '16px' }}>
        <input
          type="search"
          placeholder="Search products..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            flex: 1,
            padding: '12px 14px',
            borderRadius: 8,
            border: '1px solid #d0d7de',
            fontSize: 15,
            outline: 'none',
          }}
        />
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          <button 
            className="btn" 
            style={{ 
              backgroundColor: 'white', 
              border: '1px solid #d0d7de',
              padding: '12px 14px',
              borderRadius: 8,
              fontSize: 15,
              color: '#1f2937',
              minWidth: '200px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          >
            <span>{selectedSuppliers.length === 0 ? 'All Suppliers' : `${selectedSuppliers.length} Suppliers Selected`}</span>
            <span style={{ fontSize: 12 }}>▼</span>
          </button>
          
          {isDropdownOpen && (
            <div style={{ 
              position: 'absolute', 
              top: '100%', 
              right: 0, 
              marginTop: 4, 
              backgroundColor: 'white', 
              border: '1px solid #d0d7de', 
              borderRadius: 8, 
              padding: '8px 0', 
              zIndex: 10, 
              maxHeight: 300, 
              overflowY: 'auto', 
              minWidth: 220, 
              boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' 
            }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}>
                <input 
                  type="checkbox" 
                  checked={selectedSuppliers.length === 0}
                  onChange={() => setSelectedSuppliers([])}
                  style={{ width: 16, height: 16 }}
                />
                <span style={{ fontWeight: 600 }}>All Suppliers</span>
              </label>
              {suppliers.map(s => (
                <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 16px', cursor: 'pointer', backgroundColor: 'transparent' }} onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                  <input 
                    type="checkbox" 
                    checked={selectedSuppliers.includes(s)}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedSuppliers(prev => [...prev, s]);
                      else setSelectedSuppliers(prev => prev.filter(x => x !== s));
                    }}
                    style={{ width: 16, height: 16 }}
                  />
                  {s}
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <table className="table print-table">
        <thead>
          <tr>
            <th>NAME</th>
            <th style={{ minWidth: 200 }}>SIZE</th>
            <th>CURRENT STOCK</th>
            <th>UNIT</th>
            <th>SUPPLIER</th>
            <th className="no-print">ACTIONS</th>
          </tr>
        </thead>

        <tbody>
          {filtered.slice(0, visibleCount).map((p) => {
            const d = delta[p.id] ?? 0
            const preview = p.current_stock + d

            return (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.size}</td>

                <td>
                  {preview < 0 ? (
                    <span
                      style={{
                        backgroundColor: '#fee2e2',
                        color: '#991b1b',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        border: '1px solid #fecaca'
                      }}
                    >
                      ⚠️ {preview}
                    </span>
                  ) : (
                    <span style={{ fontWeight: 500 }}>{preview}</span>
                  )}
                </td>

                <td><span className="badge">{p.unit}</span></td>
                <td>{p.supplier_name ?? '-'}</td>

                <td className="no-print">
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

      {visibleCount < filtered.length && (
        <div className="no-print" style={{ textAlign: "center", padding: "12px 0" }}>
          <button
            className="btn btn-sm btn-secondary"
            onClick={() => setVisibleCount((v) => v + 100)}
            style={{ minWidth: 160 }}
          >
            Show more ({filtered.length - visibleCount} remaining)
          </button>
        </div>
      )}
    </>
  )
}
