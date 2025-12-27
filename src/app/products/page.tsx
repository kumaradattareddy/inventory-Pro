import { createClient } from '@/lib/supabase/server'
import ProductsPageClient from './products-page-client'

type ProductRow = {
  id: number | null
  name: string | null
  size: string | null
  unit: string | null
  current_stock: number | null
  supplier_name: string | null
}

export default async function ProductsPage() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('product_stock_live' as any)
    .select('*')
    .not('id', 'is', null)
    .order('name')

  if (error) throw new Error(error.message)

  const products = ((data ?? []) as unknown as ProductRow[])
    .map((r) => {
      const id = Number(r.id)
      if (!Number.isFinite(id)) return null

      return {
        id,
        name: r.name ?? '',
        size: r.size ?? '',
        unit: r.unit ?? '',
        current_stock: Number(r.current_stock ?? 0),
        supplier_name: r.supplier_name ?? null,
      }
    })
    .filter(Boolean) as {
      id: number
      name: string
      size: string
      unit: string
      current_stock: number
      supplier_name: string | null
    }[]

  return <ProductsPageClient products={products} />
}
