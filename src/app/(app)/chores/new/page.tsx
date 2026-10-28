'use client';
import { ChoreForm } from '@/components/forms/ChoreForm';
import { EditorsOnly } from '@/components/shell/AdultGate';
export default function NewChore() { return <EditorsOnly><ChoreForm /></EditorsOnly>; }
