export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" className="mx-auto flex min-h-screen w-full max-w-[34rem] flex-col justify-center gap-6 px-4 py-10">
      {children}
    </main>
  );
}
