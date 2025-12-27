import React, { useState, useEffect } from 'react';

type Notification = {
    id: string;
    type: 'info' | 'success' | 'warning' | 'error';
    title: string;
    message: string;
    timestamp: Date;
    read: boolean;
};

const STORAGE_KEY = 'dbs-notifications';

// Load notifications from localStorage
function loadNotifications(): Notification[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        return JSON.parse(raw).map((n: any) => ({ ...n, timestamp: new Date(n.timestamp) }));
    } catch {
        return [];
    }
}

// Save notifications to localStorage
function saveNotifications(notifications: Notification[]) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications.slice(0, 50)));
    } catch {
        // ignore
    }
}

export function useNotifications() {
    const [notifications, setNotifications] = useState<Notification[]>(() => loadNotifications());

    useEffect(() => {
        saveNotifications(notifications);
    }, [notifications]);

    const addNotification = (notif: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
        const newNotif: Notification = {
            ...notif,
            id: Date.now().toString(),
            timestamp: new Date(),
            read: false,
        };
        setNotifications(prev => [newNotif, ...prev]);
    };

    const markAsRead = (id: string) => {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    };

    const markAllAsRead = () => {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    };

    const clearAll = () => {
        setNotifications([]);
    };

    const unreadCount = notifications.filter(n => !n.read).length;

    return { notifications, addNotification, markAsRead, markAllAsRead, clearAll, unreadCount };
}

type NotificationCenterProps = {
    isOpen: boolean;
    onClose: () => void;
    notifications: Notification[];
    onMarkAsRead: (id: string) => void;
    onMarkAllAsRead: () => void;
    onClearAll: () => void;
};

export default function NotificationCenter({
    isOpen,
    onClose,
    notifications,
    onMarkAsRead,
    onMarkAllAsRead,
    onClearAll
}: NotificationCenterProps) {
    if (!isOpen) return null;

    const formatTime = (date: Date) => {
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const mins = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (mins < 1) return 'Just now';
        if (mins < 60) return `${mins}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return `${days}d ago`;
    };

    const getIcon = (type: Notification['type']) => {
        switch (type) {
            case 'success': return '✅';
            case 'warning': return '⚠️';
            case 'error': return '❌';
            default: return 'ℹ️';
        }
    };

    return (
        <>
            <div className="notification-overlay" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 999 }} />
            <div className="notification-center panel" style={{
                position: 'fixed',
                top: 60,
                right: 16,
                width: 360,
                maxHeight: 'calc(100vh - 100px)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                zIndex: 1000,
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            }}>
                <div className="notification-header" style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 16px',
                    borderBottom: '1px solid #333',
                }}>
                    <h4 style={{ margin: 0 }}>🔔 Notifications</h4>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="btn ghost small" onClick={onMarkAllAsRead} style={{ padding: '4px 8px', fontSize: 11 }}>
                            Mark all read
                        </button>
                        <button className="btn ghost small" onClick={onClearAll} style={{ padding: '4px 8px', fontSize: 11 }}>
                            Clear
                        </button>
                    </div>
                </div>

                <div className="notification-list" style={{ overflowY: 'auto', flex: 1 }}>
                    {notifications.length === 0 ? (
                        <div style={{ padding: 24, textAlign: 'center' }}>
                            <p className="muted">No notifications yet</p>
                        </div>
                    ) : (
                        notifications.map(notif => (
                            <div
                                key={notif.id}
                                className={`notification-item ${notif.read ? 'read' : 'unread'}`}
                                onClick={() => onMarkAsRead(notif.id)}
                                style={{
                                    padding: '12px 16px',
                                    borderBottom: '1px solid #222',
                                    cursor: 'pointer',
                                    background: notif.read ? 'transparent' : 'rgba(99, 102, 241, 0.1)',
                                }}
                            >
                                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                                    <span>{getIcon(notif.type)}</span>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: notif.read ? 'normal' : 'bold' }}>{notif.title}</div>
                                        <div className="muted small">{notif.message}</div>
                                        <div className="muted small" style={{ marginTop: 4 }}>{formatTime(notif.timestamp)}</div>
                                    </div>
                                    {!notif.read && <div style={{ width: 8, height: 8, background: '#6366f1', borderRadius: '50%' }} />}
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </>
    );
}
