'use client';
import { use } from 'react';
import { ChoreForm } from '@/components/forms/ChoreForm';
import { EditorsOnly } from '@/components/shell/AdultGate';
export default function EditChore({ params }: { params: Promise<{ id: string }> }) { const { id } = use(params); return <EditorsOnly><ChoreForm taskId={id} /></EditorsOnly>; }
