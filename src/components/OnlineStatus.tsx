import React, { useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useUser } from '../contexts/UserContext';

// Hook to update user's online status
export const useOnlineStatus = () => {
  const { user } = useUser();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user) return;

    const updateStatus = async (isOnline: boolean) => {
      await supabase
        .from('users')
        .update({
          is_online: isOnline,
          last_seen: new Date().toISOString(),
        })
        .eq('id', user.id);
    };

    // Set online when component mounts
    updateStatus(true);

    // Update last_seen every 30 seconds while online
    intervalRef.current = setInterval(() => {
      updateStatus(true);
    }, 30000);

    // Handle page visibility change
    const handleVisibilityChange = () => {
      if (document.hidden) {
        updateStatus(false);
      } else {
        updateStatus(true);
      }
    };

    // Handle before unload
    const handleBeforeUnload = () => {
      // Use sendBeacon for reliable offline update
      const data = JSON.stringify({
        is_online: false,
        last_seen: new Date().toISOString(),
      });
      navigator.sendBeacon?.(
        `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/users?id=eq.${user.id}`,
        data
      );
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      updateStatus(false);
    };
  }, [user?.id]);
};

// Component to display online status badge
interface OnlineStatusBadgeProps {
  isOnline?: boolean;
  lastSeen?: string;
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
}

export const OnlineStatusBadge: React.FC<OnlineStatusBadgeProps> = ({
  isOnline = false,
  lastSeen,
  size = 'md',
  showText = false,
}) => {
  const sizeMap = {
    sm: '8px',
    md: '10px',
    lg: '12px',
  };

  const formatLastSeen = (date: string): string => {
    const now = new Date();
    const lastSeenDate = new Date(date);
    const diffMs = now.getTime() - lastSeenDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Vừa online';
    if (diffMins < 60) return `${diffMins} phút trước`;
    if (diffHours < 24) return `${diffHours} giờ trước`;
    if (diffDays < 7) return `${diffDays} ngày trước`;
    return lastSeenDate.toLocaleDateString('vi-VN');
  };

  return (
    <div className="d-flex align-items-center gap-1">
      <div
        style={{
          width: sizeMap[size],
          height: sizeMap[size],
          borderRadius: '50%',
          background: isOnline ? '#22c55e' : '#9ca3af',
          border: '2px solid white',
          boxShadow: isOnline ? '0 0 0 2px rgba(34, 197, 94, 0.3)' : 'none',
        }}
      />
      {showText && (
        <small className={isOnline ? 'text-success' : 'text-muted'}>
          {isOnline ? 'Đang online' : lastSeen ? formatLastSeen(lastSeen) : 'Offline'}
        </small>
      )}
    </div>
  );
};

export default OnlineStatusBadge;
