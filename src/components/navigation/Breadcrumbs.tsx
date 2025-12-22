import { Link, useLocation } from 'wouter';
import { ChevronRight } from 'lucide-react';
import { routeLabels } from '@/lib/navigationItems';
import { cn } from '@/lib/utils';

const formatSegment = (segment: string) =>
  segment
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

export default function Breadcrumbs() {
  const [location] = useLocation();
  const path = location.split('?')[0].split('#')[0] || '/';
  const segments = path.split('/').filter(Boolean);

  const crumbs = [
    { label: 'Home', path: '/' },
    ...segments.map((segment, index) => {
      const fullPath = `/${segments.slice(0, index + 1).join('/')}`;
      return {
        label: routeLabels[fullPath] ?? formatSegment(segment),
        path: fullPath
      };
    })
  ];

  return (
    <div className="border-b border-border bg-background/80 px-6 py-2 text-xs text-muted-foreground sm:px-8 lg:px-12">
      <nav className="flex flex-wrap items-center gap-2" aria-label="Breadcrumb">
        {crumbs.map((crumb, index) => (
          <div key={crumb.path} className="flex items-center gap-2">
            {index > 0 && <ChevronRight className="h-3 w-3" />}
            <Link href={crumb.path}>
              <a
                className={cn(
                  'max-w-[10rem] truncate transition-colors hover:text-foreground',
                  index === crumbs.length - 1 && 'text-foreground'
                )}
              >
                {crumb.label}
              </a>
            </Link>
          </div>
        ))}
      </nav>
    </div>
  );
}
