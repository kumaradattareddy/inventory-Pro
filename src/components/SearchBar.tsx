'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function SearchBar({ placeholder }: { placeholder?: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [value, setValue] = useState(searchParams.get('q') ?? '')

  useEffect(() => {
    setValue(searchParams.get('q') ?? '')
  }, [searchParams])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setValue(val)

    const params = new URLSearchParams(searchParams.toString())
    if (val) params.set('q', val)
    else params.delete('q')
    router.replace(`${pathname}?${params.toString()}`)
  }

  return (
    <input
      type="text"
      className="search-input"
      placeholder={placeholder ?? 'Search...'}
      value={value}
      onChange={handleChange}
    />
  )
}
