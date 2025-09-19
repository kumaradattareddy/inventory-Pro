'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CubeIcon,
  UsersIcon,
  ReceiptPercentIcon,
} from '@heroicons/react/24/outline'

export function SidebarNavItem({
  href,
  icon,
  children,
}: {
  href: string
  icon: 'cube' | 'users' | 'purchases'
  children: string
}) {
  const pathname = usePathname()
  const active = pathname.startsWith(href)

  const Icon =
    icon === 'cube'
      ? CubeIcon
      : icon === 'users'
      ? UsersIcon
      : icon === 'purchases'
      ? ReceiptPercentIcon
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
