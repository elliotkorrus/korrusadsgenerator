import { useState, useRef, useEffect } from "react";

interface Props {
  src: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Lazy-loaded image thumbnail with fade-in effect.
 * Only loads when scrolled into viewport (IntersectionObserver).
 * Falls back to browser native lazy loading where IO isn't available.
 */
export default function LazyThumbnail({ src, alt = "", className, style }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [inView, setInView] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <img
      ref={ref}
      src={inView ? src : undefined}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={className}
      onLoad={() => setLoaded(true)}
      style={{
        ...style,
        opacity: loaded ? 1 : 0,
        transition: "opacity 0.2s ease-in",
      }}
    />
  );
}
