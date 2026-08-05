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
  FileCode,
  HardDrive
} from 'lucide-react'

export default function AdminPanel({ token }) {
  // Navigation tabs inside admin
  const [adminSection, setAdminSection] = useState('users')
  
  // 1. User Management states
  const [usersList, setUsersList] = useState([])
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState('Viewer')
  const [userSuccess, setUserSuccess] = useState('')
  const [userError, setUserError] = useState('')
  const [userLoading, setUserLoading] = useState(false)

  // 2. File Management states
  const [filesList, setFilesList] = useState([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [fileError, setFileError] = useState('')

  // 3. Re-indexing & Log states
  const [indexLogs, setIndexLogs] = useState([])
  const [indexingNow, setIndexingNow] = useState(false)
  const [indexSuccess, setIndexSuccess] = useState('')
  const [indexError, setIndexError] = useState('')

  useEffect(() => {
    if (adminSection === 'users') fetchUsers()
    if (adminSection === 'files') fetchFiles()
    if (adminSection === 'indexer') fetchLogs()
  }, [adminSection])

  // --- API Fetches ---
  
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

  const fetchFiles = async () => {
    setFilesLoading(true)
    setFileError('')
    try {
      const res = await fetch('/api/admin/files', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to load uploaded files')
      const data = await res.json()
      setFilesList(data)
    } catch (err) {
      setFileError(err.message)
    } finally {
      setFilesLoading(false)
    }
  }

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/admin/logs', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to load indexing logs')
      const data = await res.json()
      setIndexLogs(data)
    } catch (err) {
      setIndexError(err.message)
    }
  }

  // --- Action Handlers ---

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
    
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      })
      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.detail || 'Failed to create user')
      }
      
      setUserSuccess(`User "${newUsername}" created successfully.`)
      setNewUsername('')
      setNewPassword('')
      setNewRole('Viewer')
      fetchUsers()
    } catch (err) {
      setUserError(err.message)
    } finally {
      setUserLoading(false)
    }
  }

  const handleDeleteUser = async (userId, username) => {
    if (username === 'admin') return
    if (!window.confirm(`Are you sure you want to delete user: ${username}?`)) return
    
    setUserSuccess('')
    setUserError('')
    
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to delete user')
      setUserSuccess(`User "${username}" has been deleted.`)
      fetchUsers()
    } catch (err) {
      setUserError(err.message)
    }
  }

  const handleDeleteFile = async (filename) => {
    if (!window.confirm(`Are you sure you want to delete ${filename}? This will remove it from the system and update the search index.`)) return
    
    try {
      const res = await fetch(`/api/admin/files/${filename}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to delete file')
      fetchFiles()
    } catch (err) {
      setFileError(err.message)
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
      if (!res.ok) throw new Error('Manual indexing request failed')
      const data = await res.json()
      setIndexSuccess(`Reindexing finished! Processed ${data.count} documents successfully.`)
      fetchLogs()
    } catch (err) {
      setIndexError(err.message)
    } finally {
      setIndexingNow(false)
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: '24px', maxWidth: '1200px', margin: '0 auto', width: '100%' }} className="animate-fade-in">
      
      {/* Admin Sidebar Navigation */}
      <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px', height: 'fit-content' }}>
        <h3 style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '8px 12px' }}>
          SYSTEM SETTINGS
        </h3>
        
        <button 
          className="btn btn-secondary"
          style={{
            justifyContent: 'flex-start',
            background: adminSection === 'users' ? 'rgba(99,102,241,0.15)' : 'transparent',
            color: adminSection === 'users' ? '#818cf8' : 'var(--text-main)',
            borderColor: adminSection === 'users' ? 'rgba(99,102,241,0.2)' : 'transparent',
            padding: '10px 14px',
            fontSize: '0.9rem',
            textAlign: 'left'
          }}
          onClick={() => setAdminSection('users')}
        >
          <Users size={16} /> User Management
        </button>

        <button 
          className="btn btn-secondary"
          style={{
            justifyContent: 'flex-start',
            background: adminSection === 'files' ? 'rgba(99,102,241,0.15)' : 'transparent',
            color: adminSection === 'files' ? '#818cf8' : 'var(--text-main)',
            borderColor: adminSection === 'files' ? 'rgba(99,102,241,0.2)' : 'transparent',
            padding: '10px 14px',
            fontSize: '0.9rem',
            textAlign: 'left'
          }}
          onClick={() => setAdminSection('files')}
        >
          <HardDrive size={16} /> File Directory
        </button>

        <button 
          className="btn btn-secondary"
          style={{
            justifyContent: 'flex-start',
            background: adminSection === 'indexer' ? 'rgba(99,102,241,0.15)' : 'transparent',
            color: adminSection === 'indexer' ? '#818cf8' : 'var(--text-main)',
            borderColor: adminSection === 'indexer' ? 'rgba(99,102,241,0.2)' : 'transparent',
            padding: '10px 14px',
            fontSize: '0.9rem',
            textAlign: 'left'
          }}
          onClick={() => setAdminSection('indexer')}
        >
          <Database size={16} /> Re-index Engine
        </button>
      </div>

      {/* Admin Content Area */}
      <div style={{ minWidth: 0 }}>
        
        {/* Section 1: User Management */}
        {adminSection === 'users' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Create User Card */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <h2 style={{ fontSize: '1.25rem', color: '#fff', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UserPlus size={18} /> Add New System User
              </h2>
              
              <form onSubmit={handleCreateUser} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto auto', gap: '16px', alignItems: 'flex-end' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>USERNAME</label>
                  <input 
                    type="text" 
                    className="input-field" 
                    placeholder="Enter username" 
                    style={{ padding: '8px 12px' }}
                    value={newUsername}
                    onChange={e => setNewUsername(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>PASSWORD</label>
                  <input 
                    type="password" 
                    className="input-field" 
                    placeholder="Enter password" 
                    style={{ padding: '8px 12px' }}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>SYSTEM ROLE</label>
                  <select 
                    className="input-field" 
                    style={{ padding: '8px 12px', width: '130px' }}
                    value={newRole}
                    onChange={e => setNewRole(e.target.value)}
                  >
                    <option value="Viewer">Viewer</option>
                    <option value="Editor">Editor</option>
                    <option value="Admin">Admin</option>
                  </select>
                </div>
                <button type="submit" className="btn btn-primary" style={{ padding: '10px 20px' }} disabled={userLoading}>
                  Create User
                </button>
              </form>

              {userSuccess && (
                <div style={{ marginTop: '16px', color: 'var(--accent-emerald)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle size={14} /> {userSuccess}
                </div>
              )}
              {userError && (
                <div style={{ marginTop: '16px', color: 'var(--accent-rose)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertCircle size={14} /> {userError}
                </div>
              )}
            </div>

            {/* List Users Card */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <h2 style={{ fontSize: '1.25rem', color: '#fff', marginBottom: '16px' }}>Existing Accounts</h2>
              
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '8px' }}>
                    <th style={{ textAlign: 'left', padding: '10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>USERNAME</th>
                    <th style={{ textAlign: 'left', padding: '10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>ROLE</th>
                    <th style={{ textAlign: 'right', padding: '10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {usersList.map(u => (
                    <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', transition: 'var(--transition-smooth)' }}>
                      <td style={{ padding: '12px 10px', fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-main)' }}>{u.username}</td>
                      <td style={{ padding: '12px 10px', fontSize: '0.85rem' }}>
                        <span style={{
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          background: u.role === 'Admin' ? 'rgba(244,63,94,0.1)' : u.role === 'Editor' ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.05)',
                          color: u.role === 'Admin' ? '#fb7185' : u.role === 'Editor' ? '#34d399' : '#9ca3af'
                        }}>
                          {u.role}
                        </span>
                      </td>
                      <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                        {u.username !== 'admin' ? (
                          <button 
                            className="btn btn-danger" 
                            style={{ padding: '6px 10px', borderRadius: '4px', fontSize: '0.75rem' }}
                            onClick={() => handleDeleteUser(u.id, u.username)}
                          >
                            <Trash2 size={12} /> Delete
                          </button>
                        ) : (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', paddingRight: '8px' }}>Locked</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Section 2: File Directory */}
        {adminSection === 'files' && (
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h2 style={{ fontSize: '1.25rem', color: '#fff', marginBottom: '8px' }}>Uploaded Knowledge Documents</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px' }}>
              These are custom documents uploaded by editors. Deleting a file removes it from disk and strips its keywords from the search engine index.
            </p>

            {filesLoading ? (
              <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>Loading uploads list...</div>
            ) : fileError ? (
              <div style={{ color: 'var(--accent-rose)', padding: '10px' }}>{fileError}</div>
            ) : filesList.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                No custom files uploaded yet.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <th style={{ textAlign: 'left', padding: '10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>FILE NAME</th>
                    <th style={{ textAlign: 'left', padding: '10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>SIZE</th>
                    <th style={{ textAlign: 'left', padding: '10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>MODIFIED ON</th>
                    <th style={{ textAlign: 'right', padding: '10px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {filesList.map((file, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding: '12px 10px', fontSize: '0.85rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <FileCode size={14} style={{ color: '#818cf8' }} />
                        {file.name}
                      </td>
                      <td style={{ padding: '12px 10px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {(file.size / 1024).toFixed(1)} KB
                      </td>
                      <td style={{ padding: '12px 10px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {file.modified}
                      </td>
                      <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                        <button 
                          className="btn btn-danger" 
                          style={{ padding: '6px 10px', borderRadius: '4px', fontSize: '0.75rem' }}
                          onClick={() => handleDeleteFile(file.name)}
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Section 3: Re-index Engine */}
        {adminSection === 'indexer' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Control Board */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <h2 style={{ fontSize: '1.25rem', color: '#fff', marginBottom: '8px' }}>Indexing Controller</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px' }}>
                Force the system to re-crawl your Confluence fold (`863301644`) and `uploads/` directories. This parses all content and resets search rankings.
              </p>

              <button 
                className="btn btn-primary"
                onClick={handleTriggerReindex}
                disabled={indexingNow}
              >
                <RefreshCw size={16} className={indexingNow ? 'animate-spin' : ''} />
                {indexingNow ? 'Rebuilding Database...' : 'Run Indexer Now'}
              </button>

              {indexSuccess && (
                <div style={{ marginTop: '16px', color: 'var(--accent-emerald)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckCircle size={14} /> {indexSuccess}
                </div>
              )}
              {indexError && (
                <div style={{ marginTop: '16px', color: 'var(--accent-rose)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertCircle size={14} /> {indexError}
                </div>
              )}
            </div>

            {/* Run Logs Card */}
            <div className="glass-panel" style={{ padding: '24px' }}>
              <h2 style={{ fontSize: '1.25rem', color: '#fff', marginBottom: '16px' }}>Indexing Run Logs</h2>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {indexLogs.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No indexing logs found. Trigger an index run to write logs.</div>
                ) : (
                  indexLogs.map((log, idx) => (
                    <div 
                      key={idx}
                      style={{
                        padding: '16px',
                        background: 'rgba(0,0,0,0.2)',
                        border: '1px solid rgba(255,255,255,0.05)',
                        borderRadius: '8px'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>
                          Run #{log.id} - {log.timestamp}
                        </span>
                        <span style={{
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: log.status === 'Success' ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)',
                          color: log.status === 'Success' ? '#34d399' : '#fb7185'
                        }}>
                          {log.status} ({log.indexed_count} docs)
                        </span>
                      </div>
                      <pre style={{
                        fontSize: '0.75rem',
                        color: 'var(--text-muted)',
                        fontFamily: 'monospace',
                        whiteSpace: 'pre-wrap'
                      }}>
                        {log.message}
                      </pre>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
        
      </div>
    </div>
  )
}
