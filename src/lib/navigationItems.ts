import type { LucideIcon } from 'lucide-react';
import { LayoutDashboard, List, Crown, BarChart3, Landmark, Settings } from 'lucide-react';

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
    label: 'Accounts Receivable',
    path: '/accounts-receivable',
    icon: Landmark,
    group: 'primary'
  },
  {
    label: 'Bank and Credit Card Reconciliation',
    path: '/kingdom',
    icon: Crown,
    group: 'primary'
  },
  {
    label: 'Reports',
    path: '/reports',
    icon: BarChart3,
    group: 'primary'
  },
  {
    label: 'Settings',
    path: '/settings',
    icon: Settings,
    group: 'primary'
  }
];

export const secondaryNavItems: NavItem[] = [
  
];

export const navItems = [...primaryNavItems, ...secondaryNavItems];

export const routeLabels: Record<string, string> = navItems.reduce(
  (acc, item) => {
    acc[item.path] = item.label;
    return acc;
  },
  {} as Record<string, string>
);
