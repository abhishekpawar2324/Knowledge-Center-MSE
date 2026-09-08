import React, { useState } from 'react'
import { 
  X, 
  Send, 
  Sparkles, 
  Code, 
  AlertTriangle, 
  Info, 
  CheckSquare, 
  Eye, 
  Edit3, 
  Layers, 
  FileText,
  Tag,
  CheckCircle,
  AlertCircle
} from 'lucide-react'

export default function KBAuthorModal({ isOpen, onClose, token, onKBCreated, defaultProduct = 'xpi' }) {
  const [title, setTitle] = useState('')
  const [product, setProduct] = useState(defaultProduct || 'xpi')
  const [category, setCategory] = useState('Connectors & Adapters')
  const [version, setVersion] = useState('v4.14.1')
  const [docType, setDocType] = useState('troubleshooting')
  const [tags, setTags] = useState('')
  const [content, setContent] = useState('')
  const [activeTab, setActiveTab] = useState('write') // 'write' or 'preview'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  if (!isOpen) return null

  const insertSnippet = (snippet) => {
    setContent((prev) => prev + '\n' + snippet + '\n')
  }

  const handlePublish = async (e, mode = 'publish') => {
    if (e) e.preventDefault()
    setError('')
    setSuccess('')

    if (!title.trim() || !content.trim()) {
      setError('Please provide a title and article body.')
      return
    }

    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('title', title)
      formData.append('content', content)
      formData.append('product', product)
      formData.append('category', category)
      formData.append('version', version)
      formData.append('doc_type', docType)
      formData.append('tags', tags)
      formData.append('upload_mode', mode)

      const res = await fetch('/api/kb/create', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail || 'Failed to submit Knowledge Base article')
      }

      const data = await res.json()
      const statusMsg = mode === 'review' 
        ? `Article "${title}" submitted for review into ${product.toUpperCase()} Queue!`
        : `Article "${title}" published and indexed successfully into ${product.toUpperCase()}!`
      setSuccess(statusMsg)
      if (onKBCreated) onKBCreated(data.doc_id)
      setTimeout(() => {
        onClose()
      }, 1500)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(3, 7, 18, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div 
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '900px',
          height: '90vh',
          maxHeight: '820px',
          borderRadius: '16px',
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid rgba(0, 141, 199, 0.35)',
          boxShadow: '0 25px 60px -15px rgba(0, 86, 140, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div 
          style={{
            padding: '16px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(0, 86, 140, 0.15)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #10b981, #06b6d4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <Edit3 size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff' }}>
                Author & Publish Knowledge Base Article
              </h3>
              <p style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                Create structured enterprise SOPs, connector manuals, and troubleshooting guides
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: 'none',
              borderRadius: '8px',
              color: '#9ca3af',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ flex: 1, padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {error && (
            <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', color: '#f43f5e', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={16} /> {error}
            </div>
          )}

          {success && (
            <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle size={16} /> {success}
            </div>
          )}

          {/* Form Fields Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                Target Product
              </label>
              <select
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '8px',
                  color: '#ffffff',
                  padding: '10px 12px',
                  fontSize: '0.88rem',
                  outline: 'none'
                }}
              >
                <option value="xpi" style={{ background: '#0f172a' }}>Magic xpi (Integration Platform)</option>
                <option value="xpa" style={{ background: '#0f172a' }}>Magic xpa (Application Studio)</option>
                <option value="cloud_native" style={{ background: '#0f172a' }}>Cloud Native & Modernization</option>
                <option value="general" style={{ background: '#0f172a' }}>General Architecture</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                Document Type
              </label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '8px',
                  color: '#ffffff',
                  padding: '10px 12px',
                  fontSize: '0.88rem',
                  outline: 'none'
                }}
              >
                <option value="troubleshooting" style={{ background: '#0f172a' }}>Troubleshooting / Issue Resolution</option>
                <option value="how_to" style={{ background: '#0f172a' }}>How-To / Step-by-Step Setup</option>
                <option value="connector" style={{ background: '#0f172a' }}>Connector / Adapter Reference</option>
                <option value="architecture" style={{ background: '#0f172a' }}>Architecture & Server SOP</option>
                <option value="release_note" style={{ background: '#0f172a' }}>Release Note / What's New</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                Target Version
              </label>
              <input
                type="text"
                placeholder="e.g. v4.14.1, v4.9, Universal"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '8px',
                  color: '#ffffff',
                  padding: '10px 12px',
                  fontSize: '0.88rem',
                  outline: 'none'
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
                Category / Folder
              </label>
              <input
                type="text"
                placeholder="e.g. Connectors > SAP B1"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '8px',
                  color: '#ffffff',
                  padding: '10px 12px',
                  fontSize: '0.88rem',
                  outline: 'none'
                }}
              />
            </div>
          </div>

          {/* Article Title */}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
              Article Title *
            </label>
            <input
              type="text"
              placeholder="e.g. How to configure GigaSpaces queryCache flag in Magic.ini to prevent memory leaks"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '8px',
                color: '#ffffff',
                padding: '12px 14px',
                fontSize: '0.95rem',
                fontWeight: 600,
                outline: 'none'
              }}
            />
          </div>

          {/* Tags */}
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '6px' }}>
              Search Tags (comma-separated)
            </label>
            <input
              type="text"
              placeholder="e.g. gigaspace, memory-leak, magic.ini, jvm_args"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              style={{
                width: '100%',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '8px',
                color: '#ffffff',
                padding: '8px 12px',
                fontSize: '0.85rem',
                outline: 'none'
              }}
            />
          </div>

          {/* Quick Snippet Insert Buttons */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>Insert Block:</span>
            <button
              type="button"
              onClick={() => insertSnippet('```ini\n; Magic Configuration Parameter\nJVM_ARGS=-Dcom.gs.queryCache.bounded.enable=false\n```')}
              style={{ padding: '4px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <Code size={13} /> Code Block (INI)
            </button>
            <button
              type="button"
              onClick={() => insertSnippet('> [!TIP]\n> **Best Practice**: Restart the GigaSpaces GSC container service after updating the parameters.')}
              style={{ padding: '4px 8px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <Info size={13} /> Tip Callout
            </button>
            <button
              type="button"
              onClick={() => insertSnippet('> [!WARNING]\n> **Important**: Ensure port 8005 is not blocked by Windows Firewall before starting Studio debugger.')}
              style={{ padding: '4px 8px', borderRadius: '6px', background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.3)', color: '#fbbf24', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <AlertTriangle size={13} /> Warning Callout
            </button>
            <button
              type="button"
              onClick={() => insertSnippet('### Verification Checklist:\n- [ ] Service stopped\n- [ ] Configuration file saved\n- [ ] GSC restarted\n- [ ] Verified logs')}
              style={{ padding: '4px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e2e8f0', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <CheckSquare size={13} /> Checklist
            </button>
          </div>

          {/* Editor / Preview Tabs */}
          <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '4px' }}>
            <button
              type="button"
              onClick={() => setActiveTab('write')}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                background: activeTab === 'write' ? 'rgba(0, 141, 199, 0.2)' : 'transparent',
                border: activeTab === 'write' ? '1px solid #008DC7' : 'none',
                color: activeTab === 'write' ? '#ffffff' : '#9ca3af',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Write (Markdown / HTML)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                background: activeTab === 'preview' ? 'rgba(0, 141, 199, 0.2)' : 'transparent',
                border: activeTab === 'preview' ? '1px solid #008DC7' : 'none',
                color: activeTab === 'preview' ? '#ffffff' : '#9ca3af',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Eye size={14} /> Live Preview
            </button>
          </div>

          {/* Content Area */}
          {activeTab === 'write' ? (
            <textarea
              rows={12}
              placeholder="Write your article content using Markdown or HTML...&#10;&#10;## Problem Description&#10;Describe the issue or objective.&#10;&#10;## Resolution Steps&#10;1. Open Magic.ini&#10;2. Add the parameter under [MAGIC_ENV]&#10;3. Restart server"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              style={{
                width: '100%',
                flex: 1,
                minHeight: '220px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '8px',
                color: '#ffffff',
                padding: '14px',
                fontSize: '0.9rem',
                fontFamily: 'monospace',
                lineHeight: 1.6,
                outline: 'none',
                resize: 'vertical'
              }}
            />
          ) : (
            <div 
              style={{
                minHeight: '220px',
                padding: '16px',
                borderRadius: '8px',
                background: 'rgba(0, 0, 0, 0.25)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#e2e8f0',
                fontSize: '0.92rem',
                lineHeight: 1.7,
                overflowY: 'auto'
              }}
            >
              <h1 style={{ color: '#fff', fontSize: '1.5rem', marginBottom: '10px' }}>{title || 'Untitled Article'}</h1>
              <p style={{ color: '#94a3b8', fontSize: '0.8rem', marginBottom: '16px' }}>Product: {product.toUpperCase()} | Version: {version}</p>
              <div style={{ whiteSpace: 'pre-wrap' }}>{content || 'No content entered yet.'}</div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div 
          style={{
            padding: '16px 24px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(15, 23, 42, 0.9)'
          }}
        >
          <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
            Articles are instantly indexed into search and notified to support teams.
          </span>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 18px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#e2e8f0',
                fontSize: '0.88rem',
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={(e) => handlePublish(e, 'review')}
              disabled={loading}
              style={{
                padding: '10px 18px',
                borderRadius: '8px',
                background: 'rgba(245, 158, 11, 0.18)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                color: '#fbbf24',
                fontWeight: 600,
                fontSize: '0.88rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Clock size={16} />
              <span>{loading ? 'Submitting...' : 'Send for Review'}</span>
            </button>

            <button
              type="button"
              onClick={(e) => handlePublish(e, 'publish')}
              disabled={loading}
              style={{
                padding: '10px 22px',
                borderRadius: '8px',
                background: loading ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #008DC7, #2DBCEE)',
                border: 'none',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.88rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                boxShadow: '0 4px 15px rgba(0, 141, 199, 0.35)'
              }}
            >
              <Send size={16} />
              <span>{loading ? 'Publishing...' : 'Directly Publish'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
