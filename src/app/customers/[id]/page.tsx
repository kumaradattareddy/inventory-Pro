// src/app/customers/[id]/page.tsx
import CustomerDetailClient from "./CustomerDetailClient";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params; // ✅ unwrap Next.js 15 params Promise
  return <CustomerDetailClient id={id} />;
}
