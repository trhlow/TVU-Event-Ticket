interface PageGreetingProps {
  name?: string;
}

export default function PageGreeting({ name = "Nguyễn Văn A" }: PageGreetingProps) {
  return (
    <div className="mb-5 border-b border-slate-200/80 bg-white/72 px-4 py-4 shadow-sm shadow-slate-900/[0.02] backdrop-blur sm:px-5 lg:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">TVU EVENT &amp; TICKETING</p>
      <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">Xin chào, {name}</h1>
    </div>
  );
}
