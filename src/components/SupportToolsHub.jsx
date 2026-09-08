import React, { useState, useEffect } from 'react'
import { 
  Wrench, 
  Download, 
  Search, 
  Filter, 
  Plus, 
  FileText, 
  CheckCircle, 
  AlertCircle, 
  X, 
  HardDrive, 
  Terminal, 
  Layers, 
  Tag, 
  Cpu, 
  ExternalLink,
  Trash2,
  Clock,
  User,
  ShieldCheck,
  Zap
} from 'lucide-react'

export default function SupportToolsHub({ token, role, username }) {
  const [utilities, setUtilities] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedProduct, setSelectedProduct] = useState('all')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedPlatform, setSelectedPlatform] = useState('all')
  
  // Modal states
  const [activeDocUtil, setActiveDocUtil] = useState(null)
  const [showUploadModal, setShowUploadModal] = useState(false)

  // Upload Form states
  const [uploadTitle, setUploadTitle] = useState('')
  const [uploadDesc, setUploadDesc] = useState('')
  const [uploadProduct, setUploadProduct] = useState('general')
  const [uploadCategory, setUploadCategory] = useState('Diagnostic')
  const [uploadVersion, setUploadVersion] = useState('v1.0.0')
  const [uploadPlatform, setUploadPlatform] = useState('Cross-Platform')
  const [uploadFile, setUploadFile] = useState(null)
  const [uploadLoading, setUploadLoading] = useState(false)
  const [uploadError, setUploadError] = useState('')

  const canManage = role === 'Admin' || role === 'Reviewer'

  useEffect(() => {
    fetchUtilities()
  }, [selectedProduct, selectedCategory, selectedPlatform, searchQuery])

  const fetchUtilities = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (selectedProduct !== 'all') params.append('product', selectedProduct)
      if (selectedCategory !== 'all') params.append('category', selectedCategory)
      if (selectedPlatform !== 'all') params.append('platform', selectedPlatform)
      if (searchQuery.trim()) params.append('query', searchQuery.trim())

      const res = await fetch(`/api/utilities?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setUtilities(data)
      }
    } catch (err) {
      console.error("Failed to fetch utilities:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleDownload = (id, fileName) => {
    const link = document.createElement('a')
    link.href = `/api/utilities/download/${id}`
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    setUtilities(prev => prev.map(u => u.id === id ? { ...u, download_count: (u.download_count || 0) + 1 } : u))
  }

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to remove this support utility?")) return
    try {
      const res = await fetch(`/api/utilities/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        setUtilities(prev => prev.filter(u => u.id !== id))
        if (activeDocUtil?.id === id) setActiveDocUtil(null)
      }
    } catch (err) {
      alert("Failed to delete utility: " + err.message)
    }
  }

  const handleUploadSubmit = async (e) => {
    e.preventDefault()
    if (!uploadTitle.trim() || !uploadFile) {
      setUploadError("Please provide a title and select a tool file.")
      return
    }

    setUploadLoading(true)
    setUploadError('')

    const formData = new FormData()
    formData.append('title', uploadTitle)
    formData.append('description', uploadDesc)
    formData.append('product', uploadProduct)
    formData.append('category', uploadCategory)
    formData.append('version', uploadVersion)
    formData.append('platform', uploadPlatform)
    formData.append('file', uploadFile)

    try {
      const res = await fetch('/api/utilities/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.detail || "Upload failed")
      }

      setShowUploadModal(false)
      setUploadTitle('')
      setUploadDesc('')
      setUploadFile(null)
      fetchUtilities()
    } catch (err) {
      setUploadError(err.message)
    } finally {
      setUploadLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '10px 0', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header & Action Bar */}
      <div style={{ 
        background: 'linear-gradient(135deg, rgba(15,23,42,0.9) 0%, rgba(30,41,59,0.9) 100%)', 
        borderRadius: '16px', 
        padding: '28px', 
        border: '1px solid rgba(56,189,248,0.2)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.3)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ padding: '10px', background: 'rgba(56,189,248,0.15)', borderRadius: '12px', color: '#38bdf8' }}>
                <Download size={28} />
              </div>
              <div>
                <h1 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#ffffff', margin: 0, letterSpacing: '-0.02em' }}>
                  Internal Downloads Hub & Support Tools
                </h1>
                <p style={{ fontSize: '0.9rem', color: '#94a3b8', margin: '4px 0 0 0' }}>
                  Direct download portal for diagnostic utilities, installation packages, scripts, patches, and tools.
                </p>
              </div>
            </div>
          </div>

          {canManage && (
            <button
              onClick={() => setShowUploadModal(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                background: 'linear-gradient(135deg, #008DC7 0%, #0284c7 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer',
                boxShadow: '0 4px 14px rgba(0,141,199,0.35)',
                transition: 'all 0.2s ease'
              }}
            >
              <Plus size={18} />
              Publish File
            </button>
          )}
        </div>

        {/* Filter Controls */}
        <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
            <input
              type="text"
              placeholder="Search download files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px 10px 38px',
                background: 'rgba(15,23,42,0.8)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                color: '#ffffff',
                fontSize: '0.88rem',
                outline: 'none'
              }}
            />
          </div>

          {/* Product Filter */}
          <select
            value={selectedProduct}
            onChange={(e) => setSelectedProduct(e.target.value)}
            style={{
              padding: '10px 12px',
              background: 'rgba(15,23,42,0.8)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              color: '#ffffff',
              fontSize: '0.88rem',
              outline: 'none'
            }}
          >
            <option value="all">🌟 All Products & Tools</option>
            <option value="xpi">⚡ Magic xpi</option>
            <option value="xpa">🚀 Magic xpa</option>
            <option value="cloud_native">☁️ Cloud Native</option>
            <option value="general">🛠️ General Support</option>
          </select>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            style={{
              padding: '10px 12px',
              background: 'rgba(15,23,42,0.8)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              color: '#ffffff',
              fontSize: '0.88rem',
              outline: 'none'
            }}
          >
            <option value="all">📁 All Categories</option>
            <option value="Diagnostic">🔍 Diagnostic & Logs</option>
            <option value="Migration">🔄 Database & Migration</option>
            <option value="License">🔑 Licensing & Security</option>
            <option value="CLI">💻 CLI & Scripts</option>
            <option value="Patch">📦 Patches & Hotfixes</option>
          </select>

          {/* Platform Filter */}
          <select
            value={selectedPlatform}
            onChange={(e) => setSelectedPlatform(e.target.value)}
            style={{
              padding: '10px 12px',
              background: 'rgba(15,23,42,0.8)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              color: '#ffffff',
              fontSize: '0.88rem',
              outline: 'none'
            }}
          >
            <option value="all">💻 All OS Platforms</option>
            <option value="Windows">Windows (x64 / x86)</option>
            <option value="Linux">Linux (RedHat / Ubuntu)</option>
            <option value="Cross-Platform">Cross-Platform (Python/PS1)</option>
          </select>
        </div>
      </div>

      {/* Main Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px', color: '#94a3b8' }}>
          <div className="animate-spin" style={{ display: 'inline-block', marginBottom: '12px' }}>
            <Wrench size={32} style={{ color: '#38bdf8' }} />
          </div>
          <p>Loading internal support tools & utilities...</p>
        </div>
      ) : utilities.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: '60px', 
          background: 'rgba(15,23,42,0.4)', 
          borderRadius: '16px', 
          border: '1px dashed rgba(255,255,255,0.1)',
          color: '#94a3b8' 
        }}>
          <HardDrive size={48} style={{ color: '#64748b', marginBottom: '12px' }} />
          <h3 style={{ fontSize: '1.2rem', color: '#f8fafc', marginBottom: '6px' }}>No Support Tools Found</h3>
          <p style={{ fontSize: '0.9rem', maxWidth: '450px', margin: '0 auto' }}>
            No utilities match your filter criteria. Try adjusting filters or publish a new support tool.
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
          {utilities.map(util => (
            <div
              key={util.id}
              style={{
                background: 'rgba(15, 23, 42, 0.75)',
                borderRadius: '14px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                justify: 'space-between',
                gap: '16px',
                transition: 'all 0.25s ease',
                boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
                position: 'relative'
              }}
            >
              <div>
                {/* Badges Bar */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '6px' }}>
                  <span style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    background: util.product === 'xpi' ? 'rgba(56,189,248,0.15)' : util.product === 'xpa' ? 'rgba(245,158,11,0.15)' : 'rgba(168,85,247,0.15)',
                    color: util.product === 'xpi' ? '#38bdf8' : util.product === 'xpa' ? '#fbbf24' : '#c084fc',
                    border: `1px solid ${util.product === 'xpi' ? 'rgba(56,189,248,0.3)' : util.product === 'xpa' ? 'rgba(245,158,11,0.3)' : 'rgba(168,85,247,0.3)'}`
                  }}>
                    {util.product}
                  </span>

                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: '#94a3b8' }}>
                      {util.version}
                    </span>
                    <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: '#34d399' }}>
                      {util.platform}
                    </span>
                  </div>
                </div>

                {/* Title & Desc */}
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', marginBottom: '8px', lineHeight: 1.3 }}>
                  {util.title}
                </h3>
                <p style={{ 
                  fontSize: '0.86rem', 
                  color: '#94a3b8', 
                  lineHeight: 1.5, 
                  margin: 0,
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden'
                }}>
                  {util.description || "No description provided."}
                </p>
              </div>

              {/* Footer Specs & Action Buttons */}
              <div style={{ paddingTop: '14px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', color: '#64748b' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <HardDrive size={13} /> {util.file_size}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Download size={13} /> {util.download_count} downloads
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    onClick={() => handleDownload(util.id, util.file_name)}
                    style={{
                      flex: 1,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '9px 14px',
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      fontWeight: 600,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                      boxShadow: '0 3px 10px rgba(16,185,129,0.25)',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <Download size={15} />
                    Download Tool
                  </button>

                  <button
                    onClick={() => setActiveDocUtil(util)}
                    style={{
                      padding: '9px 12px',
                      background: 'rgba(255,255,255,0.06)',
                      color: '#e2e8f0',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      fontWeight: 500,
                      cursor: 'pointer'
                    }}
                    title="View Guide & Details"
                  >
                    <FileText size={15} />
                  </button>

                  {canManage && (
                    <button
                      onClick={() => handleDelete(util.id)}
                      style={{
                        padding: '9px 10px',
                        background: 'rgba(239,68,68,0.1)',
                        color: '#f87171',
                        border: '1px solid rgba(239,68,68,0.2)',
                        borderRadius: '8px',
                        cursor: 'pointer'
                      }}
                      title="Delete Utility"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Usage Guide Modal */}
      {activeDocUtil && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '20px'
        }}>
          <div style={{
            background: '#0f172a',
            border: '1px solid rgba(56,189,248,0.3)',
            borderRadius: '16px',
            maxWidth: '650px',
            width: '100%',
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
          }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#38bdf8', fontWeight: 700, textTransform: 'uppercase' }}>
                  {activeDocUtil.category} • {activeDocUtil.product.toUpperCase()}
                </span>
                <h2 style={{ fontSize: '1.4rem', color: '#ffffff', margin: '4px 0 0 0' }}>{activeDocUtil.title}</h2>
              </div>
              <button onClick={() => setActiveDocUtil(null)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <span style={{ background: 'rgba(255,255,255,0.06)', padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', color: '#e2e8f0' }}>
                  <strong>Version:</strong> {activeDocUtil.version}
                </span>
                <span style={{ background: 'rgba(255,255,255,0.06)', padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', color: '#e2e8f0' }}>
                  <strong>Platform:</strong> {activeDocUtil.platform}
                </span>
                <span style={{ background: 'rgba(255,255,255,0.06)', padding: '6px 12px', borderRadius: '6px', fontSize: '0.8rem', color: '#e2e8f0' }}>
                  <strong>Size:</strong> {activeDocUtil.file_size}
                </span>
              </div>

              <div>
                <h4 style={{ color: '#38bdf8', fontSize: '0.95rem', marginBottom: '8px' }}>Description & Usage Instructions</h4>
                <div style={{ 
                  background: 'rgba(0,0,0,0.3)', 
                  padding: '16px', 
                  borderRadius: '10px', 
                  color: '#cbd5e1', 
                  fontSize: '0.9rem',
                  lineHeight: 1.6,
                  whiteSpace: 'pre-wrap'
                }}>
                  {activeDocUtil.description || "No extra documentation provided."}
                </div>
              </div>

              <div style={{ fontSize: '0.8rem', color: '#64748b', display: 'flex', justifyContent: 'space-between' }}>
                <span>Published by: {activeDocUtil.author}</span>
                <span>Date: {activeDocUtil.created_at}</span>
              </div>
            </div>

            <div style={{ padding: '16px 24px', borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                onClick={() => handleDownload(activeDocUtil.id, activeDocUtil.file_name)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 20px',
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.9rem',
                  cursor: 'pointer'
                }}
              >
                <Download size={16} />
                Download {activeDocUtil.file_name}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Utility Modal */}
      {showUploadModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1100,
          padding: '20px'
        }}>
          <div style={{
            background: '#0f172a',
            border: '1px solid rgba(56,189,248,0.3)',
            borderRadius: '16px',
            maxWidth: '600px',
            width: '100%',
            overflow: 'hidden'
          }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.3rem', color: '#ffffff', margin: 0 }}>Publish New Support Utility</h2>
              <button onClick={() => setShowUploadModal(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleUploadSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {uploadError && (
                <div style={{ padding: '12px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '8px', color: '#f87171', fontSize: '0.85rem' }}>
                  {uploadError}
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px' }}>Tool Title *</label>
                <input
                  type="text"
                  placeholder="e.g. Magic xpi Log Diagnostic Collector"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#ffffff' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px' }}>Product Space</label>
                  <select
                    value={uploadProduct}
                    onChange={(e) => setUploadProduct(e.target.value)}
                    style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#ffffff' }}
                  >
                    <option value="xpi">Magic xpi</option>
                    <option value="xpa">Magic xpa</option>
                    <option value="cloud_native">Cloud Native</option>
                    <option value="general">General Support</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px' }}>Category</label>
                  <select
                    value={uploadCategory}
                    onChange={(e) => setUploadCategory(e.target.value)}
                    style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#ffffff' }}
                  >
                    <option value="Diagnostic">Diagnostic & Logs</option>
                    <option value="Migration">Database & Migration</option>
                    <option value="License">Licensing & Security</option>
                    <option value="CLI">CLI & Scripts</option>
                    <option value="Patch">Patches & Hotfixes</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px' }}>Version</label>
                  <input
                    type="text"
                    value={uploadVersion}
                    onChange={(e) => setUploadVersion(e.target.value)}
                    style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#ffffff' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px' }}>Platform</label>
                  <select
                    value={uploadPlatform}
                    onChange={(e) => setUploadPlatform(e.target.value)}
                    style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#ffffff' }}
                  >
                    <option value="Cross-Platform">Cross-Platform</option>
                    <option value="Windows (x64)">Windows (x64)</option>
                    <option value="Linux">Linux</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px' }}>Usage Instructions / Description</label>
                <textarea
                  rows={4}
                  placeholder="Usage instructions, command-line flags, prerequisites..."
                  value={uploadDesc}
                  onChange={(e) => setUploadDesc(e.target.value)}
                  style={{ width: '100%', padding: '10px', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#ffffff', fontSize: '0.88rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px' }}>Attach Tool Binary / Zip File *</label>
                <input
                  type="file"
                  onChange={(e) => setUploadFile(e.target.files[0])}
                  required
                  style={{ width: '100%', color: '#94a3b8' }}
                />
              </div>

              <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowUploadModal(false)}
                  style={{ padding: '10px 16px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#94a3b8', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploadLoading}
                  style={{ padding: '10px 20px', background: '#008DC7', border: 'none', borderRadius: '8px', color: '#ffffff', fontWeight: 600, cursor: 'pointer' }}
                >
                  {uploadLoading ? "Uploading..." : "Publish Utility"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
