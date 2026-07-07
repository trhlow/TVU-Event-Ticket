import { Link } from "react-router-dom";
import { ArrowRight, Info } from "lucide-react";

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
    <div className="max-w-3xl mx-auto space-y-6 text-left">
      <div className="bg-white rounded-2xl border border-gray-200 p-6 md:p-8 shadow-sm space-y-5">
        <div className="space-y-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-50 text-brand-700 text-[10px] font-black uppercase tracking-wider border border-brand-100">
            <Info className="w-3.5 h-3.5" /> Tính năng đang phát triển
          </span>
          <h2 className="text-xl md:text-2xl font-black text-gray-950 tracking-tight">
            {title}
          </h2>
          <p className="text-xs md:text-sm text-gray-600 font-medium leading-relaxed">
            {description}
          </p>
        </div>

        {highlights.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {highlights.map((item) => (
              <div
                key={item}
                className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-xs font-semibold text-gray-700"
              >
                {item}
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <Link
            to={backTo}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-xs font-extrabold text-white hover:bg-brand-700 transition-colors"
          >
            {backLabel} <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
