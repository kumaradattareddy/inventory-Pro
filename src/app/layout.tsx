import type { Metadata } from 'next'
import './globals.css'
import { SidebarNavItem } from '@/components/SidebarNavItem'

export const metadata: Metadata = {
  title: 'Inventory Pro',
  description: 'Tiles & Granite Inventory App',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="app-layout">
        {/* Sidebar */}
        <aside className="sidebar">
          <div className="logo">Inventory</div>
          <nav className="nav">
            <SidebarNavItem href="/products" icon="cube">
              Products
            </SidebarNavItem>
            <SidebarNavItem href="/customers" icon="users">
              Customers
            </SidebarNavItem>
            <SidebarNavItem href="/parties" icon="users">
              Parties
            </SidebarNavItem>
            <SidebarNavItem href="/purchases" icon="purchases">
              Purchases
            </SidebarNavItem>
            <SidebarNavItem href="/sales" icon="sales">
              Sales
            </SidebarNavItem>
            <SidebarNavItem href="/advances" icon="advances">
              Advances
            </SidebarNavItem>
            
          </nav>
        </aside>

        {/* Main content */}
        <div className="main">
          <header className="header">
            <h1 className="header-title">Dashboard</h1>
          </header>
          <div className="content">{children}</div>
        </div>
      </body>
    </html>
  )
}
