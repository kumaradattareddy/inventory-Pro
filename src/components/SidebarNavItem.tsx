'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CubeIcon,
  UsersIcon,
  ReceiptPercentIcon,
  ShoppingCartIcon,
  BanknotesIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline'

export function SidebarNavItem({
  href,
  icon,
  children,
}: {
  href: string
  icon: 'cube' | 'users' | 'purchases' | 'sales' | 'customers' | 'advances' | 'bills'
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
      : icon === 'advances'
      ? BanknotesIcon
      : icon === 'bills'
      ? DocumentTextIcon
      : CubeIcon // Default icon


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
