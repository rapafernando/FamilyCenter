'use client';
import { Suspense, use } from 'react';
import { useSearchParams } from 'next/navigation';
import { EventForm } from '@/components/forms/EventForm';
function Inner({ id }: { id: string }) { const sp = useSearchParams(); return <EventForm eventId={id} rid={sp.get('rid') ?? undefined} />; }
export default function EditEvent({ params }: { params: Promise<{ id: string }> }) { const { id } = use(params); return <Suspense fallback={null}><Inner id={id} /></Suspense>; }
