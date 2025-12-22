import type { LucideIcon } from 'lucide-react';
import { LayoutDashboard, List, Crown, BarChart3, Upload } from 'lucide-react';

export type NavItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  group: 'primary' | 'secondary';
};

export const primaryNavItems: NavItem[] = [
  {
    label: 'Dashboard',
    path: '/',
    icon: LayoutDashboard,
    group: 'primary'
  },
  {
    label: 'Transactions',
    path: '/transactions',
    icon: List,
    group: 'primary'
  },
  {
    label: 'Kingdom',
    path: '/kingdom',
    icon: Crown,
    group: 'primary'
  },
  {
    label: 'Reports',
    path: '/reports',
    icon: BarChart3,
    group: 'primary'
  }
];

export const secondaryNavItems: NavItem[] = [
  {
    label: 'Upload',
    path: '/upload',
    icon: Upload,
    group: 'secondary'
  }
];

export const navItems = [...primaryNavItems, ...secondaryNavItems];

export const routeLabels: Record<string, string> = navItems.reduce(
  (acc, item) => {
    acc[item.path] = item.label;
    return acc;
  },
  {} as Record<string, string>
);
