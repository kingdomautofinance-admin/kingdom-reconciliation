import { Link } from 'wouter';
import { Upload, FileDown } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function QuickActions() {
  return (
    <div className="hidden sm:flex items-center gap-2">
      <Link href="/upload">
        <a className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }))}>
          <Upload className="h-4 w-4" />
          Upload
        </a>
      </Link>
      <Link href="/reports">
        <a className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))}>
          <FileDown className="h-4 w-4" />
          Export
        </a>
      </Link>
    </div>
  );
}
