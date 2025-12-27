'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

type Product = {
  id: number
  name: string
  size: string
  unit: string
  current_stock: number
  supplier_name: string | null
}

export default function ProductsPageClient({
  products,
}: {
  products: Product[]
}) {
  const [query, setQuery] = useState('')

  // Restore scroll position
  useEffect(() => {
    const y = sessionStorage.getItem('products-scroll')
    if (y) window.scrollTo(0, Number(y))
  }, [])

  const filtered = useMemo(() => {
    if (!query) return products
    const q = query.toLowerCase()

    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.size.toLowerCase().includes(q) ||
        (p.supplier_name ?? '').toLowerCase().includes(q)
    )
  }, [query, products])

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div className="card">
        <h2 style={{ marginBottom: 16 }}>Products</h2>

        <input
          className="search-input"
          placeholder="Search products..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <table className="table">
          <thead>
            <tr>
              <th>NAME</th>
              <th>SIZE</th>
              <th>CURRENT STOCK</th>
              <th>UNIT</th>
              <th>SUPPLIER</th>
              <th>ACTIONS</th>
            </tr>
          </thead>

          <tbody>
            {filtered.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.size}</td>
                <td className={p.current_stock < 0 ? 'neg' : ''}>
                  {p.current_stock}
                </td>
                <td>{p.unit}</td>
                <td>{p.supplier_name ?? '-'}</td>
                <td>
                  <Link
                    href={`/products/${p.id}`}
                    onClick={() =>
                      sessionStorage.setItem(
                        'products-scroll',
                        String(window.scrollY)
                      )
                    }
                  >
                    View
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
