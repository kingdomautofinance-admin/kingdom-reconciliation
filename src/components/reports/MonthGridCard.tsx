import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { DateSummary } from './DateSummaryCard';

interface MonthGridCardProps {
  month: number;
  year: number;
  monthName: string;
  summaries: DateSummary[];
  onClick: () => void;
}

export function MonthGridCard({ month, year, monthName, summaries, onClick }: MonthGridCardProps) {
  // Calculate month-level statistics
  const hasData = summaries.length > 0;

  const stats = hasData
    ? {
        hasDiscrepancies: summaries.some((s) => s.reconciliation_percentage < 100),
        avgPercentage: Math.round(
          summaries.reduce((sum, s) => sum + s.reconciliation_percentage, 0) / summaries.length
        ),
        totalTransactions: summaries.reduce((sum, s) => sum + s.total_count, 0),
        totalDays: summaries.length,
      }
    : null;

  // Determine badge variant and text based on stats
  const getBadgeInfo = () => {
    if (!stats) {
      return {
        variant: 'secondary' as const,
        text: 'No Data',
        className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
      };
    }

    if (!stats.hasDiscrepancies && stats.avgPercentage === 100) {
      return {
        variant: 'default' as const,
        text: 'Clean',
        className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      };
    }

    if (stats.avgPercentage >= 80) {
      return {
        variant: 'secondary' as const,
        text: 'Has Issues',
        className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
      };
    }

    return {
      variant: 'destructive' as const,
      text: 'Has Issues',
      className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    };
  };

  const badgeInfo = getBadgeInfo();

  // Determine card background color based on status
  const getCardBackgroundClass = () => {
    if (!stats) return 'bg-card';
    if (!stats.hasDiscrepancies && stats.avgPercentage === 100) {
      return 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800';
    }
    if (stats.avgPercentage >= 80) {
      return 'bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800';
    }
    return 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800';
  };

  return (
    <Card
      onClick={onClick}
      className={`cursor-pointer hover:shadow-lg transition-all ${getCardBackgroundClass()}`}
    >
      <CardHeader className="pb-3">
        <CardTitle className="text-base md:text-lg">{monthName}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-center justify-between">
          <Badge variant={badgeInfo.variant} className={badgeInfo.className}>
            {badgeInfo.text}
          </Badge>
          {stats && (
            <span className="text-sm font-semibold text-foreground">
              {stats.avgPercentage}%
            </span>
          )}
        </div>

        {stats && (
          <div className="text-xs text-muted-foreground space-y-1">
            <div>{stats.totalDays} days with data</div>
            <div>{stats.totalTransactions} transactions</div>
          </div>
        )}

        {!stats && (
          <div className="text-xs text-muted-foreground">
            No transactions this month
          </div>
        )}
      </CardContent>
    </Card>
  );
}
