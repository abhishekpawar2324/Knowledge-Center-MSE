import React, { useState, useEffect, useRef } from 'react'
import { 
  Search, 
  Filter, 
  FileText, 
  Sparkles, 
  User, 
  Calendar, 
  AlertCircle,
  HelpCircle,
  Star,
  Eye,
  ThumbsUp,
  Tag,
  ArrowRight,
  Layers,
  Zap,
  Workflow,
  Cloud,
  CheckCircle2,
  X
} from 'lucide-react'

export default function SearchPortal({ token, onSelectDoc, onOpenCopilot, activeProduct = 'all', initialQuery = '' }) {
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  // Filters
  const [productFilter, setProductFilter] = useState(activeProduct || 'all')
  const [fileType, setFileType] = useState('')
  const [docType, setDocType] = useState('')
  const [version, setVersion] = useState('')
  const [matchAll, setMatchAll] = useState(true)
  
  const searchInputRef = useRef(null)

  // Sync active product when prop changes
  useEffect(() => {
    setProductFilter(activeProduct || 'all')
  }, [activeProduct])

  // Sync initial query when prop changes
  useEffect(() => {
    if (initialQuery !== undefined) {
      setQuery(initialQuery)
    }
  }, [initialQuery])

  // Focus search input when '/' is pressed
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.key === '/' || (e.ctrlKey && e.key === 'k')) && document.activeElement !== searchInputRef.current) {
        e.preventDefault()
        searchInputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Fetch search results on query or filter change
  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setError('')
      return
    }

    const delayDebounce = setTimeout(() => {
      performSearch()
    }, 200)

    return () => clearTimeout(delayDebounce)
  }, [query, productFilter, fileType, docType, version, matchAll])

  const performSearch = async () => {
    setLoading(true)
    setError('')
    
    try {
      let url = `/api/search?q=${encodeURIComponent(query)}&match_all=${matchAll}`
      if (productFilter && productFilter !== 'all') url += `&product=${encodeURIComponent(productFilter)}`
      if (fileType) url += `&type=${encodeURIComponent(fileType)}`
      if (docType) url += `&doc_type=${encodeURIComponent(docType)}`
      if (version) url += `&version=${encodeURIComponent(version)}`
      
      const headers = {}
      if (token) headers['Authorization'] = `Bearer ${token}`

      const response = await fetch(url, { headers })
      if (!response.ok) throw new Error('Search request failed')
      
      const data = await response.json()
      setResults(data)
    } catch (err) {
      setError(err.message || 'Error occurred while searching.')
    } finally {
      setLoading(false)
    }
  }

  const getProductBadge = (prod) => {
    const p = (prod || 'xpi').toLowerCase()
    if (p === 'xpa') return { label: 'Magic xpa', bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', border: 'rgba(245, 158, 11, 0.3)' }
    if (p === 'cloud_native') return { label: 'Cloud Native', bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', border: 'rgba(16, 185, 129, 0.3)' }
    if (p === 'general') return { label: 'General', bg: 'rgba(148, 163, 184, 0.15)', text: '#cbd5e1', border: 'rgba(148, 163, 184, 0.3)' }
    return { label: 'Magic xpi', bg: 'rgba(6, 182, 212, 0.15)', text: '#22d3ee', border: 'rgba(6, 182, 212, 0.3)' }
  }

  const getFileTypeBadge = (type) => {
    const styles = {
      html: { bg: 'rgba(99, 102, 241, 0.15)', text: '#818cf8', label: 'HTML' },
      pdf: { bg: 'rgba(244, 63, 94, 0.15)', text: '#f43f5e', label: 'PDF' },
      docx: { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', label: 'DOCX' },
      md: { bg: 'rgba(6, 182, 212, 0.15)', text: '#22d3ee', label: 'MD' },
      txt: { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', label: 'TXT' }
    }
    const t = type ? type.toLowerCase() : 'html'
    return styles[t] || { bg: 'rgba(255,255,255,0.08)', text: '#9ca3af', label: type ? type.toUpperCase() : 'DOC' }
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%' }}>
      {/* Omnibox Search Bar */}
      <div 
        className="glass-panel"
        style={{
          padding: '20px',
          borderRadius: '16px',
          background: 'rgba(15, 23, 42, 0.75)',
          border: '1px solid rgba(0, 141, 199, 0.3)',
          boxShadow: '0 10px 35px rgba(0, 86, 140, 0.2)'
        }}
      >
        <div 
          style={{
            display: 'flex',
            alignItems: 'center',
            background: 'rgba(0, 0, 0, 0.35)',
            borderRadius: '12px',
            padding: '12px 18px',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            gap: '12px',
            transition: 'all 0.2s'
          }}
        >
          <Search size={22} style={{ color: '#008DC7', flexShrink: 0 }} />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search error codes, connectors, Magic.ini parameters, troubleshooting SOPs... (Press '/' to focus)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              color: '#ffffff',
              fontSize: '1.05rem',
              outline: 'none'
            }}
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer' }}
            >
              <X size={18} />
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '3px 8px', borderRadius: '6px', background: 'rgba(255, 255, 255, 0.08)', color: '#9ca3af', fontSize: '0.72rem', fontWeight: 600 }}>
            <span>/</span>
          </div>
        </div>

        {/* Filter Controls Row */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginTop: '16px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Filter size={14} /> Scope:
            </span>

            {/* Product Scope Selector */}
            <select
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '8px',
                color: '#e2e8f0',
                padding: '6px 10px',
                fontSize: '0.78rem',
                outline: 'none'
              }}
            >
              <option value="all" style={{ background: '#0f172a' }}>🌐 All Products</option>
              <option value="xpa" style={{ background: '#0f172a' }}>⚡ Magic xpa</option>
              <option value="xpi" style={{ background: '#0f172a' }}>🔗 Magic xpi</option>
              <option value="cloud_native" style={{ background: '#0f172a' }}>☁️ Cloud Native</option>
            </select>

            {/* File Type Filter */}
            <select
              value={fileType}
              onChange={(e) => setFileType(e.target.value)}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '8px',
                color: '#e2e8f0',
                padding: '6px 10px',
                fontSize: '0.78rem',
                outline: 'none'
              }}
            >
              <option value="" style={{ background: '#0f172a' }}>All File Types</option>
              <option value="html" style={{ background: '#0f172a' }}>Confluence HTML</option>
              <option value="pdf" style={{ background: '#0f172a' }}>PDF Manuals</option>
              <option value="docx" style={{ background: '#0f172a' }}>Word Documents</option>
              <option value="md" style={{ background: '#0f172a' }}>Markdown Articles</option>
            </select>

            {/* Doc Type Filter */}
            <select
              value={docType}
              onChange={(e) => setDocType(e.target.value)}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '8px',
                color: '#e2e8f0',
                padding: '6px 10px',
                fontSize: '0.78rem',
                outline: 'none'
              }}
            >
              <option value="" style={{ background: '#0f172a' }}>All Categories</option>
              <option value="troubleshooting" style={{ background: '#0f172a' }}>Troubleshooting Guides</option>
              <option value="how_to" style={{ background: '#0f172a' }}>How-To Setup</option>
              <option value="connector" style={{ background: '#0f172a' }}>Connectors & Adapters</option>
              <option value="architecture" style={{ background: '#0f172a' }}>Server Architecture</option>
            </select>
          </div>

          {/* AI Copilot Ask Button */}
          {onOpenCopilot && (
            <button
              onClick={() => onOpenCopilot(query)}
              style={{
                padding: '6px 14px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, rgba(0, 141, 199, 0.2), rgba(45, 188, 238, 0.2))',
                border: '1px solid rgba(45, 188, 238, 0.4)',
                color: '#38bdf8',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Sparkles size={14} /> Ask Copilot to solve this
            </button>
          )}
        </div>
      </div>

      {/* Results Header / Counter */}
      {query && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
          <span style={{ fontSize: '0.88rem', color: '#94a3b8' }}>
            {loading ? 'Searching Magic Knowledge Center...' : `Found ${results.length} result(s) for "${query}"`}
          </span>
          {results.length > 0 && (
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
              Sorted by Relevance & Verification Score
            </span>
          )}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
          <Sparkles size={28} className="animate-spin" style={{ margin: '0 auto 12px auto', color: '#008DC7' }} />
          <p style={{ fontSize: '0.9rem' }}>Searching across all Magic documentation...</p>
        </div>
      )}

      {/* Results List */}
      {!loading && results.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {results.map((doc) => {
            const prodBadge = getProductBadge(doc.product)
            const typeBadge = getFileTypeBadge(doc.file_type)

            return (
              <div
                key={doc.id}
                className="glass-panel glass-panel-hover"
                onClick={() => onSelectDoc(doc.id)}
                style={{
                  padding: '20px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                  <div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      {/* Product Badge */}
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: prodBadge.bg,
                          color: prodBadge.text,
                          border: `1px solid ${prodBadge.border}`
                        }}
                      >
                        {prodBadge.label}
                      </span>

                      {/* File Type Badge */}
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: typeBadge.bg,
                          color: typeBadge.text
                        }}
                      >
                        {typeBadge.label}
                      </span>

                      {/* Version */}
                      {doc.version && doc.version !== 'Universal' && (
                        <span style={{ fontSize: '0.72rem', color: '#94a3b8', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>
                          {doc.version}
                        </span>
                      )}

                      {/* Pinned Marker */}
                      {doc.is_pinned && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: '#f59e0b', fontWeight: 600 }}>
                          <Star size={12} style={{ fill: '#f59e0b' }} /> Pinned SOP
                        </span>
                      )}
                    </div>

                    <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#f8fafc', marginBottom: '4px' }}>
                      {doc.title}
                    </h3>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#64748b', fontSize: '0.78rem', flexShrink: 0 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Eye size={14} /> {doc.views || 0}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <ThumbsUp size={14} /> {doc.likes || 0}
                    </span>
                  </div>
                </div>

                {/* Highlight Snippet */}
                {doc.snippet && (
                  <p 
                    dangerouslySetInnerHTML={{ __html: doc.snippet }}
                    style={{ fontSize: '0.88rem', color: '#cbd5e1', lineHeight: 1.6 }}
                  />
                )}

                {/* Breadcrumbs & Metadata Footer */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: '10px', marginTop: '4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: '#64748b' }}>
                    <span>By {doc.author || 'Engineering'}</span>
                    <span>•</span>
                    <span>{doc.created_at}</span>
                  </div>

                  <span style={{ color: '#008DC7', fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    Read Documentation <ArrowRight size={14} />
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* No Results Message */}
      {!loading && query && results.length === 0 && (
        <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', borderRadius: '14px' }}>
          <AlertCircle size={36} style={{ color: '#f59e0b', margin: '0 auto 12px auto' }} />
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>
            No matching documents found for "{query}"
          </h3>
          <p style={{ fontSize: '0.88rem', color: '#94a3b8', maxWidth: '500px', margin: '0 auto 20px auto' }}>
            Try checking your spelling, selecting "All Products", or ask the AI Copilot to synthesize a solution.
          </p>
          {onOpenCopilot && (
            <button
              onClick={() => onOpenCopilot(query)}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #008DC7, #2DBCEE)',
                border: 'none',
                color: '#fff',
                fontWeight: 700,
                fontSize: '0.88rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Sparkles size={16} /> Ask Magic Copilot for Help
            </button>
          )}
        </div>
      )}
    </div>
  )
}
