import React, { useState, useEffect } from 'react'
import { 
  Search, 
  Upload, 
  Settings, 
  LogOut, 
  User, 
  X, 
  Clock, 
  Calendar,
  AlertCircle,
  Folder,
  FolderOpen,
  FileText,
  ChevronRight,
  Star,
  ThumbsUp,
  MessageSquare,
  Plus,
  Edit,
  TrendingUp,
  BarChart2,
  Trash2,
  Bookmark,
  Share2,
  CheckCircle,
  HelpCircle,
  Sparkles
} from 'lucide-react'
import SearchPortal from './components/SearchPortal'
import UploadPortal from './components/UploadPortal'
import AdminPanel from './components/AdminPanel'

// Inline SVG replication of the Magic Software logo — no file dependency, always renders
const MagicLogoSVG = ({ height = 48 }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 265" height={height} style={{ width: 'auto', display: 'block', flexShrink: 0 }}>
    <defs>
      <linearGradient id="magicGrad" x1="0" y1="1" x2="1" y2="0" gradientUnits="objectBoundingBox">
        <stop offset="0%" stopColor="#00568C"/>
        <stop offset="50%" stopColor="#008DC7"/>
        <stop offset="100%" stopColor="#2DBCEE"/>
      </linearGradient>
    </defs>
    {/* Asymmetric teardrop blob shape — matches Magic Software logo */}
    <path fill="url(#magicGrad)" d="M112 10 C162 6 213 50 213 108 C213 168 180 226 126 250 C90 264 46 246 22 211 C-2 176 2 114 28 72 C54 30 76 14 112 10Z"/>
    {/* "magic" wordmark */}
    <text x="111" y="152" fontFamily="'Helvetica Neue',Arial,sans-serif" fontSize="52" fontWeight="800" fill="white" textAnchor="middle" letterSpacing="-2">magic</text>
    {/* ® symbol */}
    <circle cx="180" cy="108" r="7" fill="none" stroke="white" strokeWidth="1.8"/>
    <text x="180" y="113" fontFamily="Arial,sans-serif" fontSize="9" fill="white" textAnchor="middle" fontWeight="700">R</text>
    {/* "a matrix company" tagline */}
    <text x="111" y="198" fontFamily="Arial,sans-serif" fontSize="15.5" fill="rgba(255,255,255,0.92)" textAnchor="middle">a <tspan fontWeight="700" fontStyle="italic">matrix</tspan> company</text>
  </svg>
)

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '')
  const [username, setUsername] = useState(localStorage.getItem('username') || '')
  const [role, setRole] = useState(localStorage.getItem('role') || '')
  
  // Navigation tabs: 'search' | 'upload' | 'admin' | 'document'
  const [activeTab, setActiveTab] = useState('search')
  
  // Left Tree Navigation states
  const [spaces, setSpaces] = useState([])
  const [selectedSpace, setSelectedSpace] = useState('')
  const [spaceTree, setSpaceTree] = useState([])
  const [collapsedNodes, setCollapsedNodes] = useState(new Set())
  const [treeFilter, setTreeFilter] = useState('')
  
  // Favorites / Bookmarks states
  const [favorites, setFavorites] = useState([])
  
  // Active Document Viewer states
  const [selectedDocId, setSelectedDocId] = useState(null)
  const [docDetails, setDocDetails] = useState(null)
  const [docLoading, setDocLoading] = useState(false)
  const [headings, setHeadings] = useState([])
  
  // Comments states
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [commentLoading, setCommentLoading] = useState(false)

  // In-Place Editor states
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editTags, setEditTags] = useState('')
  const [editError, setEditError] = useState('')
  const [editLoading, setEditLoading] = useState(false)

  // Dashboard Stats states
  const [stats, setStats] = useState(null)
  const [statsLoading, setStatsLoading] = useState(false)

  // Login credentials states
  const [loginUser, setLoginUser] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  // 1. Verify Authentication Token
  useEffect(() => {
    if (token) {
      fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => {
        if (res.status === 401) handleLogout()
        return res.json()
      })
      .then(data => {
        if (data && data.username) {
          setUsername(data.username)
          setRole(data.role)
          localStorage.setItem('username', data.username)
          localStorage.setItem('role', data.role)
        }
      })
      .catch(() => {})
    }
  }, [token])

  // 2. Fetch Spaces List
  useEffect(() => {
    if (token) {
      fetch('/api/spaces', {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        setSpaces(data)
        if (data.length > 0 && !selectedSpace) {
          setSelectedSpace(data[0])
        }
      })
      .catch(err => console.error(err))
    }
  }, [token])

  // 3. Fetch Space Page Tree when selected space changes
  useEffect(() => {
    if (token && selectedSpace) {
      fetch(`/api/space/${encodeURIComponent(selectedSpace)}/tree`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        setSpaceTree(data)
        // Auto-expand root folder node in explorer
        if (data.length > 0) {
          setCollapsedNodes(new Set())
        }
      })
      .catch(err => console.error(err))
    }
  }, [token, selectedSpace])

  // 4. Fetch Global Stats for Dashboard
  const fetchStats = () => {
    if (!token) return
    setStatsLoading(true)
    fetch('/api/stats', {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => {
      setStats(data)
      setStatsLoading(false)
    })
    .catch(err => {
      console.error(err)
      setStatsLoading(false)
    })
  }

  useEffect(() => {
    if (token && activeTab === 'search') {
      fetchStats()
    }
  }, [token, activeTab, selectedDocId])

  // 5. Fetch Favorites list
  const fetchFavorites = () => {
    if (!token) return
    fetch('/api/favorites', {
      headers: { Authorization: `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(data => setFavorites(data))
    .catch(err => console.error(err))
  }

  useEffect(() => {
    if (token) {
      fetchFavorites()
    }
  }, [token, selectedDocId])

  // 6. Fetch Document Details, Comments, and Auto-ToC
  const fetchDocDetails = () => {
    if (selectedDocId !== null && token) {
      setDocLoading(true)
      fetch(`/api/document/${selectedDocId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => {
        if (!res.ok) throw new Error("Failed to load document")
        return res.json()
      })
      .then(data => {
        setDocDetails(data)
        setDocLoading(false)
        
        // Auto prepopulate edit inputs
        setEditTitle(data.title)
        setEditContent(data.html_content || data.content)
        setEditTags(data.tags || '')
      })
      .catch(err => {
        console.error(err)
        setDocLoading(false)
        setSelectedDocId(null)
      })

      // Fetch comments
      fetch(`/api/document/${selectedDocId}/comments`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => setComments(data))
      .catch(err => console.error(err))
    } else {
      setDocDetails(null)
      setComments([])
    }
  }

  useEffect(() => {
    fetchDocDetails()
  }, [selectedDocId])

  // 7. Auto Compile Table of Contents from headings
  useEffect(() => {
    if (docDetails && activeTab === 'document') {
      const timer = setTimeout(() => {
        const docContainer = document.querySelector('.wiki-content-rendered');
        if (docContainer) {
          const headingElements = docContainer.querySelectorAll('h1, h2, h3');
          const collectedHeadings = [];
          
          headingElements.forEach((el, index) => {
            if (!el.id) {
              el.id = `heading-${index}-${el.textContent.trim().toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')}`;
            }
            collectedHeadings.push({
              id: el.id,
              text: el.textContent.trim(),
              level: parseInt(el.tagName.substring(1), 10)
            });
          });
          setHeadings(collectedHeadings);
        } else {
          setHeadings([]);
        }
      }, 200);
      return () => clearTimeout(timer);
    } else {
      setHeadings([]);
    }
  }, [docDetails, activeTab])

  // --- API Mutation Helpers ---

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoginError('')
    setLoginLoading(true)
    
    const formData = new FormData()
    formData.append('username', loginUser)
    formData.append('password', loginPass)
    
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        body: formData
      })
      
      if (!response.ok) {
        const errData = response.status === 422 ? { detail: "Form fields required" } : await response.json()
        throw new Error(errData.detail || 'Login failed')
      }
      
      const data = await response.json()
      setToken(data.access_token)
      setUsername(data.username)
      setRole(data.role)
      localStorage.setItem('token', data.access_token)
      localStorage.setItem('username', data.username)
      localStorage.setItem('role', data.role)
      setActiveTab('search')
    } catch (err) {
      setLoginError(err.message)
    } finally {
      setLoginLoading(false)
    }
  }

  const handleLogout = () => {
    setToken('')
    setUsername('')
    setRole('')
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    localStorage.removeItem('role')
    setSelectedDocId(null)
  }

  const handleLike = async () => {
    if (!docDetails) return
    try {
      const response = await fetch(`/api/document/${docDetails.id}/like`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (response.ok) {
        const data = await response.json()
        setDocDetails(prev => ({ ...prev, likes: data.likes }))
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleFavoriteToggle = async () => {
    if (!docDetails) return
    try {
      const response = await fetch(`/api/document/${docDetails.id}/favorite`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (response.ok) {
        fetchFavorites()
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleAddComment = async (e) => {
    e.preventDefault()
    if (!commentText.trim() || !docDetails) return
    setCommentLoading(true)
    
    const formData = new FormData()
    formData.append('content', commentText)
    
    try {
      const response = await fetch(`/api/document/${docDetails.id}/comments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      })
      if (response.ok) {
        const newComment = await response.json()
        setComments(prev => [newComment, ...prev])
        setCommentText('')
      }
    } catch (err) {
      console.error(err)
    } finally {
      setCommentLoading(false)
    }
  }

  const handleDeleteComment = async (commentId) => {
    if (!window.confirm("Are you sure you want to delete this comment?")) return
    try {
      const response = await fetch(`/api/comment/${commentId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (response.ok) {
        setComments(prev => prev.filter(c => c.id !== commentId))
      }
    } catch (err) {
      console.error(err)
    }
  }

  const handleEditSubmit = async (e) => {
    e.preventDefault()
    setEditError('')
    setEditLoading(true)
    
    const formData = new FormData()
    formData.append('title', editTitle)
    formData.append('content', editContent)
    formData.append('tags', editTags)
    
    try {
      const response = await fetch(`/api/document/${selectedDocId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      })
      
      if (!response.ok) throw new Error("Failed to save changes")
      
      setIsEditing(false)
      fetchDocDetails()
    } catch (err) {
      setEditError(err.message)
    } finally {
      setEditLoading(false)
    }
  }

  // --- Rendering Helpers ---

  // Recursive Tree Node Renderer
  function TreeNode({ node, path = '' }) {
    const nodeKey = path ? `${path}/${node.title}` : node.title
    const isCollapsed = collapsedNodes.has(nodeKey)
    const hasChildren = node.children && node.children.length > 0
    
    const handleToggle = (e) => {
      e.stopPropagation()
      const newCollapsed = new Set(collapsedNodes)
      if (isCollapsed) {
        newCollapsed.delete(nodeKey)
      } else {
        newCollapsed.add(nodeKey)
      }
      setCollapsedNodes(newCollapsed)
    }
    
    const handleNodeClick = () => {
      if (node.id) {
        setSelectedDocId(node.id)
        setActiveTab('document')
      } else if (hasChildren) {
        handleToggle(null)
      }
    }
    
    // Filter logic
    const matchesFilter = (n) => {
      if (!treeFilter) return true
      if (n.title.toLowerCase().includes(treeFilter.toLowerCase())) return true
      if (n.children) return n.children.some(c => matchesFilter(c))
      return false
    }
    
    if (!matchesFilter(node)) return null
    
    return (
      <div className="tree-node">
        <div 
          className={`tree-row ${selectedDocId === node.id && activeTab === 'document' ? 'active' : ''}`}
          onClick={handleNodeClick}
        >
          {hasChildren ? (
            <ChevronRight 
              size={13} 
              className={`tree-chevron ${!isCollapsed ? 'open' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                handleToggle(e)
              }}
            />
          ) : (
            <span style={{ width: 13, flexShrink: 0 }}></span>
          )}
          
          {node.type === 'folder' ? (
            !isCollapsed ? (
              <FolderOpen size={14} className="tree-icon" style={{ color: '#fbbf24' }} />
            ) : (
              <Folder size={14} className="tree-icon" style={{ color: '#fbbf24' }} />
            )
          ) : (
            <FileText size={14} className="tree-icon" style={{ color: '#818cf8' }} />
          )}
          
          <span className="tree-title" title={node.title}>{node.title}</span>
        </div>
        
        {hasChildren && !isCollapsed && (
          <div className="tree-children">
            {node.children.map((child, idx) => (
              <TreeNode key={idx} node={child} path={nodeKey} />
            ))}
          </div>
        )}
      </div>
    )
  }

  // --- Auth Guards ---

  if (!token) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '20px'
      }}>
        <div className="glass-panel animate-fade-in" style={{
          width: '100%',
          maxHeight: '520px',
          maxWidth: '420px',
          padding: '40px 30px',
          border: '1px solid rgba(99, 102, 241, 0.15)',
          boxShadow: '0 0 50px rgba(99, 102, 241, 0.1)'
        }}>
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            {/* Magic Software SVG logo — always renders, no network dependency */}
            <div style={{ display: 'inline-flex', marginBottom: '20px' }}>
              <MagicLogoSVG height={88} />
            </div>
            <h2 style={{ fontSize: '1.55rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: '#ffffff', letterSpacing: '-0.02em', lineHeight: 1.15, marginBottom: '5px', margin: '0 0 5px 0' }}>
              Knowledge Centre
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.72rem', letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 500, margin: 0 }}>
              Magic Software Enterprise
            </p>
          </div>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 500 }}>USERNAME</label>
              <input 
                type="text" 
                className="input-field" 
                placeholder="Enter username (e.g. admin)" 
                value={loginUser}
                onChange={e => setLoginUser(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 500 }}>PASSWORD</label>
              <input 
                type="password" 
                className="input-field" 
                placeholder="Enter password (e.g. admin123)" 
                value={loginPass}
                onChange={e => setLoginPass(e.target.value)}
                required
              />
            </div>

            {loginError && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 14px',
                borderRadius: '8px',
                background: 'rgba(244, 63, 94, 0.1)',
                border: '1px solid rgba(244, 63, 94, 0.2)',
                color: 'var(--accent-rose)',
                fontSize: '0.85rem'
              }}>
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{loginError}</span>
              </div>
            )}

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }} disabled={loginLoading}>
              {loginLoading ? 'Signing In...' : 'Access System'}
            </button>
          </form>
          
          <div style={{ textAlign: 'center', marginTop: '24px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Magic Software Enterprise Knowledge Centre © 2026. All rights reserved.
          </div>
        </div>
      </div>
    )
  }

  const isFavorited = favorites.some(fav => fav.id === selectedDocId)

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* Top Banner Navigation Header */}
      <header className="glass-panel" style={{
        margin: '16px 24px',
        padding: '14px 28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderRadius: '16px',
        border: '1px solid rgba(255,255,255,0.06)'
      }}>
        {/* Enterprise Branding — Logo + Divider + Name/Company */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0', cursor: 'pointer' }} onClick={() => setSelectedDocId(null) || setActiveTab('search')}>
          {/* Self-contained SVG logo — always visible, no network request */}
          <MagicLogoSVG height={60} />
          {/* Vertical divider */}
          <div style={{ width: '1px', height: '40px', background: 'rgba(255,255,255,0.14)', margin: '0 16px', flexShrink: 0 }} />
          {/* Product name + company */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <h1 style={{ fontSize: '1.35rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: '#ffffff', letterSpacing: '-0.02em', lineHeight: 1, margin: 0 }}>
              Knowledge Centre
            </h1>
            <span style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.42)', letterSpacing: '0.13em', textTransform: 'uppercase', fontWeight: 500, fontFamily: 'var(--font-body)' }}>
              Magic Software Enterprise
            </span>
          </div>
        </div>

        {/* Action Navigation */}
        <nav style={{ display: 'flex', gap: '8px' }}>
          <button 
            className={`btn ${activeTab === 'search' && selectedDocId === null ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
            onClick={() => {
              setSelectedDocId(null)
              setActiveTab('search')
            }}
          >
            <Search size={16} /> Search Dashboard
          </button>
          
          {(role === 'Admin' || role === 'Editor') && (
            <button 
              className={`btn ${activeTab === 'upload' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '8px 16px', fontSize: '0.85rem' }}
              onClick={() => setActiveTab('upload')}
            >
              <Upload size={16} /> Upload & Write
            </button>
          )}

          {role === 'Admin' && (
            <button 
              className={`btn ${activeTab === 'admin' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '8px 16px', fontSize: '0.85rem' }}
              onClick={() => setActiveTab('admin')}
            >
              <Settings size={16} /> Admin Panel
            </button>
          )}
        </nav>

        {/* Profile Card & Logout */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRight: '1px solid rgba(255,255,255,0.08)', paddingRight: '16px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(99,102,241,0.2) 0%, rgba(6,182,212,0.2) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(255,255,255,0.1)'
            }}>
              <User size={14} style={{ color: '#818cf8' }} />
            </div>
            <div style={{ textAlign: 'left' }}>
              <p style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-main)', lineHeight: '1.2' }}>{username}</p>
              <span style={{ 
                fontSize: '0.65rem', 
                color: role === 'Admin' ? '#fb7185' : role === 'Editor' ? '#34d399' : '#9ca3af',
                fontWeight: 600,
                textTransform: 'uppercase'
              }}>{role}</span>
            </div>
          </div>
          
          <button 
            className="btn btn-secondary" 
            style={{ padding: '8px', borderRadius: '8px' }} 
            onClick={handleLogout}
            title="Log Out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* ================= MAIN THREE-PANE PORTAL WORKSPACE ================= */}
      <main style={{ flex: 1, padding: '0 24px 24px' }}>
        <div className={`workspace-layout ${activeTab !== 'document' || headings.length === 0 ? 'no-toc' : ''}`}>
          
          {/* 1. LEFT PANE - space selector / document hierarchy explorer */}
          <aside className="pane-panel left-sidebar-pane">
            <h3 style={{ fontSize: '0.8rem', color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: '12px' }}>
              Space Explorer
            </h3>
            
            {/* Space Dropdown Selector */}
            <select 
              className="input-field" 
              style={{ padding: '8px 12px', fontSize: '0.85rem', height: '36px', borderRadius: '6px', marginBottom: '16px', background: 'rgba(0,0,0,0.3)' }}
              value={selectedSpace}
              onChange={e => setSelectedSpace(e.target.value)}
            >
              {spaces.map((sp, idx) => (
                <option key={idx} value={sp}>{sp}</option>
              ))}
            </select>

            {/* Tree search filter */}
            <input 
              type="text"
              className="input-field"
              placeholder="Filter pages in space..."
              style={{ padding: '6px 10px', fontSize: '0.8rem', height: '32px', borderRadius: '6px', marginBottom: '12px' }}
              value={treeFilter}
              onChange={e => setTreeFilter(e.target.value)}
            />

            {/* Render Collapsible Page Tree */}
            <div className="tree-container">
              {spaceTree.length === 0 ? (
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>No pages found</span>
              ) : (
                spaceTree.map((node, idx) => (
                  <TreeNode key={idx} node={node} />
                ))
              )}
            </div>

            {/* Favorites / Bookmarked Pinned Pages list */}
            <div style={{ marginTop: '28px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '20px' }}>
              <h4 style={{ fontSize: '0.78rem', color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                <Bookmark size={12} style={{ color: '#fbbf24' }} /> Favorites
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {favorites.length === 0 ? (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', paddingLeft: '4px' }}>No starred pages</span>
                ) : (
                  favorites.map(fav => (
                    <div 
                      key={fav.id}
                      style={{ fontSize: '0.8rem', color: 'var(--text-muted)', cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '4px 6px', borderRadius: '4px' }}
                      className="tree-row"
                      onClick={() => {
                        setSelectedDocId(fav.id)
                        setActiveTab('document')
                      }}
                    >
                      ★ {fav.title}
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>

          {/* 2. CENTER PANE - welcome metrics / search portal / document reader / upload and write panels */}
          <section className="center-content-pane">
            
            {/* View A: SEARCH DASHBOARD (and landing stats) */}
            {activeTab === 'search' && selectedDocId === null && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                
                {/* Stats grid dashboard overlay */}
                {stats && (
                  <div>
                    <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '14px', fontWeight: 600 }}>
                      Global Metrics Hub
                    </h3>
                    <div className="stats-cards-grid">
                      <div className="stat-dashboard-card">
                        <span className="stat-card-label">Total SOP Pages</span>
                        <span className="stat-card-value">{stats.total_documents}</span>
                      </div>
                      <div className="stat-dashboard-card">
                        <span className="stat-card-label">Document Reads</span>
                        <span className="stat-card-value">{stats.total_views}</span>
                      </div>
                      <div className="stat-dashboard-card">
                        <span className="stat-card-label">Knowledge Likes</span>
                        <span className="stat-card-value">{stats.total_likes}</span>
                      </div>
                      <div className="stat-dashboard-card">
                        <span className="stat-card-label">Comments Posted</span>
                        <span className="stat-card-value">{stats.total_comments}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Core Search Portal Widget */}
                <SearchPortal token={token} onSelectDoc={(id) => {
                  setSelectedDocId(id)
                  setActiveTab('document')
                }} />

                {/* Trending Articles below Search Portal */}
                {stats && stats.trending && stats.trending.length > 0 && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '24px', marginTop: '16px' }}>
                    <h3 style={{ fontSize: '1rem', color: '#fff', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <TrendingUp size={16} style={{ color: '#818cf8' }} /> Popular Trending Articles
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      {stats.trending.map(tDoc => (
                        <div 
                          key={tDoc.id}
                          className="glass-panel glass-panel-hover"
                          style={{ padding: '16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                          onClick={() => {
                            setSelectedDocId(tDoc.id)
                            setActiveTab('document')
                          }}
                        >
                          <div>
                            <h4 style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 500 }}>{tDoc.title}</h4>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Format: {tDoc.file_type.toUpperCase()}</span>
                          </div>
                          <div style={{ display: 'flex', gap: '12px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            <span>👁 {tDoc.views}</span>
                            <span>👍 {tDoc.likes}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* View B: DOCUMENT VIEWER */}
            {activeTab === 'document' && selectedDocId !== null && (
              <div>
                {docLoading ? (
                  // Loader skeleton
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ width: '40%', height: '14px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px' }} className="animate-pulse"></div>
                    <div style={{ width: '100%', height: '240px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }} className="animate-pulse"></div>
                    <div style={{ width: '85%', height: '120px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px' }} className="animate-pulse"></div>
                  </div>
                ) : docDetails ? (
                  <article>
                    
                    {/* Document Header Row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '8px' }}>
                      <div>
                        {/* Parent breadcrumbs */}
                        {docDetails.breadcrumbs && docDetails.breadcrumbs.length > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
                            {docDetails.breadcrumbs.map((crumb, idx) => (
                              <React.Fragment key={idx}>
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{crumb}</span>
                                {idx < docDetails.breadcrumbs.length - 1 && <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.15)' }}>/</span>}
                              </React.Fragment>
                            ))}
                          </div>
                        )}
                        <h2 style={{ fontSize: '1.8rem', color: '#fff', fontWeight: 700, fontFamily: 'var(--font-display)', lineHeight: '1.3' }}>
                          {docDetails.title}
                        </h2>
                      </div>

                      {/* Header Actions */}
                      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                        {/* Star bookmark */}
                        <button 
                          className="btn btn-secondary" 
                          style={{ padding: '8px', borderRadius: '8px', color: isFavorited ? '#fbbf24' : 'var(--text-muted)' }}
                          onClick={handleFavoriteToggle}
                          title={isFavorited ? 'Remove from favorites' : 'Add to favorites'}
                        >
                          <Star size={16} fill={isFavorited ? '#fbbf24' : 'transparent'} />
                        </button>
                        
                        {/* Inline Editor (restricted roles) */}
                        {(role === 'Admin' || role === 'Editor') && (
                          <button 
                            className="btn btn-secondary"
                            style={{ padding: '8px', borderRadius: '8px' }}
                            onClick={() => {
                              setEditTitle(docDetails.title)
                              setEditContent(docDetails.html_content || docDetails.content)
                              setEditTags(docDetails.tags || '')
                              setIsEditing(true)
                            }}
                            title="Edit Document"
                          >
                            <Edit size={16} />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Metadata summary bar */}
                    <div style={{ 
                      display: 'flex', 
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      gap: '20px', 
                      paddingBottom: '16px', 
                      marginBottom: '24px', 
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                      fontSize: '0.8rem',
                      color: 'var(--text-muted)'
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <User size={12} /> Creator: <strong style={{ color: 'var(--text-main)' }}>{docDetails.author}</strong>
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Calendar size={12} /> Date: <strong style={{ color: 'var(--text-main)' }}>{docDetails.created_at}</strong>
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase' }}>
                        <Clock size={12} /> Format: <strong style={{ color: 'var(--primary)' }}>{docDetails.file_type}</strong>
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: 'auto' }}>
                        👁 {docDetails.views} views
                      </span>
                      <button 
                        onClick={handleLike} 
                        style={{ border: 'none', background: 'rgba(255,255,255,0.04)', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', transition: 'var(--transition-smooth)' }}
                        className="btn-secondary"
                      >
                        <ThumbsUp size={12} /> {docDetails.likes || 0} Likes
                      </button>
                    </div>

                    {/* Render Tags */}
                    {docDetails.tags && (
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '24px' }}>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tags:</span>
                        <div className="tags-wrapper">
                          {docDetails.tags.split(',').map((t, i) => (
                            <span key={i} className="tag-badge">#{t.trim()}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Document main content rendering */}
                    <div style={{ minHeight: '200px', marginBottom: '40px' }}>
                      {docDetails.html_content ? (
                        <div 
                          className="wiki-content-rendered"
                          dangerouslySetInnerHTML={{ __html: docDetails.html_content }}
                        />
                      ) : (
                        <div style={{ whiteSpace: 'pre-wrap', color: '#d1d5db', fontSize: '0.95rem', lineHeight: '1.7', fontFamily: 'var(--font-sans)' }}>
                          {docDetails.content}
                        </div>
                      )}
                    </div>

                    {/* Collaborative comments threads */}
                    <div className="comment-section-container">
                      <h3 style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <MessageSquare size={16} /> Comments ({comments.length})
                      </h3>
                      
                      {/* Comment submission form */}
                      <form onSubmit={handleAddComment} className="comment-input-area">
                        <textarea 
                          className="input-field" 
                          placeholder="Write a reply or comment to discuss this SOP..."
                          value={commentText}
                          onChange={e => setCommentText(e.target.value)}
                          style={{ minHeight: '80px', resize: 'vertical', fontSize: '0.85rem' }}
                          required
                        />
                        <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start', padding: '6px 14px', fontSize: '0.8rem' }} disabled={commentLoading}>
                          {commentLoading ? 'Posting...' : 'Post Comment'}
                        </button>
                      </form>

                      {/* Comments Feed List */}
                      <div className="comment-list">
                        {comments.length === 0 ? (
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>
                            No comments posted yet. Be the first to start the discussion!
                          </div>
                        ) : (
                          comments.map(c => (
                            <div key={c.id} className="comment-bubble">
                              <div className="comment-bubble-header">
                                <div className="comment-author-info">
                                  <div className="comment-author-avatar">
                                    {c.username.substring(0, 1).toUpperCase()}
                                  </div>
                                  <strong style={{ color: '#fff' }}>{c.username}</strong>
                                  <span className="comment-meta-time">{c.created_at}</span>
                                </div>

                                {/* Delete comments */}
                                {(c.username === username || role === 'Admin' || role === 'Editor') && (
                                  <button 
                                    className="comment-delete-btn"
                                    onClick={() => handleDeleteComment(c.id)}
                                  >
                                    <Trash2 size={12} /> Delete
                                  </button>
                                )}
                              </div>
                              <div className="comment-bubble-body">
                                {c.content}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                  </article>
                ) : null}
              </div>
            )}

            {/* View C: UPLOAD & COMPOSE PORTAL */}
            {activeTab === 'upload' && (
              <UploadPortal token={token} />
            )}

            {/* View D: ADMIN PANEL CONTROL PANEL */}
            {activeTab === 'admin' && (
              <AdminPanel token={token} />
            )}

          </section>

          {/* 3. RIGHT PANE - Floating page Context / Table of Contents */}
          {activeTab === 'document' && headings.length > 0 && (
            <aside className="pane-panel right-toc-pane">
              <div className="toc-container">
                <span className="toc-title">Table of Contents</span>
                {headings.map((item, idx) => (
                  <a 
                    key={idx}
                    href={`#${item.id}`}
                    className={`toc-item ${item.level === 1 ? 'h1-level' : item.level === 2 ? 'h2-level' : 'h3-level'}`}
                    onClick={(e) => {
                      e.preventDefault()
                      document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth' })
                    }}
                  >
                    {item.text}
                  </a>
                ))}
              </div>
            </aside>
          )}

        </div>
      </main>

      {/* ================= DOCUMENT IN-PLACE WRITER EDITOR MODAL ================= */}
      {isEditing && (
        <div className="editor-backdrop" onClick={() => setIsEditing(false)}>
          <div className="editor-dialog animate-fade-in" onClick={e => e.stopPropagation()}>
            
            {/* Header */}
            <div className="editor-header">
              <h2 style={{ fontSize: '1.25rem', color: '#fff', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Edit size={18} style={{ color: '#818cf8' }} /> Edit: {docDetails?.title}
              </h2>
              <button 
                className="btn btn-secondary" 
                style={{ padding: '6px', borderRadius: '50%' }}
                onClick={() => setIsEditing(false)}
              >
                <X size={16} />
              </button>
            </div>

            {/* Form Fields Body */}
            <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
              <div className="editor-body">
                
                {/* Title */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>DOCUMENT TITLE</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    required
                  />
                </div>

                {/* Tags */}
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>TAGS (Comma separated, e.g. "sap, server, error")</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    placeholder="e.g. troubleshooting, monitor, config"
                    value={editTags}
                    onChange={e => setEditTags(e.target.value)}
                  />
                </div>

                {/* Content Area */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}>BODY CONTENT</label>
                  <textarea 
                    className="input-field"
                    value={editContent}
                    onChange={e => setEditContent(e.target.value)}
                    style={{
                      flex: 1,
                      minHeight: '260px',
                      resize: 'none',
                      fontFamily: docDetails?.file_type === 'html' ? 'monospace' : 'inherit',
                      fontSize: '0.88rem',
                      lineHeight: '1.5'
                    }}
                    required
                  />
                </div>

                {editError && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: 'rgba(244, 63, 94, 0.1)',
                    border: '1px solid rgba(244, 63, 94, 0.2)',
                    color: 'var(--accent-rose)',
                    fontSize: '0.85rem'
                  }}>
                    <AlertCircle size={14} />
                    <span>{editError}</span>
                  </div>
                )}
              </div>

              {/* Actions Footer */}
              <div className="editor-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsEditing(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={editLoading}>
                  {editLoading ? 'Saving changes...' : 'Save SOP'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* Footer footer */}
      <footer style={{
        marginTop: 'auto',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        padding: '16px 24px',
        textAlign: 'center',
        fontSize: '0.75rem',
        color: 'var(--text-muted)',
        background: 'rgba(6, 4, 13, 0.4)'
      }}>
        Magic Software Enterprise Knowledge Centre © 2026. All rights reserved. Powered by Magic Global Support.
      </footer>

    </div>
  )
}
