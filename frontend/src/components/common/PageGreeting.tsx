interface PageGreetingProps {
  name?: string;
}

export default function PageGreeting({ name = "Nguyễn Văn A" }: PageGreetingProps) {
  return (
    <div className="mb-5 border-b border-blue-100/80 bg-white/72 px-4 py-4 shadow-sm backdrop-blur sm:px-5 lg:px-6">
      <p className="text-xs font-bold uppercase tracking-[0.28em] text-blue-500/80">TVU EVENT &amp; TICKETING</p>
      <h1 className="mt-1 text-xl font-extrabold tracking-tight text-slate-950">Xin chào, {name}</h1>
    </div>
  );
}
