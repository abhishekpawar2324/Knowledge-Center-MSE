import React from 'react'
import { Bell, Check, ExternalLink, Sparkles, FileText, CheckCheck, X } from 'lucide-react'

export default function NotificationFeed({ isOpen, onClose, notifications, unreadCount, onSelectDoc, onMarkAllRead, onMarkRead, onDismiss }) {
  if (!isOpen) return null

  // Only display active unread notifications
  const activeNotifications = (notifications || []).filter(n => !n.is_read)

  return (
    <div 
      style={{
        position: 'absolute',
        top: '60px',
        right: '20px',
        width: '380px',
        maxHeight: '480px',
        borderRadius: '14px',
        background: 'rgba(15, 23, 42, 0.96)',
        border: '1px solid rgba(0, 141, 199, 0.3)',
        boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
        zIndex: 9990,
        display: 'flex',
        flexDirection: 'column',
        backdropFilter: 'blur(16px)',
        overflow: 'hidden'
      }}
    >
      {/* Header */}
      <div 
        style={{
          padding: '12px 16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(0, 86, 140, 0.15)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bell size={18} style={{ color: '#2DBCEE' }} />
          <h4 style={{ fontSize: '0.92rem', fontWeight: 700, color: '#ffffff' }}>
            Knowledge Center Alerts
          </h4>
          {unreadCount > 0 && (
            <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '1px 6px', borderRadius: '10px', background: '#008DC7', color: '#fff' }}>
              {unreadCount} new
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {unreadCount > 0 && (
            <button
              onClick={onMarkAllRead}
              title="Mark all as read"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#38bdf8',
                fontSize: '0.75rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <CheckCheck size={14} /> Read all
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#9ca3af',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Notifications List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
        {activeNotifications && activeNotifications.length > 0 ? (
          activeNotifications.map((n) => (
            <div
              key={n.id}
              onClick={() => {
                if (n.doc_id) onSelectDoc(n.doc_id)
                if (onMarkRead) onMarkRead(n.id)
                onClose()
              }}
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                marginBottom: '6px',
                background: 'rgba(0, 141, 199, 0.12)',
                border: '1px solid rgba(0, 141, 199, 0.25)',
                cursor: n.doc_id ? 'pointer' : 'default',
                transition: 'all 0.2s',
                position: 'relative'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(0, 141, 199, 0.2)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(0, 141, 199, 0.12)'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(255, 255, 255, 0.1)', color: '#2DBCEE', fontWeight: 600, textTransform: 'uppercase' }}>
                  {n.product}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                    {n.timestamp || n.created_at}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (onDismiss) onDismiss(n.id)
                    }}
                    title="Dismiss notification"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: '#94a3b8',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      lineHeight: 1,
                      padding: '2px',
                      borderRadius: '4px'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#f43f5e')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#94a3b8')}
                  >
                    ✕
                  </button>
                </div>
              </div>
              <h5 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc', marginBottom: '2px' }}>
                {n.title}
              </h5>
              <p style={{ fontSize: '0.78rem', color: '#cbd5e1', lineHeight: 1.4 }}>
                {n.message}
              </p>
            </div>
          ))
        ) : (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
            ✓ All caught up! No unread notifications.
          </div>
        )}
      </div>
    </div>
  )
}
