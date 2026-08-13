import React from 'react'
import { 
  Zap, 
  Workflow, 
  Cloud, 
  FileText, 
  ArrowRight, 
  Star, 
  Layers
} from 'lucide-react'

export default function ProductHub({ activeProduct, onSelectProduct, onSelectDoc, overviewData }) {
  // Extract counts safely
  const xpaCount = (overviewData?.products && typeof overviewData.products.xpa === 'number') 
    ? overviewData.products.xpa 
    : (overviewData?.by_product?.xpa || 0)

  const xpiCount = (overviewData?.products && typeof overviewData.products.xpi === 'number') 
    ? overviewData.products.xpi 
    : (overviewData?.by_product?.xpi || 0)

  const cloudCount = (overviewData?.products && typeof overviewData.products.cloud_native === 'number') 
    ? overviewData.products.cloud_native 
    : (overviewData?.by_product?.cloud_native || 0)

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Welcome Banner */}
      <div style={{ padding: '4px 0 2px 0' }}>
        <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#ffffff', marginBottom: '4px' }}>
          Welcome to Magic Software Enterprise Knowledge Center
        </h2>
        <p style={{ fontSize: '0.88rem', color: '#94a3b8' }}>
          Your centralized technical portal for product manuals, connector guides, and cloud SOPs. Select a product below to search its documentation or explore all repositories.
        </p>
      </div>

      {/* 3 Clean Highlighted Product Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' }}>
        
        {/* Magic xpa Card */}
        <div 
          className="glass-panel glass-panel-hover" 
          style={{ padding: '22px', borderTop: '3px solid #f59e0b', cursor: 'pointer' }}
          onClick={() => onSelectProduct('xpa')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '1.3rem', fontBold: true, fontWeight: 800, color: '#fbbf24', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={20} style={{ color: '#f59e0b' }} /> Magic xpa
            </span>
            <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '12px', background: 'rgba(245,158,11,0.15)', color: '#fbbf24', fontWeight: 700 }}>
              {xpaCount} Articles
            </span>
          </div>
          <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Application Platform
          </div>
          <p style={{ fontSize: '0.84rem', color: '#94a3b8', marginBottom: '16px', lineHeight: 1.5 }}>
            Click here to search through Magic xpa documentation, Studio guides, Web RIA, and runtime deployment SOPs.
          </p>
          <span style={{ fontSize: '0.8rem', color: '#f59e0b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
            Explore Magic xpa Documentation →
          </span>
        </div>

        {/* Magic xpi Card */}
        <div 
          className="glass-panel glass-panel-hover" 
          style={{ padding: '22px', borderTop: '3px solid #06b6d4', cursor: 'pointer' }}
          onClick={() => onSelectProduct('xpi')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '1.3rem', fontWeight: 800, color: '#22d3ee', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Workflow size={20} style={{ color: '#06b6d4' }} /> Magic xpi
            </span>
            <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '12px', background: 'rgba(6,182,212,0.15)', color: '#22d3ee', fontWeight: 700 }}>
              {xpiCount} Articles
            </span>
          </div>
          <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Integration Platform (iPaaS)
          </div>
          <p style={{ fontSize: '0.84rem', color: '#94a3b8', marginBottom: '16px', lineHeight: 1.5 }}>
            Click here to search through Magic xpi documentation, 50+ enterprise connectors, Data Mapper, and GigaSpaces architecture.
          </p>
          <span style={{ fontSize: '0.8rem', color: '#06b6d4', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
            Explore Magic xpi Documentation →
          </span>
        </div>

        {/* Cloud Native Card */}
        <div 
          className="glass-panel glass-panel-hover" 
          style={{ padding: '22px', borderTop: '3px solid #10b981', cursor: 'pointer' }}
          onClick={() => onSelectProduct('cloud_native')}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '1.3rem', fontWeight: 800, color: '#34d399', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Cloud size={20} style={{ color: '#10b981' }} /> Cloud Native
            </span>
            <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '12px', background: 'rgba(16,185,129,0.15)', color: '#34d399', fontWeight: 700 }}>
              {cloudCount} Articles
            </span>
          </div>
          <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#e2e8f0', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Cloud Native Products
          </div>
          <p style={{ fontSize: '0.84rem', color: '#94a3b8', marginBottom: '16px', lineHeight: 1.5 }}>
            All SOPs for AOC team, cloud customer documentation, Docker/Kubernetes containerization, and modernization guides.
          </p>
          <span style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
            Explore Cloud Native Documentation →
          </span>
        </div>
      </div>
    </div>
  )
}
