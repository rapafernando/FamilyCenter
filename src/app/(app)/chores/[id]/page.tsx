'use client';
import { use } from 'react';
import { ChoreForm } from '@/components/forms/ChoreForm';
export default function EditChore({ params }: { params: Promise<{ id: string }> }) { const { id } = use(params); return <ChoreForm taskId={id} />; }
