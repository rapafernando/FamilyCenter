'use client';
import { RecipeView } from '@/components/forms/RecipeView';
import { EditorsOnly } from '@/components/shell/AdultGate';
export default function NewRecipe() { return <EditorsOnly><RecipeView /></EditorsOnly>; }
