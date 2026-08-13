import React, { useState, useEffect } from 'react'
import { 
  Users, 
  Database, 
  Trash2, 
  UserPlus, 
  RefreshCw, 
  FileText,
  AlertCircle,
  CheckCircle,
  BarChart2,
  TrendingUp,
  Search,
  HardDrive,
  FolderOpen,
  Layers,
  Zap,
  Workflow,
  Cloud,
  Award,
  Calendar,
  Filter,
  Download,
  Eye,
  Heart,
  ChevronRight,
  Clock,
  UserCheck,
  FileCode,
  RotateCcw,
  Sparkles
} from 'lucide-react'

export default function AdminPanel({ token }) {
  const [adminSection, setAdminSection] = useState('contributions') // 'contributions', 'analytics', 'users', 'taxonomy', 'indexer'
  
  // 1. Contributor Analytics states
  const [contributionData, setContributionData] = useState(null)
  const [contribLoading, setContribLoading] = useState(false)
  const [contribError, setContribError] = useState('')
  const [filterUser, setFilterUser] = useState('all')
  const [filterYear, setFilterYear] = useState('2026')
  const [filterMonth, setFilterMonth] = useState('all')
  const [filterStartDate, setFilterStartDate] = useState('')
  const [filterEndDate, setFilterEndDate] = useState('')
  const [filterProduct, setFilterProduct] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all') // 'all', 'active', 'former'
  const [articleSearchQuery, setArticleSearchQuery] = useState('')

  // 2. Telemetry & Search Analytics states
  const [analytics, setAnalytics] = useState(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)

  // 3. User Management states
  const [usersList, setUsersList] = useState([])
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState('Editor')
  const [newProductSpace, setNewProductSpace] = useState('all')
  const [newUserStatus, setNewUserStatus] = useState('true')
  const [userSuccess, setUserSuccess] = useState('')
  const [userError, setUserError] = useState('')
  const [userLoading, setUserLoading] = useState(false)

  // 4. Document / Taxonomy Governance states
  const [docList, setDocList] = useState([])
  const [docFilterProduct, setDocFilterProduct] = useState('all')
  const [docLoading, setDocLoading] = useState(false)
  const [docSuccess, setDocSuccess] = useState('')

  // 5. Indexer & Log states
  const [indexLogs, setIndexLogs] = useState([])
  const [indexingNow, setIndexingNow] = useState(false)
  const [indexSuccess, setIndexSuccess] = useState('')
  const [indexError, setIndexError] = useState('')

  useEffect(() => {
    if (adminSection === 'contributions') fetchContributions()
    if (adminSection === 'analytics') fetchAnalytics()
    if (adminSection === 'users') fetchUsers()
    if (adminSection === 'taxonomy') fetchDocuments()
    if (adminSection === 'indexer') fetchLogs()
  }, [adminSection, filterUser, filterYear, filterMonth, filterStartDate, filterEndDate, filterProduct, filterStatus])

  const fetchContributions = async () => {
    setContribLoading(true)
    setContribError('')
    try {
      const params = new URLSearchParams()
      if (filterUser && filterUser !== 'all') params.append('username', filterUser)
      if (filterYear && filterYear !== 'all') params.append('year', filterYear)
      if (filterMonth && filterMonth !== 'all') params.append('month', filterMonth)
      if (filterStartDate) params.append('start_date', filterStartDate)
      if (filterEndDate) params.append('end_date', filterEndDate)
      if (filterProduct && filterProduct !== 'all') params.append('product', filterProduct)
      if (filterStatus && filterStatus !== 'all') params.append('contributor_status', filterStatus)

      const res = await fetch(`/api/admin/contributions?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to load user contribution data')
      const data = await res.json()
      setContributionData(data)
    } catch (err) {
      setContribError(err.message)
    } finally {
      setContribLoading(false)
    }
  }

  const handleResetFilters = () => {
    setFilterUser('all')
    setFilterYear('2026')
    setFilterMonth('all')
    setFilterStartDate('')
    setFilterEndDate('')
    setFilterProduct('all')
    setFilterStatus('all')
    setArticleSearchQuery('')
  }

  const handleExportCSV = () => {
    if (!contributionData || !contributionData.articles || contributionData.articles.length === 0) {
      alert('No article contributions to export for current filter criteria.')
      return
    }

    const headers = ['ID', 'Title', 'Author', 'Product Space', 'Format', 'Version', 'Views', 'Likes', 'Created At']
    const rows = contributionData.articles.map(a => [
      a.id,
      `"${(a.title || '').replace(/"/g, '""')}"`,
      `"${a.author || 'System'}"`,
      a.product.toUpperCase(),
      (a.file_type || '').toUpperCase(),
      a.version || 'Universal',
      a.views || 0,
      a.likes || 0,
      `"${a.created_at || ''}"`
    ])

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `magic_kb_user_contributions_${filterUser}_${filterYear}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const fetchAnalytics = async () => {
    setAnalyticsLoading(true)
    try {
      const res = await fetch('/api/admin/analytics', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to load search analytics')
      const data = await res.json()
      setAnalytics(data)
    } catch (err) {
      console.error(err)
    } finally {
      setAnalyticsLoading(false)
    }
  }

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to load users')
      const data = await res.json()
      setUsersList(data)
    } catch (err) {
      setUserError(err.message)
    }
  }

  const fetchDocuments = async () => {
    setDocLoading(true)
    try {
      const res = await fetch('/api/admin/files', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to load documents')
      const data = await res.json()
      setDocList(data)
    } catch (err) {
      console.error(err)
    } finally {
      setDocLoading(false)
    }
  }

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/admin/logs', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to load logs')
      const data = await res.json()
      setIndexLogs(data)
    } catch (err) {
      setIndexError(err.message)
    }
  }

  const handleCreateUser = async (e) => {
    e.preventDefault()
    setUserSuccess('')
    setUserError('')
    if (!newUsername.trim() || !newPassword.trim()) return

    setUserLoading(true)
    const formData = new FormData()
    formData.append('username', newUsername)
    formData.append('password', newPassword)
    formData.append('role', newRole)
    formData.append('product_space', newProductSpace)
    formData.append('is_active', newUserStatus)

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.detail || 'Failed to create user')
      }
      setUserSuccess(`User "${newUsername}" created successfully!`)
      setNewUsername('')
      setNewPassword('')
      fetchUsers()
    } catch (err) {
      setUserError(err.message)
    } finally {
      setUserLoading(false)
    }
  }

  const handleDeleteUser = async (userId, username) => {
    if (!confirm(`Are you sure you want to delete user "${username}"?`)) return
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to delete user')
      fetchUsers()
    } catch (err) {
      alert(err.message)
    }
  }

  const handleToggleUserStatus = async (userId, username, currentActive) => {
    const actionName = currentActive ? 'deactivate' : 'reactivate'
    const confirmMsg = currentActive 
      ? `Are you sure you want to deactivate "${username}" (ex-employee)? They will not be able to log in, but all their uploaded KBs and knowledge contributions will remain safely preserved and tracked as Alumni docs.`
      : `Reactivate user account for "${username}"?`
    if (!confirm(confirmMsg)) return

    try {
      const formData = new FormData()
      formData.append('is_active', currentActive ? 'false' : 'true')
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      })
      if (!res.ok) throw new Error(`Failed to ${actionName} user`)
      setUserSuccess(`User "${username}" status updated to ${currentActive ? 'Inactive (Ex-Employee)' : 'Active'}!`)
      setTimeout(() => setUserSuccess(''), 3000)
      fetchUsers()
      if (adminSection === 'contributions') fetchContributions()
    } catch (err) {
      alert(err.message)
    }
  }

  const handleUpdateProduct = async (docId, newProduct) => {
    try {
      const formData = new FormData()
      formData.append('product', newProduct)
      const res = await fetch(`/api/admin/document/${docId}/product`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      })
      if (!res.ok) throw new Error('Failed to update product')
      setDocSuccess(`Document product updated to ${newProduct.toUpperCase()}`)
      setTimeout(() => setDocSuccess(''), 2500)
      fetchDocuments()
    } catch (err) {
      alert(err.message)
    }
  }

  const handleDeleteDocument = async (docId, title) => {
    if (!confirm(`Are you sure you want to delete "${title}"?`)) return
    try {
      const res = await fetch(`/api/admin/document/${docId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to delete document')
      fetchDocuments()
    } catch (err) {
      alert(err.message)
    }
  }

  const handleTriggerReindex = async () => {
    setIndexingNow(true)
    setIndexSuccess('')
    setIndexError('')
    try {
      const res = await fetch('/api/admin/reindex', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Reindexing failed')
      const data = await res.json()
      setIndexSuccess(`Reindexing complete: ${data.count} documents synchronized.`)
      fetchLogs()
    } catch (err) {
      setIndexError(err.message)
    } finally {
      setIndexingNow(false)
    }
  }

  const filteredDocs = docFilterProduct === 'all' 
    ? docList 
    : docList.filter(d => d.product === docFilterProduct)

  // Filter drilldown articles in contribution tab
  const articlesList = contributionData?.articles || []
  const filteredArticles = articleSearchQuery.trim() === ''
    ? articlesList
    : articlesList.filter(a => 
        a.title.toLowerCase().includes(articleSearchQuery.toLowerCase()) ||
        a.author.toLowerCase().includes(articleSearchQuery.toLowerCase()) ||
        a.product.toLowerCase().includes(articleSearchQuery.toLowerCase())
      )

  const monthNames = [
    { num: '1', name: 'January' },
    { num: '2', name: 'February' },
    { num: '3', name: 'March' },
    { num: '4', name: 'April' },
    { num: '5', name: 'May' },
    { num: '6', name: 'June' },
    { num: '7', name: 'July' },
    { num: '8', name: 'August' },
    { num: '9', name: 'September' },
    { num: '10', name: 'October' },
    { num: '11', name: 'November' },
    { num: '12', name: 'December' },
  ]

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px', width: '100%', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Admin Suite Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #008DC7, #2DBCEE)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <TrendingUp size={20} />
            </div>
            <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#ffffff', margin: 0 }}>
              Super Admin Control & Analytics Center
            </h2>
          </div>
          <p style={{ fontSize: '0.88rem', color: '#94a3b8', marginTop: '6px' }}>
            Track contributor ingestion velocity, user rights, product governance, search gaps, and system index health.
          </p>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '8px', flexWrap: 'wrap' }}>
        {[
          { id: 'contributions', label: 'User Contributions & Uploads', icon: Award },
          { id: 'analytics', label: 'Search Telemetry & Gaps', icon: BarChart2 },
          { id: 'users', label: 'User & RBAC Directory', icon: Users },
          { id: 'taxonomy', label: 'Document & Space Governance', icon: Database },
          { id: 'indexer', label: 'Search Indexer Diagnostics', icon: RefreshCw }
        ].map((tab) => {
          const Icon = tab.icon
          const isActive = adminSection === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setAdminSection(tab.id)}
              style={{
                padding: '10px 18px',
                borderRadius: '10px',
                background: isActive ? 'linear-gradient(135deg, rgba(0, 141, 199, 0.25), rgba(45, 188, 238, 0.12))' : 'rgba(255,255,255,0.02)',
                border: isActive ? '1px solid #008DC7' : '1px solid rgba(255,255,255,0.05)',
                color: isActive ? '#ffffff' : '#9ca3af',
                fontSize: '0.88rem',
                fontWeight: isActive ? 700 : 500,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: isActive ? '0 4px 15px rgba(0, 141, 199, 0.2)' : 'none'
              }}
            >
              <Icon size={16} style={{ color: isActive ? '#38bdf8' : '#9ca3af' }} />
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* ========================================================================= */}
      {/* 1. SUPER ADMIN TAB: USER CONTRIBUTIONS & UPLOAD ANALYTICS */}
      {/* ========================================================================= */}
      {adminSection === 'contributions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
          
          {/* Multi-Dimensional Filter Bar */}
          <div className="glass-panel" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px', borderRadius: '14px', border: '1px solid rgba(0, 141, 199, 0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Filter size={18} style={{ color: '#38bdf8' }} />
                <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff' }}>Filter Contributor Contributions</span>
                <span style={{ fontSize: '0.78rem', color: '#94a3b8' }}>— Slice by user, product space, year, month, or custom date range</span>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={handleResetFilters}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: '#94a3b8',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <RotateCcw size={14} /> Reset
                </button>

                <button
                  onClick={handleExportCSV}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #10b981, #06b6d4)',
                    border: 'none',
                    color: '#ffffff',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Download size={14} /> Export CSV Report
                </button>
              </div>
            </div>

            {/* Filter Inputs Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
              {/* Filter 1: Contributor / User */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                  👤 Contributor / User
                </label>
                <select
                  value={filterUser}
                  onChange={(e) => setFilterUser(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.84rem',
                    outline: 'none'
                  }}
                >
                  <option value="all">🌟 All Contributors & Users</option>
                  {(contributionData?.available_filters?.users || []).map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>

              {/* Filter 2: Year */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                  📅 Year
                </label>
                <select
                  value={filterYear}
                  onChange={(e) => setFilterYear(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.84rem',
                    outline: 'none'
                  }}
                >
                  <option value="2026">📅 2026 (Live Platform Period)</option>
                  <option value="all">🌟 All-Time (Include Pre-2026 Archives)</option>
                  {(contributionData?.available_filters?.years || []).filter(y => y !== '2026').map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>

              {/* Filter 3: Month */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                  🗓️ Month
                </label>
                <select
                  value={filterMonth}
                  onChange={(e) => setFilterMonth(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.84rem',
                    outline: 'none'
                  }}
                >
                  <option value="all">All Months</option>
                  {monthNames.map(m => (
                    <option key={m.num} value={m.num}>{m.name}</option>
                  ))}
                </select>
              </div>

              {/* Filter 4: Product Space */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                  🌐 Product Space
                </label>
                <select
                  value={filterProduct}
                  onChange={(e) => setFilterProduct(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.84rem',
                    outline: 'none'
                  }}
                >
                  <option value="all">All Product Spaces</option>
                  <option value="xpi">🔗 Magic xpi</option>
                  <option value="xpa">⚡ Magic xpa</option>
                  <option value="cloud_native">☁️ Cloud Native</option>
                  <option value="general">🌐 General / Cross-Product</option>
                </select>
              </div>

              {/* Filter 5: Contributor Status (Active vs Former/Alumni) */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                  👥 Contributor Status
                </label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.84rem',
                    outline: 'none'
                  }}
                >
                  <option value="all">🌟 All Contributors (Active & Alumni)</option>
                  <option value="active">🟢 Active Team Only</option>
                  <option value="former">🏛️ Alumni / Former Contributors</option>
                </select>
              </div>

              {/* Filter 6: Date Range Start */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                  📆 From Date
                </label>
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.82rem',
                    outline: 'none'
                  }}
                />
              </div>

              {/* Filter 7: Date Range End */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#cbd5e1', marginBottom: '6px' }}>
                  📆 To Date
                </label>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 10px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#fff',
                    fontSize: '0.82rem',
                    outline: 'none'
                  }}
                />
              </div>
            </div>
          </div>

          {/* Loading / Error States */}
          {contribLoading && (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
              <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 10px auto', display: 'block', color: '#008DC7' }} />
              Loading contributor analytics and upload metrics...
            </div>
          )}

          {contribError && (
            <div style={{ padding: '14px 18px', borderRadius: '10px', background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', color: '#f43f5e', fontSize: '0.88rem' }}>
              <AlertCircle size={16} style={{ display: 'inline', marginRight: '6px' }} /> {contribError}
            </div>
          )}

          {!contribLoading && contributionData && (
            <>
              {/* KPI Summary Stat Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                <div className="glass-panel" style={{ padding: '20px', borderRadius: '14px', borderLeft: '4px solid #008DC7', background: 'linear-gradient(135deg, rgba(0, 141, 199, 0.08), rgba(0,0,0,0.2))' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8' }}>Total Ingested KBs</span>
                    <FileText size={18} style={{ color: '#008DC7' }} />
                  </div>
                  <h3 style={{ fontSize: '2rem', fontWeight: 800, color: '#ffffff', marginTop: '6px', marginBottom: '2px' }}>
                    {contributionData.summary.total_uploads}
                  </h3>
                  <div style={{ display: 'flex', gap: '8px', fontSize: '0.72rem', color: '#38bdf8', marginTop: '4px' }}>
                    <span>🟢 Active: <strong>{contributionData.summary.active_uploads_count || 0}</strong></span>
                    <span>•</span>
                    <span>🏛️ Alumni: <strong>{contributionData.summary.former_uploads_count || 0}</strong></span>
                  </div>
                </div>

                <div className="glass-panel" style={{ padding: '20px', borderRadius: '14px', borderLeft: '4px solid #10b981', background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(0,0,0,0.2))' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8' }}>Contributors</span>
                    <Users size={18} style={{ color: '#10b981' }} />
                  </div>
                  <h3 style={{ fontSize: '2rem', fontWeight: 800, color: '#ffffff', marginTop: '6px', marginBottom: '2px' }}>
                    {contributionData.summary.unique_contributors}
                  </h3>
                  <div style={{ display: 'flex', gap: '8px', fontSize: '0.72rem', color: '#34d399', marginTop: '4px' }}>
                    <span>🟢 Active: <strong>{contributionData.summary.active_contributors_count || 0}</strong></span>
                    <span>•</span>
                    <span>🏛️ Alumni: <strong>{contributionData.summary.former_contributors_count || 0}</strong></span>
                  </div>
                </div>

                <div className="glass-panel" style={{ padding: '20px', borderRadius: '14px', borderLeft: '4px solid #f59e0b', background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.08), rgba(0,0,0,0.2))' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8' }}>Top Contributor</span>
                    <Award size={18} style={{ color: '#f59e0b' }} />
                  </div>
                  <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#fbbf24', marginTop: '8px', marginBottom: '2px', wordBreak: 'break-all' }}>
                    {contributionData.summary.top_contributor}
                  </h3>
                  <span style={{ fontSize: '0.72rem', color: '#fcd34d' }}>
                    {contributionData.summary.top_contributor_count} articles published
                  </span>
                </div>

                <div className="glass-panel" style={{ padding: '20px', borderRadius: '14px', borderLeft: '4px solid #a855f7', background: 'linear-gradient(135deg, rgba(168, 85, 247, 0.08), rgba(0,0,0,0.2))' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#94a3b8' }}>Total Reader Views</span>
                    <Eye size={18} style={{ color: '#a855f7' }} />
                  </div>
                  <h3 style={{ fontSize: '2rem', fontWeight: 800, color: '#ffffff', marginTop: '6px', marginBottom: '2px' }}>
                    {contributionData.summary.total_views}
                  </h3>
                  <span style={{ fontSize: '0.72rem', color: '#c084fc' }}>
                    Generated across filtered articles
                  </span>
                </div>
              </div>

              {/* Contributor Leaderboard Table */}
              <div className="glass-panel" style={{ padding: '24px', borderRadius: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                  <div>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Award size={20} style={{ color: '#fbbf24' }} /> Contributor Leaderboard & Volume Distribution
                    </h3>
                    <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                      Breakdown of total articles uploaded, team status, reader views, product spaces, and file types per contributor.
                    </p>
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}>
                        <th style={{ padding: '12px 14px' }}>Rank</th>
                        <th style={{ padding: '12px 14px' }}>Contributor</th>
                        <th style={{ padding: '12px 14px' }}>Status</th>
                        <th style={{ padding: '12px 14px' }}>Role / Rights</th>
                        <th style={{ padding: '12px 14px' }}>Uploads & Share</th>
                        <th style={{ padding: '12px 14px' }}>Product Breakdown</th>
                        <th style={{ padding: '12px 14px' }}>Formats</th>
                        <th style={{ padding: '12px 14px' }}>Reader Views</th>
                        <th style={{ padding: '12px 14px' }}>Last Upload</th>
                        <th style={{ padding: '12px 14px', textAlign: 'right' }}>Account Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contributionData.contributors.length === 0 ? (
                        <tr>
                          <td colSpan="10" style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
                            No contributions found matching selected criteria. Try adjusting your date, status, or user filter.
                          </td>
                        </tr>
                      ) : (
                        contributionData.contributors.map((c, index) => {
                          const total = contributionData.summary.total_uploads || 1
                          const sharePct = Math.round((c.upload_count / total) * 100)
                          const rankBadge = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`

                          return (
                            <tr 
                              key={c.username}
                              style={{ 
                                borderBottom: '1px solid rgba(255,255,255,0.05)',
                                background: index === 0 ? 'rgba(251, 191, 36, 0.04)' : 'transparent',
                                transition: 'background 0.2s',
                                opacity: c.is_active ? 1 : 0.7
                              }}
                            >
                              <td style={{ padding: '14px', fontWeight: 800, fontSize: '1rem' }}>
                                {rankBadge}
                              </td>

                              <td style={{ padding: '14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                  <div style={{ 
                                    width: '32px', 
                                    height: '32px', 
                                    borderRadius: '8px', 
                                    background: c.is_active ? 'rgba(0, 141, 199, 0.2)' : 'rgba(148, 163, 184, 0.15)', 
                                    color: c.is_active ? '#38bdf8' : '#94a3b8', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center',
                                    fontWeight: 700,
                                    fontSize: '0.85rem'
                                  }}>
                                    {c.username.charAt(0).toUpperCase()}
                                  </div>
                                  <div>
                                    <span style={{ fontWeight: 700, color: '#ffffff', display: 'block' }}>{c.username}</span>
                                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Space: {c.product_space.toUpperCase()}</span>
                                  </div>
                                </div>
                              </td>

                              <td style={{ padding: '14px' }}>
                                <span style={{
                                  fontSize: '0.72rem',
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  background: c.is_active ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                                  color: c.is_active ? '#34d399' : '#f43f5e',
                                  fontWeight: 700,
                                  border: `1px solid ${c.is_active ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}>
                                  {c.is_active ? '🟢 Active Team' : '🔴 Suspended'}
                                </span>
                              </td>

                              <td style={{ padding: '14px' }}>
                                <span style={{
                                  fontSize: '0.72rem',
                                  padding: '3px 8px',
                                  borderRadius: '6px',
                                  background: c.role === 'Admin' ? 'rgba(244, 63, 94, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                                  color: c.role === 'Admin' ? '#f43f5e' : '#34d399',
                                  fontWeight: 700,
                                  border: `1px solid ${c.role === 'Admin' ? 'rgba(244,63,94,0.3)' : 'rgba(16,185,129,0.3)'}`
                                }}>
                                  {c.role}
                                </span>
                              </td>

                              <td style={{ padding: '14px', minWidth: '160px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '4px' }}>
                                  <strong style={{ color: '#fff' }}>{c.upload_count} KBs</strong>
                                  <span style={{ color: '#94a3b8' }}>{sharePct}%</span>
                                </div>
                                <div style={{ width: '100%', height: '6px', borderRadius: '3px', background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                                  <div style={{ width: `${sharePct}%`, height: '100%', background: 'linear-gradient(90deg, #008DC7, #2DBCEE)', borderRadius: '3px' }} />
                                </div>
                              </td>

                              <td style={{ padding: '14px' }}>
                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                  {c.by_product.xpi > 0 && (
                                    <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(6, 182, 212, 0.15)', color: '#06b6d4', fontWeight: 600 }}>
                                      xpi: {c.by_product.xpi}
                                    </span>
                                  )}
                                  {c.by_product.xpa > 0 && (
                                    <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', fontWeight: 600 }}>
                                      xpa: {c.by_product.xpa}
                                    </span>
                                  )}
                                  {c.by_product.cloud_native > 0 && (
                                    <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', fontWeight: 600 }}>
                                      cloud: {c.by_product.cloud_native}
                                    </span>
                                  )}
                                  {c.by_product.general > 0 && (
                                    <span style={{ fontSize: '0.7rem', padding: '1px 6px', borderRadius: '4px', background: 'rgba(148, 163, 184, 0.15)', color: '#94a3b8', fontWeight: 600 }}>
                                      gen: {c.by_product.general}
                                    </span>
                                  )}
                                </div>
                              </td>

                              <td style={{ padding: '14px' }}>
                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                  {Object.entries(c.by_type || {}).map(([ft, count]) => (
                                    <span key={ft} style={{ fontSize: '0.68rem', padding: '1px 5px', borderRadius: '4px', background: 'rgba(255,255,255,0.06)', color: '#cbd5e1' }}>
                                      {ft.toUpperCase()}: {count}
                                    </span>
                                  ))}
                                </div>
                              </td>

                              <td style={{ padding: '14px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#cbd5e1' }}>
                                  <Eye size={13} style={{ color: '#94a3b8' }} />
                                  <span>{c.views}</span>
                                </div>
                              </td>

                              <td style={{ padding: '14px', fontSize: '0.78rem', color: '#94a3b8' }}>
                                {c.latest_upload}
                              </td>

                              <td style={{ padding: '14px', textAlign: 'right' }}>
                                {c.username !== 'admin' && (c.user_id || c.is_registered) ? (
                                  <button
                                    onClick={() => handleToggleUserStatus(c.user_id, c.username, c.is_active)}
                                    style={{
                                      background: 'rgba(255,255,255,0.05)',
                                      border: `1px solid ${c.is_active ? 'rgba(245, 158, 11, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
                                      color: c.is_active ? '#f59e0b' : '#34d399',
                                      padding: '4px 10px',
                                      borderRadius: '6px',
                                      cursor: 'pointer',
                                      fontSize: '0.74rem',
                                      fontWeight: 700,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                      whiteSpace: 'nowrap'
                                    }}
                                    title={c.is_active ? 'Suspend / Deactivate user account' : 'Reactivate user account'}
                                  >
                                    {c.is_active ? '⛔ Suspend' : '✅ Activate'}
                                  </button>
                                ) : (
                                  <span style={{ fontSize: '0.72rem', color: '#64748b' }}>-</span>
                                )}
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Monthly Contribution Timeline Chart */}
              {contributionData.timeline && contributionData.timeline.length > 0 && (
                <div className="glass-panel" style={{ padding: '24px', borderRadius: '14px' }}>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ffffff', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Calendar size={18} style={{ color: '#38bdf8' }} /> Ingestion Velocity by Month
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px' }}>
                    {contributionData.timeline.map((t) => (
                      <div 
                        key={t.key}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '10px',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          textAlign: 'center'
                        }}
                      >
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'block' }}>{t.label}</span>
                        <strong style={{ fontSize: '1.3rem', color: '#38bdf8', display: 'block', marginTop: '4px' }}>
                          {t.count} KBs
                        </strong>
                        <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{t.views} views</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Detailed Article Contribution Drilldown */}
              <div className="glass-panel" style={{ padding: '24px', borderRadius: '14px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                  <div>
                    <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#ffffff' }}>
                      Ingested Knowledge Base Articles Log ({filteredArticles.length})
                    </h3>
                    <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                      Detailed audit log of individual articles created or uploaded under filtered scope.
                    </p>
                  </div>

                  <div style={{ position: 'relative', minWidth: '240px' }}>
                    <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                    <input
                      type="text"
                      placeholder="Search within filtered articles..."
                      value={articleSearchQuery}
                      onChange={(e) => setArticleSearchQuery(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px 8px 34px',
                        borderRadius: '8px',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        color: '#fff',
                        fontSize: '0.82rem',
                        outline: 'none'
                      }}
                    />
                  </div>
                </div>

                <div style={{ overflowX: 'auto', maxHeight: '420px', overflowY: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', position: 'sticky', top: 0, background: '#0d1527', zIndex: 1 }}>
                        <th style={{ padding: '10px 12px' }}>ID</th>
                        <th style={{ padding: '10px 12px' }}>Article Title</th>
                        <th style={{ padding: '10px 12px' }}>Author</th>
                        <th style={{ padding: '10px 12px' }}>Space</th>
                        <th style={{ padding: '10px 12px' }}>Format</th>
                        <th style={{ padding: '10px 12px' }}>Views</th>
                        <th style={{ padding: '10px 12px' }}>Date Uploaded</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredArticles.length === 0 ? (
                        <tr>
                          <td colSpan="7" style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>
                            No articles match your search or filter settings.
                          </td>
                        </tr>
                      ) : (
                        filteredArticles.map((a) => (
                          <tr key={a.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <td style={{ padding: '10px 12px', color: '#64748b', fontSize: '0.78rem' }}>#{a.id}</td>
                            <td style={{ padding: '10px 12px', fontWeight: 600, color: '#e2e8f0' }}>{a.title}</td>
                            <td style={{ padding: '10px 12px' }}>
                              <span style={{ fontSize: '0.78rem', padding: '2px 8px', borderRadius: '6px', background: 'rgba(0, 141, 199, 0.15)', color: '#38bdf8' }}>
                                {a.author}
                              </span>
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: a.product === 'xpa' ? '#f59e0b' : a.product === 'xpi' ? '#06b6d4' : '#10b981' }}>
                                {a.product.toUpperCase()}
                              </span>
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)', color: '#cbd5e1' }}>
                                {a.file_type.toUpperCase()}
                              </span>
                            </td>
                            <td style={{ padding: '10px 12px', color: '#94a3b8' }}>{a.views}</td>
                            <td style={{ padding: '10px 12px', color: '#64748b', fontSize: '0.78rem' }}>{a.created_at}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. TAB: SEARCH TELEMETRY & GAPS */}
      {/* ========================================================================= */}
      {adminSection === 'analytics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {analyticsLoading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
              Loading telemetry insights...
            </div>
          ) : (
            <>
              {/* Product Distribution Overview */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px', borderLeft: '4px solid #f59e0b' }}>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Magic xpa Documents</span>
                  <h3 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#f59e0b', marginTop: '4px' }}>
                    {analytics?.by_product?.xpa || 0}
                  </h3>
                </div>
                <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px', borderLeft: '4px solid #06b6d4' }}>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Magic xpi Documents</span>
                  <h3 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#06b6d4', marginTop: '4px' }}>
                    {analytics?.by_product?.xpi || 0}
                  </h3>
                </div>
                <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px', borderLeft: '4px solid #10b981' }}>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Cloud Native Documents</span>
                  <h3 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#10b981', marginTop: '4px' }}>
                    {analytics?.by_product?.cloud_native || 0}
                  </h3>
                </div>
                <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px', borderLeft: '4px solid #008DC7' }}>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Total Search Inquiries</span>
                  <h3 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#008DC7', marginTop: '4px' }}>
                    {analytics?.total_searches || 0}
                  </h3>
                </div>
              </div>

              {/* Zero Result Search Gaps */}
              <div className="glass-panel" style={{ padding: '24px', borderRadius: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                  <AlertCircle size={20} style={{ color: '#f43f5e' }} />
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ffffff' }}>
                    Documentation Gaps (Zero-Result User Queries)
                  </h3>
                </div>
                <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '16px' }}>
                  These are search terms entered by support engineers that returned zero matches. Use these insights to author missing KBs.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                  {analytics?.zero_result_queries?.map((item, idx) => (
                    <div
                      key={idx}
                      style={{
                        padding: '12px 16px',
                        borderRadius: '8px',
                        background: 'rgba(244, 63, 94, 0.06)',
                        border: '1px solid rgba(244, 63, 94, 0.2)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                    >
                      <span style={{ color: '#fff', fontWeight: 600, fontSize: '0.9rem' }}>
                        "{item.query}"
                      </span>
                      <span style={{ fontSize: '0.75rem', padding: '2px 8px', borderRadius: '6px', background: 'rgba(244, 63, 94, 0.2)', color: '#f43f5e', fontWeight: 700 }}>
                        {item.count} searches
                      </span>
                    </div>
                  ))}
                  {(!analytics?.zero_result_queries || analytics.zero_result_queries.length === 0) && (
                    <div style={{ color: '#34d399', fontSize: '0.88rem' }}>
                      ✓ No zero-result queries recorded. Search taxonomy coverage is healthy!
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. TAB: USER & RBAC DIRECTORY */}
      {/* ========================================================================= */}
      {adminSection === 'users' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Create User Form */}
          <div className="glass-panel" style={{ padding: '24px', borderRadius: '14px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ffffff', marginBottom: '16px' }}>
              Add New User / Enterprise Contributor
            </h3>

            {userSuccess && (
              <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399', fontSize: '0.88rem', marginBottom: '16px' }}>
                <CheckCircle size={16} style={{ display: 'inline', marginRight: '6px' }} /> {userSuccess}
              </div>
            )}
            {userError && (
              <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', color: '#f43f5e', fontSize: '0.88rem', marginBottom: '16px' }}>
                <AlertCircle size={16} style={{ display: 'inline', marginRight: '6px' }} /> {userError}
              </div>
            )}

            <form onSubmit={handleCreateUser} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', alignItems: 'flex-end' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '6px' }}>Username / Corporate Email</label>
                <input
                  type="text"
                  placeholder="e.g. john_doe@magicsoftware.com"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '6px' }}>Temporary Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '6px' }}>Role / Permission Level</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', outline: 'none' }}
                >
                  <option value="Viewer">Viewer (Read-only)</option>
                  <option value="Editor">Editor / Contributor (Upload & Author)</option>
                  <option value="Admin">Admin (Full Control Suite)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '6px' }}>Assigned Space</label>
                <select
                  value={newProductSpace}
                  onChange={(e) => setNewProductSpace(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', outline: 'none' }}
                >
                  <option value="all">All Spaces</option>
                  <option value="xpi">Magic xpi Space</option>
                  <option value="xpa">Magic xpa Space</option>
                  <option value="cloud_native">Cloud Native Space</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#94a3b8', marginBottom: '6px' }}>Account Status</label>
                <select
                  value={newUserStatus}
                  onChange={(e) => setNewUserStatus(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', outline: 'none' }}
                >
                  <option value="true">🟢 Active (Can Login & Contribute)</option>
                  <option value="false">🔴 Suspended / Inactive</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={userLoading}
                style={{
                  padding: '10px 18px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #008DC7, #2DBCEE)',
                  border: 'none',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: userLoading ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px'
                }}
              >
                <UserPlus size={16} /> Create User
              </button>
            </form>
          </div>

          {/* User Directory Table */}
          <div className="glass-panel" style={{ padding: '24px', borderRadius: '14px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ffffff', marginBottom: '16px' }}>
              Active User Directory ({usersList.length})
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }}>
                    <th style={{ padding: '12px 14px' }}>Username / Corporate Email</th>
                    <th style={{ padding: '12px 14px' }}>Status</th>
                    <th style={{ padding: '12px 14px' }}>Role</th>
                    <th style={{ padding: '12px 14px' }}>Assigned Space</th>
                    <th style={{ padding: '12px 14px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {usersList.map((u) => {
                    const isActiveUser = u.is_active !== false
                    return (
                      <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', opacity: isActiveUser ? 1 : 0.65 }}>
                        <td style={{ padding: '12px 14px', fontWeight: 600, color: '#fff' }}>{u.username}</td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{
                            fontSize: '0.72rem',
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: isActiveUser ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                            color: isActiveUser ? '#34d399' : '#f43f5e',
                            fontWeight: 700,
                            border: `1px solid ${isActiveUser ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`
                          }}>
                            {isActiveUser ? '🟢 Active' : '🔴 Suspended'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{
                            fontSize: '0.75rem',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            background: u.role === 'Admin' ? 'rgba(244, 63, 94, 0.15)' : 'rgba(0, 141, 199, 0.15)',
                            color: u.role === 'Admin' ? '#f43f5e' : '#38bdf8',
                            fontWeight: 700
                          }}>
                            {u.role}
                          </span>
                        </td>
                        <td style={{ padding: '12px 14px', color: '#94a3b8' }}>{(u.product_space || 'all').toUpperCase()}</td>
                        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                          {u.username !== 'admin' && (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                              <button
                                onClick={() => handleToggleUserStatus(u.id, u.username, isActiveUser)}
                                style={{
                                  background: 'rgba(255,255,255,0.05)',
                                  border: `1px solid ${isActiveUser ? 'rgba(245, 158, 11, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                                  color: isActiveUser ? '#f59e0b' : '#34d399',
                                  padding: '4px 10px',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  fontSize: '0.74rem',
                                  fontWeight: 600
                                }}
                                title={isActiveUser ? 'Suspend / Deactivate user' : 'Reactivate user'}
                              >
                                {isActiveUser ? '⛔ Suspend' : '✅ Activate'}
                              </button>
                              <button
                                onClick={() => handleDeleteUser(u.id, u.username)}
                                style={{ background: 'none', border: 'none', color: '#f43f5e', cursor: 'pointer', padding: '4px' }}
                                title="Delete User Permanently"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. TAB: DOCUMENT & PRODUCT GOVERNANCE */}
      {/* ========================================================================= */}
      {adminSection === 'taxonomy' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="glass-panel" style={{ padding: '24px', borderRadius: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ffffff' }}>
                  Document Master Catalog & Product Reassignment
                </h3>
                <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                  View, reassign product space, or purge indexed technical documents.
                </p>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <select
                  value={docFilterProduct}
                  onChange={(e) => setDocFilterProduct(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: '0.84rem' }}
                >
                  <option value="all">All Product Spaces ({docList.length})</option>
                  <option value="xpi">Magic xpi</option>
                  <option value="xpa">Magic xpa</option>
                  <option value="cloud_native">Cloud Native</option>
                  <option value="general">General</option>
                </select>
              </div>
            </div>

            {docSuccess && (
              <div style={{ padding: '10px 14px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399', fontSize: '0.85rem', marginBottom: '14px' }}>
                <CheckCircle size={14} style={{ display: 'inline', marginRight: '6px' }} /> {docSuccess}
              </div>
            )}

            <div style={{ overflowX: 'auto', maxHeight: '500px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.84rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', position: 'sticky', top: 0, background: '#0d1527', zIndex: 1 }}>
                    <th style={{ padding: '10px 12px' }}>Document Title</th>
                    <th style={{ padding: '10px 12px' }}>Space</th>
                    <th style={{ padding: '10px 12px' }}>Format</th>
                    <th style={{ padding: '10px 12px' }}>Reassign Space</th>
                    <th style={{ padding: '10px 12px', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDocs.map((d) => (
                    <tr key={d.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '10px 12px', fontWeight: 600, color: '#e2e8f0', maxWidth: '350px' }}>{d.title}</td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: d.product === 'xpa' ? '#f59e0b' : d.product === 'xpi' ? '#06b6d4' : '#10b981' }}>
                          {(d.product || 'xpi').toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.08)', color: '#cbd5e1' }}>
                          {d.file_type.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <select
                          value={d.product || 'xpi'}
                          onChange={(e) => handleUpdateProduct(d.id, e.target.value)}
                          style={{ padding: '4px 8px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: '0.75rem' }}
                        >
                          <option value="xpi">Magic xpi</option>
                          <option value="xpa">Magic xpa</option>
                          <option value="cloud_native">Cloud Native</option>
                          <option value="general">General</option>
                        </select>
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <button
                          onClick={() => handleDeleteDocument(d.id, d.title)}
                          style={{ background: 'none', border: 'none', color: '#f43f5e', cursor: 'pointer', padding: '4px' }}
                          title="Purge Document"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. TAB: SEARCH INDEXER DIAGNOSTICS */}
      {/* ========================================================================= */}
      {adminSection === 'indexer' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="glass-panel" style={{ padding: '24px', borderRadius: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ffffff' }}>
                  Search Indexer Diagnostics & Sync
                </h3>
                <p style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
                  Re-scans Confluence space and uploads folders, parses PDFs/DOCX, and updates full-text indexes.
                </p>
              </div>

              <button
                onClick={handleTriggerReindex}
                disabled={indexingNow}
                style={{
                  padding: '10px 20px',
                  borderRadius: '8px',
                  background: indexingNow ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #008DC7, #2DBCEE)',
                  border: 'none',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '0.88rem',
                  cursor: indexingNow ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                <RefreshCw size={16} className={indexingNow ? 'animate-spin' : ''} />
                <span>{indexingNow ? 'Indexing Repository...' : 'Trigger Full Re-Index'}</span>
              </button>
            </div>

            {indexSuccess && (
              <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399', fontSize: '0.88rem', marginBottom: '16px' }}>
                <CheckCircle size={16} style={{ display: 'inline', marginRight: '6px' }} /> {indexSuccess}
              </div>
            )}
            {indexError && (
              <div style={{ padding: '12px 16px', borderRadius: '8px', background: 'rgba(244, 63, 94, 0.15)', border: '1px solid rgba(244, 63, 94, 0.3)', color: '#f43f5e', fontSize: '0.88rem', marginBottom: '16px' }}>
                <AlertCircle size={16} style={{ display: 'inline', marginRight: '6px' }} /> {indexError}
              </div>
            )}

            <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '12px' }}>
              Recent Indexing Runs
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {indexLogs.map((log) => (
                <div
                  key={log.id}
                  style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <div>
                    <span style={{ fontSize: '0.85rem', color: '#fff', fontWeight: 600 }}>
                      Indexed {log.indexed_count} total documents
                    </span>
                    <span style={{ fontSize: '0.75rem', color: '#64748b', display: 'block', marginTop: '2px' }}>
                      {log.timestamp} • Status: {log.status}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.15)', color: '#34d399', fontWeight: 700 }}>
                    SUCCESS
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
