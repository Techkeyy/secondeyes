'use client';

import { useParams } from 'next/navigation';
import { MandateView } from '@/components/MandateView';

export default function Page() {
  const { id } = useParams<{ id: string }>();
  if (!/^[0-9]+$/.test(id)) return <p>That is not a mandate number.</p>;
  return <MandateView id={Number(id)} />;
}
