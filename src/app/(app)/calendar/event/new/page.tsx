'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { EventForm } from '@/components/forms/EventForm';
import { EditorsOnly } from '@/components/shell/AdultGate';
function Inner() { const sp = useSearchParams(); return <EditorsOnly><EventForm startDate={sp.get('date') ?? undefined} /></EditorsOnly>; }
export default function NewEvent() { return <Suspense fallback={null}><Inner /></Suspense>; }
