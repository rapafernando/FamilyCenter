import { notFound } from 'next/navigation';
import DesignClient from './DesignClient';
export const metadata = { title: 'Design system check' };
export const dynamic = 'force-dynamic';
/** An internal parts gallery. Hidden on a live site unless SHOW_DESIGN_PAGE=true. */
export default function Page() {
  if (process.env.NODE_ENV === 'production' && process.env.SHOW_DESIGN_PAGE !== 'true') notFound();
  return <DesignClient />;
}
