export type Notification = {
  id: string;
  type: 'reconciliation' | 'import' | 'system';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  actionUrl?: string;
};

export const initialNotifications: Notification[] = [
  {
    id: 'reconciliation-1',
    type: 'reconciliation',
    title: '3 unmatched transactions',
    message: 'Review the latest import for missing matches.',
    timestamp: '2m ago',
    read: false,
    actionUrl: '/transactions'
  },
  {
    id: 'import-1',
    type: 'import',
    title: 'Bank feed synced',
    message: 'January statement imported successfully.',
    timestamp: '1h ago',
    read: true,
    actionUrl: '/upload'
  },
  {
    id: 'system-1',
    type: 'system',
    title: 'Report ready',
    message: 'Monthly reconciliation summary is available.',
    timestamp: 'Yesterday',
    read: false,
    actionUrl: '/reports'
  }
];
