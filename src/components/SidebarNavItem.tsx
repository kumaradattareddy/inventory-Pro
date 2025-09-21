'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CubeIcon,
  UsersIcon,
  ReceiptPercentIcon,
  ShoppingCartIcon,
} from '@heroicons/react/24/outline'

export function SidebarNavItem({
  href,
  icon,
  children,
}: {
  href: string
  icon: 'cube' | 'users' | 'purchases' | 'sales' | 'customers'
  children: string
}) {
  const pathname = usePathname()
  const active = pathname.startsWith(href)

  const Icon =
    icon === 'cube'
      ? CubeIcon
      : icon === 'users' || icon === 'customers'
      ? UsersIcon
      : icon === 'purchases'
      ? ReceiptPercentIcon
      : icon === 'sales'
      ? ShoppingCartIcon
      : CubeIcon // fallback

  return (
    <Link
      href={href}
      className={`nav-item ${active ? 'active' : ''}`}
    >
      <Icon className="icon" />
      <span>{children}</span>
    </Link>
  )
}
