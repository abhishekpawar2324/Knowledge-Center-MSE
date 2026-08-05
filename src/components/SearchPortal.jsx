import React, { useState, useEffect, useRef } from 'react'
import { 
  Search, 
  Filter, 
  FileText, 
  Sparkles, 
  User, 
  Calendar, 
  AlertCircle,
  HelpCircle
} from 'lucide-react'

export default function SearchPortal({ token, onSelectDoc }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  // Filters
  const [fileType, setFileType] = useState('')
  const [category, setCategory] = useState('')
  const [author, setAuthor] = useState('')
  const [matchAll, setMatchAll] = useState(true)
  
  const searchInputRef = useRef(null)

  // Focus search input when '/' is pressed
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === '/' && document.activeElement !== searchInputRef.current) {
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
    }, 250) // Debounce search request

    return () => clearTimeout(delayDebounce)
  }, [query, fileType, category, author, matchAll])

  const performSearch = async () => {
    setLoading(true)
    setError('')
    
    try {
      let url = `/api/search?q=${encodeURIComponent(query)}&match_all=${matchAll}`
      if (fileType) url += `&type=${encodeURIComponent(fileType)}`
      if (category) url += `&category=${encodeURIComponent(category)}`
      if (author) url += `&author=${encodeURIComponent(author)}`
      
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` }
      })
      
      if (!response.ok) {
        throw new Error('Search request failed')
      }
      
      const data = await response.json()
      setResults(data)
    } catch (err) {
      setError(err.message || 'Error occurred while searching.')
    } finally {
      setLoading(false)
    }
  }

  // Get file type badge styling
  const getFileTypeBadge = (type) => {
    const styles = {
      html: { bg: 'rgba(99, 102, 241, 0.15)', text: '#818cf8', label: 'HTML' },
      pdf: { bg: 'rgba(244, 63, 94, 0.15)', text: '#f43f5e', label: 'PDF' },
      docx: { bg: 'rgba(16, 185, 129, 0.15)', text: '#34d399', label: 'Word' },
      md: { bg: 'rgba(6, 182, 212, 0.15)', text: '#22d3ee', label: 'MD' },
      txt: { bg: 'rgba(245, 158, 11, 0.15)', text: '#fbbf24', label: 'TXT' }
    }
    const t = type && type.toLowerCase ? type.toLowerCase() : type
    return styles[t] || { bg: 'rgba(255,255,255,0.08)', text: '#9ca3af', label: type ? type.toUpperCase() : 'DOC' }
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1100px', margin: '0 auto', width: '100%' }}>
      {/* Centered Search Engine Header */}
      {!query && (
        <div style={{ textAlign: 'center', marginTop: '60px', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '2.5rem', fontWeight: 800, fontFamily: 'var(--font-display)', background: 'linear-gradient(to right, #fff, #a5b4fc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: '10px' }}>
            What can we help you find?
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>
            Search through Magic Software's global Confluence database and uploads.
          </p>
        </div>
      )}

      {/* Main Search Panel */}
      <div className="glass-panel" style={{
        padding: '24px',
        border: '1px solid rgba(255,255,255,0.06)',
        boxShadow: query ? '0 10px 30px rgba(0,0,0,0.3)' : '0 15px 40px rgba(99, 102, 241, 0.05)'
      }}>
        {/* Large Input Row */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <Search style={{ position: 'absolute', left: '18px', color: 'var(--text-muted)' }} size={22} />
          <input 
            ref={searchInputRef}
            type="text" 
            className="input-field" 
            placeholder="Type keywords or phrase... (Press '/' to focus)" 
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{
              paddingLeft: '54px',
              paddingRight: '60px',
              fontSize: '1.15rem',
              height: '56px',
              borderRadius: '12px',
              background: 'rgba(0, 0, 0, 0.2)',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}
          />
          {/* Exact phrase helper */}
          <div style={{
            position: 'absolute',
            right: '18px',
            fontSize: '0.75rem',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            padding: '4px 8px',
            borderRadius: '4px',
            color: 'var(--text-muted)',
            pointerEvents: 'none'
          }}>
            "phrase" for exact
          </div>
        </div>

        {/* Filters and Controls */}
        <div style={{ 
          display: 'flex', 
          flexWrap: 'wrap', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          gap: '16px', 
          marginTop: '20px', 
          paddingTop: '16px',
          borderTop: '1px solid rgba(255,255,255,0.05)'
        }}>
          {/* Multi-Filters */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              <Filter size={14} /> Filters:
            </div>
            
            {/* Format filter */}
            <select 
              className="input-field"
              style={{ padding: '6px 12px', width: 'auto', fontSize: '0.85rem', height: '34px', borderRadius: '6px' }}
              value={fileType}
              onChange={e => setFileType(e.target.value)}
            >
              <option value="">All Formats</option>
              <option value="html">HTML</option>
              <option value="pdf">PDF</option>
              <option value="docx">Word</option>
              <option value="txt">Plain Text</option>
              <option value="md">Markdown</option>
            </select>

            {/* Category Filter */}
            <input 
              type="text" 
              className="input-field"
              placeholder="Filter Category"
              style={{ padding: '6px 12px', width: '140px', fontSize: '0.85rem', height: '34px', borderRadius: '6px' }}
              value={category}
              onChange={e => setCategory(e.target.value)}
            />

            {/* Author Filter */}
            <input 
              type="text" 
              className="input-field"
              placeholder="Filter Author"
              style={{ padding: '6px 12px', width: '130px', fontSize: '0.85rem', height: '34px', borderRadius: '6px' }}
              value={author}
              onChange={e => setAuthor(e.target.value)}
            />
          </div>

          {/* Toggle for OR/AND match */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '0.85rem', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input 
                type="checkbox" 
                checked={matchAll}
                onChange={e => setMatchAll(e.target.checked)}
                style={{
                  width: '16px',
                  height: '16px',
                  accentColor: 'var(--primary)',
                  cursor: 'pointer'
                }}
              />
              Match all query words
            </label>
          </div>
        </div>
      </div>

      {/* Results Section */}
      <div style={{ marginTop: '10px' }}>
        {loading && (
          // Skeleton Cards
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="glass-panel" style={{ height: '140px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '12px', opacity: 0.7 }}>
                <div style={{ width: '40%', height: '16px', background: 'rgba(255,255,255,0.06)', borderRadius: '4px' }}></div>
                <div style={{ width: '85%', height: '12px', background: 'rgba(255,255,255,0.04)', borderRadius: '4px' }}></div>
                <div style={{ width: '20%', height: '10px', background: 'rgba(255,255,255,0.04)', borderRadius: '4px' }}></div>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '16px 20px',
            borderRadius: '12px',
            background: 'rgba(244, 63, 94, 0.1)',
            border: '1px solid rgba(244, 63, 94, 0.2)',
            color: 'var(--accent-rose)'
          }}>
            <AlertCircle size={20} />
            <div>
              <p style={{ fontWeight: 600 }}>Search error</p>
              <p style={{ fontSize: '0.85rem' }}>{error}</p>
            </div>
          </div>
        )}

        {!loading && !error && results.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContext: 'space-between', fontSize: '0.85rem', color: 'var(--text-muted)', padding: '0 8px' }}>
              <span>Found {results.length} accurate result(s)</span>
              <span style={{ marginLeft: 'auto' }}>Sorted by relevance</span>
            </div>

            {results.map(doc => {
              const badge = getFileTypeBadge(doc.file_type)
              return (
                <div 
                  key={doc.id}
                  className="glass-panel glass-panel-hover"
                  style={{
                    padding: '24px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    border: '1px solid rgba(255,255,255,0.06)',
                    background: 'rgba(18, 14, 33, 0.4)'
                  }}
                  onClick={() => onSelectDoc(doc.id)}
                >
                  {/* Header Row */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                    <div>
                      {/* Breadcrumbs */}
                      {doc.breadcrumbs && doc.breadcrumbs.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '4px' }}>
                          {doc.breadcrumbs.map((crumb, idx) => (
                            <React.Fragment key={idx}>
                              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{crumb}</span>
                              {idx < doc.breadcrumbs.length - 1 && <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.1)' }}>/</span>}
                            </React.Fragment>
                          ))}
                        </div>
                      )}
                      
                      <h3 style={{ fontSize: '1.15rem', color: '#fff', fontWeight: 600 }}>{doc.title}</h3>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {/* Relevance Score */}
                      <span style={{
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        padding: '4px 8px',
                        borderRadius: '4px',
                        background: 'rgba(99, 102, 241, 0.1)',
                        border: '1px solid rgba(99, 102, 241, 0.2)',
                        color: '#a5b4fc',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <Sparkles size={10} /> score: {Math.round(doc.score)}
                      </span>

                      {/* File format badge */}
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        backgroundColor: badge.bg,
                        color: badge.text,
                        border: `1px solid ${badge.text}20`
                      }}>
                        {badge.label}
                      </span>
                    </div>
                  </div>

                  {/* Highlight snippet container */}
                  {doc.snippet && (
                    <p 
                      style={{ fontSize: '0.9rem', color: '#d1d5db', margin: '4px 0' }}
                      dangerouslySetInnerHTML={{ __html: doc.snippet }}
                    />
                  )}

                  {/* Render tags on search cards */}
                  {doc.tags && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '4px 0' }}>
                      {doc.tags.split(',').map((t, i) => (
                        <span key={i} className="tag-badge" style={{ fontSize: '0.68rem', padding: '2px 8px', cursor: 'default' }}>
                          #{t.trim()}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Metadata Row */}
                  <div style={{ 
                    display: 'flex', 
                    gap: '16px', 
                    alignItems: 'center',
                    fontSize: '0.75rem', 
                    color: 'var(--text-muted)',
                    marginTop: '4px',
                    borderTop: '1px solid rgba(255,255,255,0.03)',
                    paddingTop: '8px'
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <User size={12} /> {doc.author}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={12} /> {doc.created_at}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}>
                      👁 {doc.views || 0}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      👍 {doc.likes || 0}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {!loading && !error && query.trim() && results.length === 0 && (
          <div className="glass-panel" style={{
            textAlign: 'center',
            padding: '50px 30px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px'
          }}>
            <HelpCircle size={40} style={{ color: 'var(--text-muted)' }} />
            <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>No exact matches found</h3>
            <p style={{ color: 'var(--text-muted)', maxWidth: '420px', fontSize: '0.85rem' }}>
              We couldn't find any documents containing your search terms. Double check spelling or try disabling "Match all query words" for broader results.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
