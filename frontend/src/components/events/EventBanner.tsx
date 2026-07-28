import React, { useEffect, useState } from 'react';
import { ImageIcon } from 'lucide-react';
import LoadingSkeleton from '../common/LoadingSkeleton';
import { isSafeImageUrl } from '../../utils/safeImageUrl';

interface EventBannerProps {
  src?: string;
  alt: string;
  className?: string;
  imageClassName?: string;
}

export default function EventBanner({
  src,
  alt,
  className = 'h-44 w-full',
  imageClassName = '',
}: EventBannerProps) {
  // The banner URL is free text on the event form, so it can carry any scheme.
  // An unusable URL is treated exactly like a missing one: show the placeholder.
  const safeSrc = isSafeImageUrl(src) ? src : undefined;
  const [isLoading, setIsLoading] = useState(Boolean(safeSrc));
  const [hasError, setHasError] = useState(!safeSrc);

  useEffect(() => {
    setIsLoading(Boolean(safeSrc));
    setHasError(!safeSrc);
  }, [safeSrc]);

  return (
    <div className={`relative bg-brand-900 overflow-hidden ${className}`}>
      {isLoading && <LoadingSkeleton type="banner" />}

      {!hasError && safeSrc && (
        <img
          src={safeSrc}
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
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-brand-700 text-white">
          <div className="relative flex flex-col items-center gap-3 px-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-white/15 border border-white/20 flex items-center justify-center shadow-lg">
              <ImageIcon className="w-7 h-7 text-accent-500" />
            </div>
            <span className="line-clamp-2 text-xs font-black uppercase tracking-widest">{alt}</span>
          </div>
        </div>
      )}
    </div>
  );
}
