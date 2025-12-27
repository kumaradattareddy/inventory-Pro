'use client'

import { useEffect } from 'react'
import { restoreScroll } from '@/lib/scroll'
import ProductsTable from './products-table'

export default function ProductsPageClient({
  products,
}: {
  products: any[]
}) {
  useEffect(() => {
    restoreScroll('products-scroll')
  }, [])

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Products</h2>
      </div>

      <ProductsTable products={products} />
    </div>
  )
}
