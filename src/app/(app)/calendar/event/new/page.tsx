'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { EventForm } from '@/components/forms/EventForm';
function Inner() { const sp = useSearchParams(); return <EventForm startDate={sp.get('date') ?? undefined} />; }
export default function NewEvent() { return <Suspense fallback={null}><Inner /></Suspense>; }
