import React, { useState, useEffect } from 'react'
import { 
  Search, 
  Upload, 
  Settings, 
  LogOut, 
  LogIn,
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
  Sparkles,
  Bell,
  Layers,
  Zap,
  Workflow,
  Cloud,
  FilePlus2,
  ArrowLeft,
  Copy,
  Check,
  Printer
} from 'lucide-react'

import ProductTabs from './components/ProductTabs'
import ProductHub from './components/ProductHub'
import SearchPortal from './components/SearchPortal'
import UploadPortal from './components/UploadPortal'
import AdminPanel from './components/AdminPanel'
import AICopilotModal from './components/AICopilotModal'
import KBAuthorModal from './components/KBAuthorModal'
import NotificationFeed from './components/NotificationFeed'

// Inline high-fidelity SVG of Magic Software logo — perfectly scales without pixelation or clipping
const MagicLogoSVG = ({ height = 44 }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 265" height={height} style={{ width: 'auto', display: 'block', flexShrink: 0 }}>
      <defs>
        <linearGradient id="magicGrad" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#00568C"/>
          <stop offset="50%" stopColor="#008DC7"/>
          <stop offset="100%" stopColor="#2DBCEE"/>
        </linearGradient>
      </defs>
      <path fill="url(#magicGrad)" d="M112 10 C162 6 213 50 213 108 C213 168 180 226 126 250 C90 264 46 246 22 211 C-2 176 2 114 28 72 C54 30 76 14 112 10Z"/>
      <text x="111" y="152" fontFamily="'Helvetica Neue',Arial,sans-serif" fontSize="52" fontWeight="800" fill="white" textAnchor="middle" letterSpacing="-2">magic</text>
      <circle cx="180" cy="108" r="7" fill="none" stroke="white" strokeWidth="1.8"/>
      <text x="180" y="113" fontFamily="Arial,sans-serif" fontSize="9" fill="white" textAnchor="middle" fontWeight="700">R</text>
      <text x="111" y="198" fontFamily="Arial,sans-serif" fontSize="15.5" fill="rgba(255,255,255,0.92)" textAnchor="middle">a <tspan fontWeight="700" fontStyle="italic">matrix</tspan> company</text>
    </svg>
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontSize: '1.05rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.01em', lineHeight: 1.1 }}>
        Knowledge Center
      </span>
      <span style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: 600, letterSpacing: '0.04em' }}>
        MAGIC SOFTWARE ENTERPRISES
      </span>
    </div>
  </div>
)

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '')
  const [username, setUsername] = useState(localStorage.getItem('username') || '')
  const [role, setRole] = useState(localStorage.getItem('role') || '')
  
  // Navigation & Product Scope
  const [activeProduct, setActiveProduct] = useState('all') // 'all', 'xpa', 'xpi', 'cloud_native'
  const [activeTab, setActiveTab] = useState('home') // 'home', 'search', 'document', 'upload', 'admin'
  const [searchInitialQuery, setSearchInitialQuery] = useState('')

  // Modals & Panels
  const [showCopilotModal, setShowCopilotModal] = useState(false)
  const [copilotInitialQuery, setCopilotInitialQuery] = useState('')
  const [showKBAuthorModal, setShowKBAuthorModal] = useState(false)
  const [showNotificationFeed, setShowNotificationFeed] = useState(false)
  const [showLoginModal, setShowLoginModal] = useState(false)

  // Notifications
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)

  // Products Overview Data
  const [overviewData, setOverviewData] = useState(null)

  // Left Tree Navigation states
  const [spaces, setSpaces] = useState([])
  const [selectedSpace, setSelectedSpace] = useState('all')
  const [spaceTree, setSpaceTree] = useState([])
  const [collapsedNodes, setCollapsedNodes] = useState(new Set())
  const [treeFilter, setTreeFilter] = useState('')
  
  // Favorites / Bookmarks & Pins
  const [favorites, setFavorites] = useState([])
  const [pinnedDocs, setPinnedDocs] = useState([])
  const [recentlyViewed, setRecentlyViewed] = useState([])
  
  // Active Document Viewer states
  const [selectedDocId, setSelectedDocId] = useState(null)
  const [docDetails, setDocDetails] = useState(null)
  const [docLoading, setDocLoading] = useState(false)
  const [docSearchQuery, setDocSearchQuery] = useState('')
  
  // Comments states
  const [comments, setComments] = useState([])
  const [commentText, setCommentText] = useState('')
  const [commentLoading, setCommentLoading] = useState(false)

  // In-Place Editor states
  const [isEditing, setIsEditing] = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editProduct, setEditProduct] = useState('xpi')
  const [editVersion, setEditVersion] = useState('Universal')
  const [editTags, setEditTags] = useState('')
  const [editLoading, setEditLoading] = useState(false)

  // Login states
  const [loginUser, setLoginUser] = useState('')
  const [loginPass, setLoginPass] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  // 1. Verify Token & Refresh Auth
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

  // 2. Fetch Products Overview
  const fetchOverview = () => {
    fetch('/api/products/overview')
      .then(res => res.json())
      .then(data => {
        setOverviewData(data)
        if (data.pinned) setPinnedDocs(data.pinned)
      })
      .catch(err => console.error(err))
  }

  useEffect(() => {
    fetchOverview()
    fetchNotifications()
    fetchFavorites()
    fetchRecentlyViewed()
  }, [token, activeProduct])

  // 3. Fetch Notifications
  const fetchNotifications = () => {
    fetch('/api/notifications')
      .then(res => res.json())
      .then(data => {
        setNotifications(data.notifications || [])
        setUnreadCount(data.unread_count || 0)
      })
      .catch(() => {})
  }

  // 4. Fetch Space Page Tree
  useEffect(() => {
    const url = `/api/space/${encodeURIComponent(selectedSpace)}/tree?product=${activeProduct}`
    fetch(url)
      .then(res => res.json())
      .then(data => setSpaceTree(data))
      .catch(() => {})
  }, [selectedSpace, activeProduct])

  // 5. Fetch Favorites & Recents
  const fetchFavorites = () => {
    if (token) {
      fetch('/api/favorites', { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.json())
        .then(data => setFavorites(data))
        .catch(() => {})
    } else {
      // Local storage favorites for guest mode
      try {
        const localFavs = JSON.parse(localStorage.getItem('guest_favorites') || '[]')
        setFavorites(localFavs)
      } catch (e) {}
    }
  }

  const fetchRecentlyViewed = () => {
    const ids = localStorage.getItem('recently_viewed_ids') || ''
    if (ids) {
      fetch(`/api/recently-viewed?ids=${ids}`)
        .then(res => res.json())
        .then(data => setRecentlyViewed(data))
        .catch(() => {})
    }
  }

  // 6. Handle Document Selection
  const handleSelectDoc = (docId, query = '') => {
    setSelectedDocId(docId)
    setDocSearchQuery(query)
    setActiveTab('document')
    setDocLoading(true)
    setIsEditing(false)

    // Save to recents in localStorage
    try {
      let recents = (localStorage.getItem('recently_viewed_ids') || '').split(',').filter(Boolean)
      recents = [String(docId), ...recents.filter(id => id !== String(docId))].slice(0, 8)
      localStorage.setItem('recently_viewed_ids', recents.join(','))
    } catch (e) {}

    fetch(`/api/document/${docId}${query ? `?q=${encodeURIComponent(query)}` : ''}`)
      .then(res => {
        if (!res.ok) throw new Error('Document not found')
        return res.json()
      })
      .then(data => {
        setDocDetails(data)
        setEditTitle(data.title)
        setEditContent(data.content)
        setEditProduct(data.product || 'xpi')
        setEditVersion(data.version || 'Universal')
        setEditTags(data.tags || '')
      })
      .catch(err => {
        setDocDetails(null)
      })
      .finally(() => setDocLoading(false))

    // Fetch comments for this document
    fetch(`/api/document/${docId}/comments`)
      .then(res => res.json())
      .then(data => setComments(data))
      .catch(() => setComments([]))
  }

  // Pin toggle (Works for all users!)
  const handleTogglePin = async (docId) => {
    try {
      const res = await fetch(`/api/document/${docId}/pin`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to toggle pin')
      const data = await res.json()
      if (docDetails && docDetails.id === docId) {
        setDocDetails(prev => ({ ...prev, is_pinned: data.is_pinned }))
      }
      fetchOverview()
    } catch (err) {
      alert(err.message)
    }
  }

  // Like document
  const handleLikeDoc = async (docId) => {
    try {
      const res = await fetch(`/api/document/${docId}/like`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to like')
      const data = await res.json()
      setDocDetails(prev => ({ ...prev, likes: data.likes }))
    } catch (err) {}
  }

  // Add Comment
  const handleAddComment = async (e) => {
    e.preventDefault()
    if (!commentText.trim() || !selectedDocId) return
    if (!token) {
      setShowLoginModal(true)
      return
    }

    setCommentLoading(true)
    const formData = new FormData()
    formData.append('content', commentText)

    try {
      const res = await fetch(`/api/document/${selectedDocId}/comments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      })
      if (!res.ok) throw new Error('Failed to post comment')
      const newComment = await res.json()
      setComments(prev => [newComment, ...prev])
      setCommentText('')
    } catch (err) {
      alert(err.message)
    } finally {
      setCommentLoading(false)
    }
  }

  // Login handler
  const handleLoginSubmit = async (e) => {
    e.preventDefault()
    setLoginError('')
    setLoginLoading(true)

    const formData = new FormData()
    formData.append('username', loginUser)
    formData.append('password', loginPass)

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        body: formData
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Invalid username or password')
      }
      const data = await res.json()
      setToken(data.access_token)
      setUsername(data.username)
      setRole(data.role)
      localStorage.setItem('token', data.access_token)
      localStorage.setItem('username', data.username)
      localStorage.setItem('role', data.role)
      setShowLoginModal(false)
      setLoginUser('')
      setLoginPass('')
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
    if (activeTab === 'admin' || activeTab === 'upload') {
      setActiveTab('home')
    }
  }

  const handleProductSwitch = (prodId, optionalQuery = '') => {
    setActiveProduct(prodId)
    if (optionalQuery) {
      setSearchInitialQuery(optionalQuery)
      setActiveTab('search')
    } else if (activeTab === 'document') {
      setActiveTab('home')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#06040d' }}>
      {/* Top Global Navigation Bar */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 1000,
          background: 'rgba(6, 4, 13, 0.85)',
          backdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          padding: '10px 24px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: '1440px', margin: '0 auto', gap: '16px' }}>
          {/* Brand Logo */}
          <div 
            onClick={() => {
              setActiveTab('home')
              setSelectedDocId(null)
            }}
            style={{ cursor: 'pointer' }}
          >
            <MagicLogoSVG height={44} />
          </div>

          {/* Product Tabs Navigation */}
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <ProductTabs
              activeProduct={activeProduct}
              onSelectProduct={handleProductSwitch}
              productStats={overviewData}
            />
          </div>

          {/* Action Tools */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* AI Copilot Button */}
            <button
              onClick={() => {
                setCopilotInitialQuery('')
                setShowCopilotModal(true)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, rgba(0, 141, 199, 0.25), rgba(45, 188, 238, 0.2))',
                border: '1px solid rgba(45, 188, 238, 0.4)',
                color: '#38bdf8',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer',
                boxShadow: '0 2px 10px rgba(0, 141, 199, 0.25)'
              }}
            >
              <Sparkles size={15} />
              <span>Ask AI Copilot</span>
            </button>

            {/* Notification Bell */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setShowNotificationFeed(prev => !prev)}
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  color: '#e2e8f0',
                  width: '36px',
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  position: 'relative'
                }}
              >
                <Bell size={17} />
                {unreadCount > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-3px',
                      right: '-3px',
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: '#008DC7',
                      color: '#ffffff',
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '2px solid #06040d'
                    }}
                  >
                    {unreadCount}
                  </span>
                )}
              </button>

              <NotificationFeed
                isOpen={showNotificationFeed}
                onClose={() => setShowNotificationFeed(false)}
                notifications={notifications}
                unreadCount={unreadCount}
                onSelectDoc={handleSelectDoc}
                onMarkAllRead={async () => {
                  await fetch('/api/notifications/read-all', { method: 'POST' })
                  fetchNotifications()
                }}
                onMarkRead={async (id) => {
                  await fetch(`/api/notifications/${id}/read`, { method: 'POST' })
                  fetchNotifications()
                }}
              />
            </div>

            {/* Write KB & Upload (Editors/Admins) */}
            {['Admin', 'Editor'].includes(role) && (
              <>
                <button
                  onClick={() => setShowKBAuthorModal(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '7px 12px',
                    borderRadius: '8px',
                    background: 'rgba(16, 185, 129, 0.15)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    color: '#34d399',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    cursor: 'pointer'
                  }}
                >
                  <FilePlus2 size={15} />
                  <span>Write KB</span>
                </button>

                <button
                  onClick={() => setActiveTab('upload')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '7px 12px',
                    borderRadius: '8px',
                    background: activeTab === 'upload' ? 'rgba(0, 141, 199, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                    border: activeTab === 'upload' ? '1px solid #008DC7' : '1px solid rgba(255, 255, 255, 0.1)',
                    color: activeTab === 'upload' ? '#38bdf8' : '#e2e8f0',
                    fontWeight: 600,
                    fontSize: '0.82rem',
                    cursor: 'pointer'
                  }}
                >
                  <Upload size={15} />
                  <span>Upload</span>
                </button>
              </>
            )}

            {/* Admin Panel Button */}
            {role === 'Admin' && (
              <button
                onClick={() => setActiveTab('admin')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 12px',
                  borderRadius: '8px',
                  background: activeTab === 'admin' ? 'rgba(244, 63, 94, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  border: activeTab === 'admin' ? '1px solid #f43f5e' : '1px solid rgba(255, 255, 255, 0.1)',
                  color: activeTab === 'admin' ? '#f43f5e' : '#e2e8f0',
                  fontWeight: 600,
                  fontSize: '0.82rem',
                  cursor: 'pointer'
                }}
              >
                <Settings size={15} />
                <span>Admin Suite</span>
              </button>
            )}

            {/* User Auth Profile */}
            {token ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)' }}>
                  <User size={14} style={{ color: '#008DC7' }} />
                  <span style={{ fontSize: '0.82rem', color: '#fff', fontWeight: 600 }}>{username}</span>
                </div>
                <button
                  onClick={handleLogout}
                  title="Sign Out"
                  style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer' }}
                >
                  <LogOut size={16} />
                </button>
              </div>
            ) : (
              <button
                id="btn-open-signin"
                onClick={() => setShowLoginModal(true)}
                style={{
                  padding: '7px 14px',
                  borderRadius: '8px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#ffffff',
                  fontWeight: 600,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <LogIn size={15} /> Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div style={{ display: 'flex', flex: 1, maxWidth: '1440px', margin: '0 auto', width: '100%', padding: '24px 20px', gap: '24px' }}>
        {/* Left Explorer Sidebar */}
        <aside
          style={{
            width: '280px',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '20px'
          }}
        >
          {/* Product Category Tree */}
          <div className="glass-panel" style={{ padding: '16px', borderRadius: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '12px', color: '#e2e8f0', fontSize: '0.88rem', fontWeight: 700 }}>
              <FolderOpen size={16} style={{ color: '#008DC7' }} />
              <span>Product Category Explorer</span>
            </div>

            <input
              type="text"
              placeholder="Filter topics..."
              value={treeFilter}
              onChange={(e) => setTreeFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 10px',
                borderRadius: '6px',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                color: '#fff',
                fontSize: '0.78rem',
                outline: 'none',
                marginBottom: '10px'
              }}
            />

            <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
              {spaceTree && spaceTree.length > 0 ? (
                spaceTree
                  .filter(node => !treeFilter || node.title.toLowerCase().includes(treeFilter.toLowerCase()))
                  .map((node, i) => (
                    <div
                      key={i}
                      onClick={() => {
                        if (node.id) handleSelectDoc(node.id)
                      }}
                      style={{
                        padding: '6px 8px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        color: selectedDocId === node.id ? '#38bdf8' : '#cbd5e1',
                        background: selectedDocId === node.id ? 'rgba(0, 141, 199, 0.15)' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                      onMouseEnter={(e) => {
                        if (selectedDocId !== node.id) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
                      }}
                      onMouseLeave={(e) => {
                        if (selectedDocId !== node.id) e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      {node.type === 'folder' ? <Folder size={14} style={{ color: '#f59e0b' }} /> : <FileText size={14} style={{ color: '#008DC7' }} />}
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.title}</span>
                    </div>
                  ))
              ) : (
                <p style={{ fontSize: '0.78rem', color: '#64748b', textAlign: 'center', padding: '8px' }}>
                  Loading category tree...
                </p>
              )}
            </div>
          </div>

          {/* Pinned SOPs (Visible to all users) */}
          <div className="glass-panel" style={{ padding: '16px', borderRadius: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', color: '#f59e0b', fontSize: '0.85rem', fontWeight: 700 }}>
              <Star size={15} style={{ fill: '#f59e0b' }} />
              <span>Pinned Guides (All Users)</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {pinnedDocs && pinnedDocs.length > 0 ? (
                pinnedDocs.slice(0, 5).map(doc => (
                  <div
                    key={doc.id}
                    onClick={() => handleSelectDoc(doc.id)}
                    style={{
                      fontSize: '0.78rem',
                      color: selectedDocId === doc.id ? '#38bdf8' : '#e2e8f0',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      background: selectedDocId === doc.id ? 'rgba(0,141,199,0.15)' : 'rgba(255,255,255,0.02)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    • {doc.title}
                  </div>
                ))
              ) : (
                <p style={{ fontSize: '0.75rem', color: '#64748b' }}>No pinned articles yet.</p>
              )}
            </div>
          </div>

          {/* My Bookmarks / Favorites */}
          <div className="glass-panel" style={{ padding: '16px', borderRadius: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', color: '#38bdf8', fontSize: '0.85rem', fontWeight: 700 }}>
              <Bookmark size={15} />
              <span>My Bookmarks</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {favorites && favorites.length > 0 ? (
                favorites.slice(0, 5).map(doc => (
                  <div
                    key={doc.id}
                    onClick={() => handleSelectDoc(doc.id)}
                    style={{
                      fontSize: '0.78rem',
                      color: selectedDocId === doc.id ? '#38bdf8' : '#e2e8f0',
                      padding: '6px 8px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      background: 'rgba(255,255,255,0.02)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    • {doc.title}
                  </div>
                ))
              ) : (
                <p style={{ fontSize: '0.75rem', color: '#64748b' }}>No bookmarks saved yet.</p>
              )}
            </div>
          </div>

          {/* Recently Viewed */}
          {recentlyViewed && recentlyViewed.length > 0 && (
            <div className="glass-panel" style={{ padding: '16px', borderRadius: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', color: '#94a3b8', fontSize: '0.85rem', fontWeight: 700 }}>
                <Clock size={15} />
                <span>Recently Viewed</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {recentlyViewed.slice(0, 4).map(doc => (
                  <div
                    key={doc.id}
                    onClick={() => handleSelectDoc(doc.id)}
                    style={{
                      fontSize: '0.78rem',
                      color: '#cbd5e1',
                      padding: '4px 6px',
                      cursor: 'pointer',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    • {doc.title}
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Central Workspace Area */}
        <main style={{ flex: 1, minWidth: 0 }}>
          {/* HOME / OVERVIEW VIEW */}
          {activeTab === 'home' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Omnibox Search bar on top */}
              <SearchPortal
                token={token}
                onSelectDoc={handleSelectDoc}
                onOpenCopilot={(q) => {
                  setCopilotInitialQuery(q)
                  setShowCopilotModal(true)
                }}
                activeProduct={activeProduct}
              />

              {/* Product Hub Overview */}
              <ProductHub
                activeProduct={activeProduct}
                onSelectProduct={handleProductSwitch}
                onSelectDoc={handleSelectDoc}
                onOpenCopilot={() => setShowCopilotModal(true)}
                overviewData={overviewData}
              />
            </div>
          )}

          {/* SEARCH SPECIFIC VIEW */}
          {activeTab === 'search' && (
            <SearchPortal
              token={token}
              onSelectDoc={handleSelectDoc}
              onOpenCopilot={(q) => {
                setCopilotInitialQuery(q)
                setShowCopilotModal(true)
              }}
              activeProduct={activeProduct}
              initialQuery={searchInitialQuery}
            />
          )}

          {/* DOCUMENT READER VIEW */}
          {activeTab === 'document' && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Back to Hub Bar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  onClick={() => setActiveTab('home')}
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    color: '#cbd5e1',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    cursor: 'pointer'
                  }}
                >
                  <ArrowLeft size={16} /> Back to Product Hub
                </button>

                {docDetails && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {/* Pin Document Button (Functional for all users!) */}
                    <button
                      onClick={() => handleTogglePin(docDetails.id)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        background: docDetails.is_pinned ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255,255,255,0.06)',
                        border: docDetails.is_pinned ? '1px solid #f59e0b' : '1px solid rgba(255,255,255,0.1)',
                        color: docDetails.is_pinned ? '#fbbf24' : '#e2e8f0',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Star size={14} style={{ fill: docDetails.is_pinned ? '#fbbf24' : 'none' }} />
                      <span>{docDetails.is_pinned ? 'Pinned SOP' : 'Pin Document'}</span>
                    </button>

                    {/* Like Document Button */}
                    <button
                      onClick={() => handleLikeDoc(docDetails.id)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: '8px',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        color: '#e2e8f0',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <ThumbsUp size={14} />
                      <span>{docDetails.likes || 0} Helpful</span>
                    </button>

                    {/* Edit Document (Editors/Admins) */}
                    {['Admin', 'Editor'].includes(role) && (
                      <button
                        onClick={() => setIsEditing(prev => !prev)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '8px',
                          background: isEditing ? 'rgba(0,141,199,0.3)' : 'rgba(255,255,255,0.06)',
                          border: '1px solid rgba(0,141,199,0.4)',
                          color: '#38bdf8',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <Edit size={14} />
                        <span>{isEditing ? 'Close Editor' : 'Edit Document'}</span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Document Container */}
              {docLoading ? (
                <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
                  <Sparkles size={32} className="animate-spin" style={{ margin: '0 auto 12px auto', color: '#008DC7' }} />
                  <p>Loading document content...</p>
                </div>
              ) : docDetails ? (
                <div className="glass-panel" style={{ padding: '32px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {/* Document Header Metadata */}
                  <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '20px', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: 'rgba(0, 141, 199, 0.15)', color: '#38bdf8', textTransform: 'uppercase' }}>
                        {docDetails.product} Platform
                      </span>
                      <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.08)', color: '#e2e8f0' }}>
                        {docDetails.version || 'Universal'}
                      </span>
                      <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#94a3b8' }}>
                        Format: {docDetails.file_type}
                      </span>
                    </div>

                    <h1 style={{ fontSize: '1.85rem', fontWeight: 800, color: '#ffffff', lineHeight: 1.3, marginBottom: '8px' }}>
                      {docDetails.title}
                    </h1>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.8rem', color: '#94a3b8' }}>
                      <span>Author: <strong>{docDetails.author || 'System'}</strong></span>
                      <span>•</span>
                      <span>Updated: {docDetails.created_at}</span>
                      <span>•</span>
                      <span>{docDetails.views || 0} Total Views</span>
                    </div>
                  </div>

                  {/* Document Body */}
                  {docDetails.html_content ? (
                    <div
                      className="confluence-body wiki-content"
                      dangerouslySetInnerHTML={{ __html: docDetails.html_content }}
                      style={{ color: '#e2e8f0', fontSize: '0.96rem', lineHeight: 1.8 }}
                    />
                  ) : (
                    <div style={{ color: '#e2e8f0', fontSize: '0.96rem', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                      {docDetails.content}
                    </div>
                  )}

                  {/* Comments Section */}
                  <div style={{ marginTop: '40px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '24px' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <MessageSquare size={18} style={{ color: '#008DC7' }} /> Technical Discussion & Comments ({comments.length})
                    </h3>

                    {/* Add comment input */}
                    <form onSubmit={handleAddComment} style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                      <input
                        type="text"
                        placeholder="Add a troubleshooting note, tip, or feedback..."
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        style={{
                          flex: 1,
                          padding: '10px 14px',
                          borderRadius: '8px',
                          background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.12)',
                          color: '#fff',
                          outline: 'none'
                        }}
                      />
                      <button
                        type="submit"
                        disabled={commentLoading}
                        style={{
                          padding: '10px 18px',
                          borderRadius: '8px',
                          background: 'linear-gradient(135deg, #008DC7, #2DBCEE)',
                          border: 'none',
                          color: '#fff',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        {commentLoading ? 'Posting...' : 'Comment'}
                      </button>
                    </form>

                    {/* Comments List */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {comments.map((c) => (
                        <div
                          key={c.id}
                          style={{
                            padding: '12px 16px',
                            borderRadius: '8px',
                            background: 'rgba(255,255,255,0.02)',
                            border: '1px solid rgba(255,255,255,0.05)'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.75rem', color: '#94a3b8' }}>
                            <span style={{ fontWeight: 700, color: '#38bdf8' }}>{c.username}</span>
                            <span>{c.created_at}</span>
                          </div>
                          <p style={{ fontSize: '0.88rem', color: '#e2e8f0' }}>{c.content}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                  Document not found.
                </div>
              )}
            </div>
          )}

          {/* UPLOAD PORTAL VIEW */}
          {activeTab === 'upload' && (
            <UploadPortal
              token={token}
              onOpenKBAuthor={(prod) => {
                setShowKBAuthorModal(true)
              }}
            />
          )}

          {/* ADMIN SUITE VIEW */}
          {activeTab === 'admin' && (
            <AdminPanel token={token} />
          )}
        </main>
      </div>

      {/* Modals */}
      <AICopilotModal
        isOpen={showCopilotModal}
        onClose={() => setShowCopilotModal(false)}
        onSelectDoc={handleSelectDoc}
        initialQuery={copilotInitialQuery}
        activeProduct={activeProduct}
      />

      <KBAuthorModal
        isOpen={showKBAuthorModal}
        onClose={() => setShowKBAuthorModal(false)}
        token={token}
        defaultProduct={activeProduct !== 'all' ? activeProduct : 'xpi'}
        onKBCreated={(newDocId) => {
          fetchOverview()
          fetchNotifications()
          if (newDocId) handleSelectDoc(newDocId)
        }}
      />

      {/* Sign In Modal */}
      {showLoginModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(3, 7, 18, 0.8)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
          onClick={() => setShowLoginModal(false)}
        >
          <div
            className="glass-panel"
            style={{
              width: '100%',
              maxWidth: '420px',
              padding: '32px',
              borderRadius: '16px',
              background: 'rgba(15, 23, 42, 0.96)',
              border: '1px solid rgba(0, 141, 199, 0.4)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ textAlign: 'center', marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
                <MagicLogoSVG height={52} />
              </div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', marginBottom: '4px' }}>
                Enterprise Portal Login
              </h3>
              <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                Sign in to author KBs, manage taxonomy, or access administrative tools.
              </p>
            </div>

            {loginError && (
              <div style={{ padding: '10px', borderRadius: '8px', background: 'rgba(244,63,94,0.15)', color: '#f43f5e', fontSize: '0.82rem', marginBottom: '16px' }}>
                {loginError}
              </div>
            )}

            <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                  Username
                </label>
                <input
                  type="text"
                  placeholder="e.g. admin"
                  value={loginUser}
                  onChange={(e) => setLoginUser(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: '#fff',
                    outline: 'none'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '4px' }}>
                  Password
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={loginPass}
                  onChange={(e) => setLoginPass(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    color: '#fff',
                    outline: 'none'
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                style={{
                  marginTop: '8px',
                  padding: '12px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #008DC7, #2DBCEE)',
                  border: 'none',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '0.9rem',
                  cursor: loginLoading ? 'not-allowed' : 'pointer',
                  boxShadow: '0 4px 15px rgba(0, 141, 199, 0.35)'
                }}
              >
                {loginLoading ? 'Authenticating...' : 'Sign In'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
