import React, { useEffect, useState } from 'react';
import { BookOpen, HandHeart, ImageIcon, Music, Sparkles, Trophy } from 'lucide-react';
import LoadingSkeleton from '../common/LoadingSkeleton';

interface EventBannerProps {
  src?: string;
  alt: string;
  category: string;
  className?: string;
  imageClassName?: string;
}

function getCategoryIcon(category: string) {
  if (category.includes('Văn')) return Music;
  if (category.includes('Cuộc')) return Trophy;
  if (category.includes('Tình')) return HandHeart;
  if (category.includes('Kỹ')) return Sparkles;
  if (category.includes('Học')) return BookOpen;
  return ImageIcon;
}

export default function EventBanner({
  src,
  alt,
  category,
  className = 'h-44 w-full',
  imageClassName = '',
}: EventBannerProps) {
  const [isLoading, setIsLoading] = useState(Boolean(src));
  const [hasError, setHasError] = useState(!src);
  const Icon = getCategoryIcon(category);

  useEffect(() => {
    setIsLoading(Boolean(src));
    setHasError(!src);
  }, [src]);

  return (
    <div className={`relative bg-brand-900 overflow-hidden ${className}`}>
      {isLoading && <LoadingSkeleton type="banner" />}

      {!hasError && src && (
        <img
          src={src}
          alt={alt}
          className={`absolute inset-0 w-full h-full object-cover transition-all duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'} ${imageClassName}`}
          referrerPolicy="no-referrer"
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setHasError(true);
            setIsLoading(false);
          }}
        />
      )}

      {hasError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-brand-800 via-brand-600 to-brand-500 text-white">
          <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_left,_white,_transparent_30%)]" />
          <div className="relative flex flex-col items-center gap-3 px-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shadow-lg">
              <Icon className="w-7 h-7 text-accent-500" />
            </div>
            <span className="text-xs font-black uppercase tracking-widest">{category}</span>
          </div>
        </div>
      )}
    </div>
  );
}
