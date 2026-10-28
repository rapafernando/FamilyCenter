'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Heart, ShoppingBasket } from 'lucide-react';
import { errMsg, useApp, useNotice } from '@/lib/ctx';
import { data } from '@/lib/data';
import { useQuery } from '@/lib/data/hooks';
import { PageHeader } from '@/components/shell/AppShell';
import { Banner } from '@/components/ui/misc';
import { Button, Field } from '@/components/ui/controls';
import { ChoiceDialog } from '@/components/ui/dialogs';
import { SkeletonList } from '@/components/ui/skeleton';

const box = 'rounded-md border-2 border-line-input bg-surface p-3 text-base text-ink';

export function RecipeView({ recipeId }: { recipeId?: string }) {
  const router = useRouter(); const notify = useNotice(); const { unlocked, isAdult } = useApp();
  const q = useQuery(() => (recipeId ? data.getRecipe(recipeId) : Promise.resolve(null)), [recipeId]);
  const [f, setF] = useState({ title: '', category: '', description: '', ingredients: '', instructions: '', favorite: false });
  const [ready, setReady] = useState(!recipeId); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [ask, setAsk] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  useEffect(() => { if (q.data && !ready) { const r = q.data; setF({ title: r.title, category: r.category, description: r.description, ingredients: r.ingredients.map((i) => i.text).join('\n'), instructions: r.instructions, favorite: r.favorite }); setReady(true); } }, [q.data, ready]);

  async function save() {
    setBusy(true); setErr('');
    try {
      const body = { title: f.title, category: f.category, description: f.description, instructions: f.instructions, favorite: f.favorite, ingredients: f.ingredients.split('\n').map((text) => ({ text })) };
      await data.saveRecipe(recipeId ? { ...body, id: recipeId } : body);
      notify({ tone: 'success', title: 'Recipe saved' }); router.push('/recipes');
    } catch (e) { setErr(errMsg(e)); setBusy(false); }
  }
  async function toGrocery() {
    try { const r = await data.recipeToGrocery(recipeId!); notify({ tone: 'success', title: r.added ? `Added ${r.added} to Groceries` : 'Everything is already on the list', body: r.skipped ? `${r.skipped} already there.` : undefined }); }
    catch (e) { setErr(errMsg(e)); }
  }
  if (recipeId && !q.loading && q.error) return <><PageHeader title="Recipe" back={{ href: '/recipes', label: 'Recipes' }} /><Banner tone="warning" title="This recipe is gone">It may have been deleted on another screen. <Link className="underline" href="/recipes">Back to recipes</Link></Banner></>;
  if (!ready) return <SkeletonList rows={5} />;
  const lines = f.ingredients.split('\n').filter((l) => l.trim()).length;
  return (
    <form className="mx-auto flex max-w-[40rem] flex-col gap-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <PageHeader title={recipeId ? 'Edit recipe' : 'New recipe'} back={{ href: '/recipes', label: 'Recipes' }} />
      {err && <Banner tone="danger" title="That did not work">{err}</Banner>}
      <fieldset disabled={!isAdult} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
      <Field label="Name" required value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Weeknight tacos" />
      <Field label="Category" value={f.category} onChange={(e) => set('category', e.target.value)} placeholder="Dinner" />
      <Field label="Short description" value={f.description} onChange={(e) => set('description', e.target.value)} />
      <div className="flex flex-col gap-1"><label htmlFor="ing" className="text-sm font-bold">Ingredients</label><textarea id="ing" rows={6} aria-describedby="ing-hint" value={f.ingredients} onChange={(e) => set('ingredients', e.target.value)} className={box} />
        <p id="ing-hint" className="text-sm text-muted">One per line. {lines} {lines === 1 ? 'ingredient' : 'ingredients'}.</p></div>
      <div className="flex flex-col gap-1"><label htmlFor="steps" className="text-sm font-bold">Steps</label><textarea id="steps" rows={6} value={f.instructions} onChange={(e) => set('instructions', e.target.value)} className={box} /></div>
      <label className="flex min-h-target items-center gap-3 font-bold text-ink"><input type="checkbox" checked={f.favorite} onChange={(e) => set('favorite', e.target.checked)} className="h-6 w-6 accent-accent" /><Heart aria-hidden className="h-5 w-5" />Favorite</label>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        {isAdult && <Button type="submit" size="lg" loading={busy}>Save recipe</Button>}
        <Button type="button" variant="secondary" size="lg" onClick={() => router.back()}>{isAdult ? 'Cancel' : 'Close'}</Button>
        {recipeId && isAdult && <Button type="button" variant="secondary" size="lg" onClick={toGrocery}><ShoppingBasket aria-hidden className="h-5 w-5" />Add to groceries</Button>}
        {recipeId && unlocked && <Button type="button" variant="ghost" className="ml-auto text-danger" onClick={() => setAsk(true)}>Delete</Button>}
      </div>
      <ChoiceDialog open={ask} danger title="Delete this recipe?" detail="Meals that used it stay on the plan as plain text." choices={[{ value: 'go', label: 'Delete recipe' }]}
        onChoose={async () => { try { await data.deleteRecipe(recipeId!); router.push('/recipes'); } catch (e) { setErr(errMsg(e)); setAsk(false); } }} onCancel={() => setAsk(false)} />
    </form>
  );
}
