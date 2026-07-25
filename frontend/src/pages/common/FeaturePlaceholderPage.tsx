import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Clock3 } from "lucide-react";

interface FeaturePlaceholderPageProps {
  title: string;
  description: string;
  backTo: string;
  backLabel: string;
  highlights?: string[];
}

export default function FeaturePlaceholderPage({
  title,
  description,
  backTo,
  backLabel,
  highlights = [],
}: FeaturePlaceholderPageProps) {
  return (
    <div className="mx-auto max-w-3xl space-y-6 text-left">
      <div className="enterprise-card card-hover-lift space-y-6 p-6 md:p-8">
        <div className="space-y-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl border border-brand-100 bg-brand-50 text-brand-700">
            <Clock3 className="h-6 w-6" aria-hidden="true" />
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-100 bg-brand-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-brand-700">
            Sắp ra mắt
          </span>
          <h2 className="font-display text-2xl font-black tracking-tight text-slate-950 md:text-3xl">{title}</h2>
          <p className="text-sm font-medium leading-7 text-slate-600 md:text-base">{description}</p>
        </div>

        {highlights.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {highlights.map((item) => (
              <div
                key={item}
                className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm font-semibold text-slate-700"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-3 pt-2 sm:flex-row">
          <Link
            to={backTo}
            className="btn-press inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-extrabold text-white transition-colors hover:bg-brand-700"
          >
            {backLabel}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  );
}
