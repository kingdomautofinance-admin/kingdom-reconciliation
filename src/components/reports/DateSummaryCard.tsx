import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ChevronRight } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

export interface DateSummary {
  date: string;
  reconciled_count: number;
  pending_count: number;
  total_count: number;
  reconciled_amount: number;
  pending_amount: number;
  total_amount: number;
  reconciliation_percentage: number;
}

export function getPercentageColor(percentage: number) {
  if (percentage === 100) return 'text-green-600 dark:text-green-400';
  if (percentage >= 80) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-orange-600 dark:text-orange-400';
}

export function getChartColors(percentage: number) {
  if (percentage === 0) return { fill: '#d1d5db', empty: '#f3f4f6' }; // Light grey for 0%
  if (percentage === 100) return { fill: '#16a34a', empty: '#dcfce7' }; // Dark green with light green bg
  if (percentage >= 71) return { fill: '#22c55e', empty: '#ffffff' }; // Light green with white bg
  if (percentage >= 41) return { fill: '#eab308', empty: '#fef9c3' }; // Yellow with light yellow bg
  return { fill: '#ef4444', empty: '#fee2e2' }; // Red with light red bg (1-40%)
}

export function getBackgroundColor(percentage: number | null) {
  if (percentage === null) return 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800';
  if (percentage === 100) return 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800';
  if (percentage >= 80) return 'bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800';
  if (percentage >= 1) return 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800';
  return 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800';
}

interface DateSummaryCardProps {
  summary: DateSummary;
  onClick: () => void;
}

export function DateSummaryCard({ summary, onClick }: DateSummaryCardProps) {
  const chartColors = getChartColors(summary.reconciliation_percentage);

  // Data for pie chart
  const chartData = [
    { name: 'Reconciled', value: summary.reconciled_count },
    { name: 'Pending', value: summary.pending_count },
  ];

  return (
    <Card
      className="p-4 hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-center gap-4">
        {/* Circular Progress Chart */}
        <div className="flex-shrink-0 w-12 h-12">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={14}
                outerRadius={22}
                paddingAngle={0}
                dataKey="value"
                startAngle={90}
                endAngle={-270}
              >
                <Cell fill={chartColors.fill} />
                <Cell fill={chartColors.empty} />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Date */}
        <div className="flex-shrink-0 w-32">
          <p className="text-sm text-muted-foreground">Date</p>
          <p className="font-semibold">{formatDate(summary.date)}</p>
        </div>

        {/* Reconciled */}
        <div className="flex-1 min-w-[120px]">
          <p className="text-sm text-muted-foreground">Reconciled</p>
          <p className="font-semibold text-green-600 dark:text-green-400">
            {summary.reconciled_count}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatCurrency(summary.reconciled_amount)}
          </p>
        </div>

        {/* Pending */}
        <div className="flex-1 min-w-[120px]">
          <p className="text-sm text-muted-foreground">Pending</p>
          <p className="font-semibold text-orange-600 dark:text-orange-400">
            {summary.pending_count}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatCurrency(summary.pending_amount)}
          </p>
        </div>

        {/* Total */}
        <div className="flex-1 min-w-[120px]">
          <p className="text-sm text-muted-foreground">Total</p>
          <p className="font-semibold">
            {summary.total_count}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatCurrency(summary.total_amount)}
          </p>
        </div>

        {/* Percentage Badge */}
        <div className="flex-shrink-0">
          <Badge
            variant="outline"
            className={`${getPercentageColor(summary.reconciliation_percentage)} border-current text-lg font-bold px-3 py-1`}
          >
            {summary.reconciliation_percentage}%
          </Badge>
        </div>

        {/* Arrow Icon */}
        <div className="flex-shrink-0">
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </div>
      </div>
    </Card>
  );
}
