/**
 * Composant Cloche de Notifications
 */

import { useState, useEffect, useRef } from 'react';
import { Bell, X, Check, CheckCheck, FileText, AlertTriangle } from 'lucide-react';
import { 
  getUnreadCount, 
  getUnreadNotifications, 
  markAsRead, 
  markAllAsRead,
  type Notification 
} from '../services/notificationService';
import { useNavigate } from 'react-router-dom';
import './NotificationBell.css';

interface NotificationBellProps {
  userId: number;
}

const NOTIFICATION_ICONS: Record<string, React.ReactNode> = {
  insurance_report_assigned: <FileText size={16} className="icon-blue" />,
  insurance_report_correction: <AlertTriangle size={16} className="icon-orange" />,
  insurance_report_submitted: <Check size={16} className="icon-green" />,
  default: <Bell size={16} />
};

export function NotificationBell({ userId }: NotificationBellProps) {
  const navigate = useNavigate();
  const [count, setCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Charger le compteur toutes les 30 secondes
  useEffect(() => {
    const loadCount = async () => {
      try {
        const unreadCount = await getUnreadCount(userId);
        setCount(unreadCount);
      } catch (e) {
        console.error('[NotificationBell] Erreur:', e);
      }
    };

    loadCount();
    const interval = setInterval(loadCount, 30000);
    return () => clearInterval(interval);
  }, [userId]);

  // Fermer le dropdown quand on clique ailleurs
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleToggle = async () => {
    if (!isOpen) {
      setLoading(true);
      try {
        const notifs = await getUnreadNotifications(userId);
        setNotifications(notifs);
      } catch (e) {
        console.error('[NotificationBell] Erreur chargement:', e);
      } finally {
        setLoading(false);
      }
    }
    setIsOpen(!isOpen);
  };

  const handleNotificationClick = async (notif: Notification) => {
    await markAsRead(notif.id);
    setCount(prev => Math.max(0, prev - 1));
    setNotifications(prev => prev.filter(n => n.id !== notif.id));
    setIsOpen(false);
    
    if (notif.link) {
      navigate(notif.link);
    }
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead(userId);
    setCount(0);
    setNotifications([]);
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "À l'instant";
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    if (diffHours < 24) return `Il y a ${diffHours}h`;
    return `Il y a ${diffDays}j`;
  };

  return (
    <div className="notification-bell" ref={dropdownRef}>
      <button className="bell-button" onClick={handleToggle}>
        <Bell size={20} />
        {count > 0 && (
          <span className="badge">{count > 9 ? '9+' : count}</span>
        )}
      </button>

      {isOpen && (
        <div className="notification-dropdown">
          <div className="dropdown-header">
            <h4>Notifications</h4>
            {notifications.length > 0 && (
              <button className="mark-all-read" onClick={handleMarkAllRead}>
                <CheckCheck size={16} />
                Tout marquer lu
              </button>
            )}
          </div>

          <div className="notification-list">
            {loading ? (
              <div className="loading">Chargement...</div>
            ) : notifications.length === 0 ? (
              <div className="empty">
                <Bell size={32} />
                <p>Aucune notification</p>
              </div>
            ) : (
              notifications.map(notif => (
                <div 
                  key={notif.id} 
                  className="notification-item"
                  onClick={() => handleNotificationClick(notif)}
                >
                  <div className="notif-icon">
                    {NOTIFICATION_ICONS[notif.type] || NOTIFICATION_ICONS.default}
                  </div>
                  <div className="notif-content">
                    <strong>{notif.title}</strong>
                    {notif.message && <p>{notif.message}</p>}
                    <span className="notif-time">{formatTime(notif.created_at)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
