import { createClient } from '@/lib/supabase/server'
import ProductsTable from './products-table'

type Product = {
  id: number
  name: string
  size: string
  unit: string
  current_stock: number
  supplier_name: string | null
}

export default async function ProductsPage() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('product_stock_live' as any)
    .select('*')
    .order('name')

  if (error) throw new Error(error.message)

  // ✅ SAFE, SINGLE CAST (view-only)
  const products = (data ?? []) as unknown as Product[]


  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Products</h2>
      </div>

      <div className="card-body">
        <ProductsTable products={products} />
      </div>
    </div>
  )
}
