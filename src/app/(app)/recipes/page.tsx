'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Heart } from 'lucide-react';
import { useQuery } from '@/lib/data/hooks';
import { data } from '@/lib/data/fake';
import { PageHeader } from '@/components/shell/AppShell';
import { Field, FabLink } from '@/components/ui/controls';
import { Banner } from '@/components/ui/misc';
import { Button } from '@/components/ui/controls';
import { SkeletonList } from '@/components/ui/skeleton';

export default function Recipes() {
  const q = useQuery(() => data.listRecipes(), []);
  const [find, setFind] = useState('');
  const list = (q.data ?? []).filter((r) => (r.title + ' ' + r.category).toLowerCase().includes(find.trim().toLowerCase()));
  return (
    <>
      <PageHeader title="Recipes" back={{ href: '/meals', label: 'Meals' }} />
      <div className="mb-3 max-w-[28rem]"><Field label="Search recipes" type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Tacos" /></div>
      {q.error && <Banner tone="danger" title="Could not load recipes" action={<Button size="sm" onClick={q.reload}>Try again</Button>}>Try again in a moment.</Banner>}
      {q.loading && !q.data && <SkeletonList rows={4} />}
      {q.data && q.data.length === 0 && (
        <div className="rounded-lg border-2 border-dashed border-line-input p-6 text-center"><p className="text-lg font-bold text-ink">No recipes yet</p><p className="mb-3 text-base text-muted">Save the dinners you make again and again.</p>
          <Link href="/recipes/new" className="inline-flex min-h-target items-center rounded-md bg-accent px-5 font-bold text-accent-on">Add a recipe</Link></div>
      )}
      {q.data && q.data.length > 0 && list.length === 0 && <p className="text-base text-muted" role="status">No recipe matches “{find}”.</p>}
      <ul className="m-0 grid list-none gap-3 p-0" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(16rem, 100%), 1fr))' }}>
        {list.map((r) => (
          <li key={r.id}>
            <Link href={`/recipes/${r.id}`} className="flex h-full flex-col gap-1 rounded-lg border-2 border-line bg-surface p-4">
              <span className="flex items-start justify-between gap-2"><span className="break-words font-display text-lg text-ink">{r.title}</span>{r.favorite && <Heart aria-label="Favorite" className="h-5 w-5 shrink-0 fill-current text-danger" />}</span>
              <span className="text-sm text-muted">{r.category || 'No category'} · {r.ingredients.length} {r.ingredients.length === 1 ? 'ingredient' : 'ingredients'}</span>
              {r.description && <span className="line-clamp-2 text-base text-ink">{r.description}</span>}
            </Link>
          </li>
        ))}
      </ul>
      <FabLink label="Add recipe" href="/recipes/new" />
    </>
  );
}
