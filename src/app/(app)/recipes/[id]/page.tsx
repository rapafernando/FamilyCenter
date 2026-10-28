'use client';
import { use } from 'react';
import { RecipeView } from '@/components/forms/RecipeView';
export default function Recipe({ params }: { params: Promise<{ id: string }> }) { const { id } = use(params); return <RecipeView recipeId={id} />; }
