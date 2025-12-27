'use client'

import { useRouter } from 'next/navigation'

export default function BackButton() {
  const router = useRouter()

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="btn-secondary"
      style={{ marginBottom: 16 }}
    >
      ← Back
    </button>
  )
}
