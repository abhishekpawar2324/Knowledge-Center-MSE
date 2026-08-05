import React, { useState } from 'react'
import { 
  Upload, 
  FileText, 
  PlusCircle, 
  CheckCircle, 
  AlertCircle,
  FilePlus2,
  FolderOpen
} from 'lucide-react'

export default function UploadPortal({ token }) {
  const [activeSubTab, setActiveSubTab] = useState('upload') // upload vs write
  
  // File Upload states
  const [selectedFiles, setSelectedFiles] = useState([])
  const [uploadLoading, setUploadLoading] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  
  // Write Article states
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('Windows XPI')
  const [articleBody, setArticleBody] = useState('')
  const [writeLoading, setWriteLoading] = useState(false)
  const [writeResult, setWriteResult] = useState(null)

  // Drag and drop handlers
  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const files = Array.from(e.dataTransfer.files)
      setSelectedFiles(prev => [...prev, ...files])
    }
  }

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const files = Array.from(e.target.files)
      setSelectedFiles(prev => [...prev, ...files])
    }
  }

  const removeFile = (index) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
  }

  const clearUploads = () => {
    setSelectedFiles([])
    setUploadResult(null)
  }

  // Submit files to API
  const handleFileUploadSubmit = async (e) => {
    e.preventDefault()
    if (selectedFiles.length === 0) return
    
    setUploadLoading(true)
    setUploadResult(null)
    
    const formData = new FormData()
    selectedFiles.forEach(file => {
      formData.append('files', file)
    })
    
    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      })
      
      if (!response.ok) throw new Error('Upload request failed')
      
      const data = await response.json()
      setUploadResult(data)
      setSelectedFiles([]) // Clear selected
    } catch (err) {
      setUploadResult({
        errors: [`Upload failed: ${err.message}`]
      })
    } finally {
      setUploadLoading(false)
    }
  }

  // Submit new article
  const handleArticleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim() || !articleBody.trim()) return
    
    setWriteLoading(true)
    setWriteResult(null)
    
    // Format body paragraphs with simple HTML tags
    const paragraphs = articleBody.split('\n\n')
      .map(p => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
      .join('')
      
    const formData = new FormData()
    formData.append('title', title)
    formData.append('category', category)
    formData.append('content', paragraphs)
    
    try {
      const response = await fetch('/api/create-article', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      })
      
      if (!response.ok) throw new Error('Article publication failed')
      
      const data = await response.json()
      setWriteResult({
        success: true,
        message: 'Article published successfully and indexed.'
      })
      setTitle('')
      setArticleBody('')
    } catch (err) {
      setWriteResult({
        success: false,
        message: err.message
      })
    } finally {
      setWriteLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', width: '100%' }}>
      {/* Sub Tabs Toggle */}
      <div style={{ 
        display: 'flex', 
        gap: '8px', 
        marginBottom: '24px', 
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        paddingBottom: '12px' 
      }}>
        <button 
          className="btn"
          style={{ 
            background: activeSubTab === 'upload' ? 'rgba(99,102,241,0.15)' : 'transparent',
            color: activeSubTab === 'upload' ? '#818cf8' : 'var(--text-muted)',
            border: activeSubTab === 'upload' ? '1px solid rgba(99,102,241,0.2)' : 'none',
            padding: '8px 16px',
            fontSize: '0.9rem'
          }}
          onClick={() => setActiveSubTab('upload')}
        >
          <Upload size={16} /> Batch Upload Documents
        </button>
        <button 
          className="btn"
          style={{ 
            background: activeSubTab === 'write' ? 'rgba(99,102,241,0.15)' : 'transparent',
            color: activeSubTab === 'write' ? '#818cf8' : 'var(--text-muted)',
            border: activeSubTab === 'write' ? '1px solid rgba(99,102,241,0.2)' : 'none',
            padding: '8px 16px',
            fontSize: '0.9rem'
          }}
          onClick={() => setActiveSubTab('write')}
        >
          <PlusCircle size={16} /> Compose New Article
        </button>
      </div>

      {/* Sub Tab: Upload */}
      {activeSubTab === 'upload' && (
        <div className="glass-panel animate-fade-in" style={{ padding: '32px', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 style={{ fontSize: '1.4rem', color: '#fff', marginBottom: '8px', fontWeight: 600 }}>Upload Knowledge Base Files</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '24px' }}>
            Drop HTML confluence pages, PDF manuals, Word documents, Markdown drafts, or TXT logs. The engine parses and updates search indices immediately.
          </p>

          <form onSubmit={handleFileUploadSubmit}>
            {/* Drag & Drop Box */}
            <div 
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              style={{
                border: dragActive ? '2px dashed var(--primary)' : '2px dashed rgba(255,255,255,0.1)',
                borderRadius: '12px',
                padding: '40px 20px',
                textAlign: 'center',
                background: dragActive ? 'rgba(99,102,241,0.04)' : 'rgba(0,0,0,0.15)',
                cursor: 'pointer',
                transition: 'var(--transition-smooth)'
              }}
              onClick={() => document.getElementById('file-upload-input').click()}
            >
              <input 
                id="file-upload-input"
                type="file" 
                multiple
                accept=".html,.pdf,.docx,.txt,.md"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              
              <div style={{
                display: 'inline-flex',
                padding: '16px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.03)',
                marginBottom: '16px'
              }}>
                <FilePlus2 size={32} style={{ color: dragActive ? '#818cf8' : 'var(--text-muted)' }} />
              </div>
              
              <h3 style={{ fontSize: '1.1rem', color: 'var(--text-main)', marginBottom: '4px' }}>
                Drag and drop files here, or <span style={{ color: '#818cf8', textDecoration: 'underline' }}>browse</span>
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                Supports HTML, PDF, DOCX, MD, TXT (Max 25MB per file)
              </p>
            </div>

            {/* Selected Files List */}
            {selectedFiles.length > 0 && (
              <div style={{ marginTop: '24px' }}>
                <h4 style={{ fontSize: '0.9rem', color: '#fff', marginBottom: '10px' }}>Selected Files ({selectedFiles.length})</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                  {selectedFiles.map((file, idx) => (
                    <div 
                      key={idx}
                      style={{
                        padding: '10px 16px',
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                        <FileText size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                        <span style={{ fontSize: '0.85rem', textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>{file.name}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0 }}>({(file.size / 1024).toFixed(1)} KB)</span>
                      </div>
                      <button 
                        type="button"
                        style={{ border: 'none', background: 'transparent', color: 'var(--accent-rose)', cursor: 'pointer', fontSize: '0.8rem' }}
                        onClick={() => removeFile(idx)}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                
                <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
                  <button type="submit" className="btn btn-primary" disabled={uploadLoading}>
                    {uploadLoading ? 'Uploading and Indexing...' : 'Upload & Reindex'}
                  </button>
                  <button type="button" className="btn btn-secondary" onClick={clearUploads}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </form>

          {/* Upload Output Log */}
          {uploadResult && (
            <div style={{ marginTop: '30px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              {uploadResult.uploaded && uploadResult.uploaded.length > 0 && (
                <div style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '14px 18px',
                  background: 'rgba(16, 185, 129, 0.1)',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  borderRadius: '8px',
                  color: 'var(--accent-emerald)',
                  marginBottom: '16px'
                }}>
                  <CheckCircle size={18} style={{ marginTop: '2px', flexShrink: 0 }} />
                  <div>
                    <h5 style={{ fontWeight: 600, fontSize: '0.9rem' }}>Upload Completed Successfully</h5>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-main)', marginTop: '4px' }}>
                      Indexed files: {uploadResult.uploaded.join(', ')}
                    </p>
                  </div>
                </div>
              )}

              {uploadResult.errors && uploadResult.errors.length > 0 && (
                <div style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                  padding: '14px 18px',
                  background: 'rgba(244, 63, 94, 0.1)',
                  border: '1px solid rgba(244, 63, 94, 0.2)',
                  borderRadius: '8px',
                  color: 'var(--accent-rose)',
                  marginBottom: '16px'
                }}>
                  <AlertCircle size={18} style={{ marginTop: '2px', flexShrink: 0 }} />
                  <div>
                    <h5 style={{ fontWeight: 600, fontSize: '0.9rem' }}>Some files failed to process</h5>
                    <ul style={{ fontSize: '0.8rem', marginTop: '4px', paddingLeft: '16px' }}>
                      {uploadResult.errors.map((err, i) => <li key={i}>{err}</li>)}
                    </ul>
                  </div>
                </div>
              )}

              {uploadResult.indexing_message && (
                <div style={{
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: '8px',
                  padding: '16px',
                  fontFamily: 'monospace',
                  fontSize: '0.75rem',
                  color: '#c7d2fe',
                  whiteSpace: 'pre-wrap'
                }}>
                  <strong>INDEXER LOGS:</strong><br/>
                  {uploadResult.indexing_message}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Sub Tab: Write Article */}
      {activeSubTab === 'write' && (
        <div className="glass-panel animate-fade-in" style={{ padding: '32px', border: '1px solid rgba(255,255,255,0.06)' }}>
          <h2 style={{ fontSize: '1.4rem', color: '#fff', marginBottom: '8px', fontWeight: 600 }}>Create New Article</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '24px' }}>
            Draft a technical document directly inside the database. It will be formatted into an HTML Confluence page and made instantly searchable.
          </p>

          <form onSubmit={handleArticleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 500 }}>
                  ARTICLE TITLE
                </label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="e.g. Setting fixed Host ID on VM" 
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 500 }}>
                  CATEGORY / SPACE
                </label>
                <input 
                  type="text" 
                  className="input-field" 
                  placeholder="e.g. Windows-XPI" 
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  required
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 500 }}>
                BODY CONTENT (Use double newlines to separate paragraphs)
              </label>
              <textarea 
                className="input-field" 
                placeholder="Write your document content here. Explain setup instructions, errors, and workarounds clearly." 
                style={{
                  minHeight: '280px',
                  resize: 'vertical',
                  lineHeight: '1.6',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.95rem'
                }}
                value={articleBody}
                onChange={e => setArticleBody(e.target.value)}
                required
              ></textarea>
            </div>

            {writeResult && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '14px 18px',
                background: writeResult.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(244, 63, 94, 0.1)',
                border: writeResult.success ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid rgba(244, 63, 94, 0.2)',
                borderRadius: '8px',
                color: writeResult.success ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                fontSize: '0.9rem'
              }}>
                {writeResult.success ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
                <span>{writeResult.message}</span>
              </div>
            )}

            <div>
              <button type="submit" className="btn btn-primary" disabled={writeLoading}>
                {writeLoading ? 'Publishing...' : 'Publish Article'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
