import { useEffect, useRef, useState } from 'react';
import { Bell, Check, AlertCircle, CloudUpload, Info } from 'lucide-react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { initialNotifications, Notification } from '@/lib/notifications';
import { cn } from '@/lib/utils';

const notificationIcon = (type: Notification['type']) => {
  if (type === 'reconciliation') return AlertCircle;
  if (type === 'import') return CloudUpload;
  return Info;
};

export default function NotificationCenter() {
  const [, setLocation] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState(initialNotifications);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const unreadCount = notifications.filter((notification) => !notification.read).length;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const markAllRead = () => {
    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
  };

  const handleSelect = (notification: Notification) => {
    setNotifications((prev) =>
      prev.map((item) =>
        item.id === notification.id ? { ...item, read: true } : item
      )
    );
    if (notification.actionUrl) {
      setLocation(notification.actionUrl);
    }
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={containerRef}>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Open notifications"
        className="relative"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-destructive" />
        )}
      </Button>

      {isOpen && (
        <Card className="absolute right-0 mt-2 w-80 overflow-hidden shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="text-sm font-semibold">Notifications</div>
            {unreadCount > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2"
                onClick={markAllRead}
              >
                <Check className="h-4 w-4" />
                Mark all read
              </Button>
            ) : (
              <Badge variant="secondary" className="text-[10px]">
                All caught up
              </Badge>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.map((notification) => {
              const Icon = notificationIcon(notification.type);
              return (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => handleSelect(notification)}
                  className={cn(
                    'flex w-full gap-3 px-4 py-3 text-left text-sm transition-colors',
                    notification.read ? 'bg-background' : 'bg-accent/40',
                    'hover:bg-accent/70'
                  )}
                >
                  <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground">
                        {notification.title}
                      </span>
                      {!notification.read && (
                        <Badge variant="secondary" className="text-[10px]">
                          New
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {notification.message}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {notification.timestamp}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
