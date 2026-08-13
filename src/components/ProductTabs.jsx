import React from 'react'
import { Layers, Zap, Workflow, Cloud, Sparkles } from 'lucide-react'

export default function ProductTabs({ activeProduct, onSelectProduct, productStats }) {
  const products = [
    {
      id: 'all',
      name: 'All Products',
      shortName: 'Global Hub',
      icon: Layers,
      color: '#008DC7',
      accentBg: 'rgba(0, 141, 199, 0.15)',
      badge: 'Unified',
      desc: 'All Magic Enterprise Software'
    },
    {
      id: 'xpa',
      name: 'Magic xpa',
      shortName: 'Application Platform',
      icon: Zap,
      color: '#f59e0b',
      accentBg: 'rgba(245, 158, 11, 0.15)',
      badge: 'v4.9.1 / v4.8',
      desc: 'Low-Code Web, RIA & Mobile Studio'
    },
    {
      id: 'xpi',
      name: 'Magic xpi',
      shortName: 'Integration Platform',
      icon: Workflow,
      color: '#06b6d4',
      accentBg: 'rgba(6, 182, 212, 0.15)',
      badge: 'v4.14.1 / v4.13',
      desc: 'Enterprise iPaaS & GigaSpaces Grid'
    },
    {
      id: 'cloud_native',
      name: 'Cloud Native',
      shortName: 'Modernization',
      icon: Cloud,
      color: '#10b981',
      accentBg: 'rgba(16, 185, 129, 0.15)',
      badge: 'Cloud v2.0',
      desc: 'Microservices & Containerization'
    }
  ]

  return (
    <div className="product-tabs-container" style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', padding: '4px', scrollbarWidth: 'none' }}>
      {products.map((p) => {
        const Icon = p.icon
        const isActive = activeProduct === p.id
        const count = productStats ? (p.id === 'all' ? productStats.total_documents : (productStats.products?.[p.id]?.count || 0)) : null

        return (
          <button
            key={p.id}
            onClick={() => onSelectProduct(p.id)}
            className={`product-tab-btn ${isActive ? 'active' : ''}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 16px',
              borderRadius: '10px',
              background: isActive 
                ? `linear-gradient(135deg, ${p.accentBg}, rgba(255,255,255,0.04))`
                : 'rgba(255, 255, 255, 0.03)',
              border: isActive ? `1px solid ${p.color}` : '1px solid rgba(255, 255, 255, 0.07)',
              color: isActive ? '#ffffff' : '#9ca3af',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              whiteSpace: 'nowrap',
              position: 'relative',
              boxShadow: isActive ? `0 4px 20px ${p.accentBg}` : 'none'
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '26px',
                height: '26px',
                borderRadius: '7px',
                background: isActive ? p.accentBg : 'rgba(255,255,255,0.05)',
                color: isActive ? p.color : '#9ca3af'
              }}
            >
              <Icon size={16} />
            </div>

            <div style={{ textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.88rem', fontWeight: 600, color: isActive ? '#ffffff' : '#e5e7eb' }}>
                  {p.name}
                </span>
                {count !== null && (
                  <span
                    style={{
                      fontSize: '0.72rem',
                      padding: '1px 6px',
                      borderRadius: '10px',
                      background: isActive ? p.color : 'rgba(255,255,255,0.1)',
                      color: isActive ? '#000' : '#d1d5db',
                      fontWeight: 700
                    }}
                  >
                    {count}
                  </span>
                )}
              </div>
              <span style={{ fontSize: '0.72rem', color: '#6b7280', display: 'block' }}>
                {p.shortName}
              </span>
            </div>

            {isActive && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '-1px',
                  left: '20%',
                  right: '20%',
                  height: '2px',
                  background: p.color,
                  borderRadius: '2px'
                }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
