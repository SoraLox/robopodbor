import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

/** Марка бренда: чёрный скруглённый квадрат с двумя диагональными штрихами. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg className={className} width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden>
      <rect width="28" height="28" rx="7" fill="currentColor" />
      <path
        d="M8.5 18.5L13.5 9.5M14.5 18.5L19.5 9.5"
        stroke="#fff"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Логотип-ссылка на главную: одинаковый в шапке и подвале. */
export function BrandLink({ className }: { className?: string }) {
  return (
    <Link to="/" className={cn('inline-flex items-center gap-2 text-foreground', className)}>
      <BrandMark className="size-6 shrink-0 text-primary-bright" />
      <span className="text-control font-semibold tracking-[-0.01em]">
        РОБОПОДБОР<span className="text-primary-bright">.</span>
      </span>
    </Link>
  );
}
