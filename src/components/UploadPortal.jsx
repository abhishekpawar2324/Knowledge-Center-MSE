import React, { useState } from 'react'
import { 
  Upload, 
  FileText, 
  PlusCircle, 
  CheckCircle, 
  AlertCircle,
  FilePlus2,
  FolderOpen,
  X,
  Zap,
  Workflow,
  Cloud,
  Layers
} from 'lucide-react'

export default function UploadPortal({ token, onOpenKBAuthor }) {
  const [selectedProduct, setSelectedProduct] = useState('xpi')
  const [selectedFiles, setSelectedFiles] = useState([])
  const [uploadLoading, setUploadLoading] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const [dragActive, setDragActive] = useState(false)

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

  const handleFileUploadSubmit = async (e) => {
    e.preventDefault()
    if (selectedFiles.length === 0) return
    
    setUploadLoading(true)
    setUploadResult(null)
    
    const formData = new FormData()
    formData.append('product', selectedProduct)
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
      setSelectedFiles([])
    } catch (err) {
      setUploadResult({
        errors: [`Upload failed: ${err.message}`]
      })
    } finally {
      setUploadLoading(false)
    }
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '850px', margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.8rem', fontWeight: 800, color: '#ffffff', marginBottom: '6px' }}>
            Document Ingestion & Upload Portal
          </h2>
          <p style={{ fontSize: '0.9rem', color: '#94a3b8' }}>
            Upload manuals, SOPs, Word documents, and PDFs directly into product spaces.
          </p>
        </div>

        {onOpenKBAuthor && (
          <button
            onClick={() => onOpenKBAuthor(selectedProduct)}
            style={{
              padding: '10px 18px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #10b981, #06b6d4)',
              border: 'none',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <FilePlus2 size={16} /> Author KB Directly
          </button>
        )}
      </div>

      {/* Target Product Selection */}
      <div className="glass-panel" style={{ padding: '20px', borderRadius: '14px' }}>
        <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 700, color: '#cbd5e1', marginBottom: '10px' }}>
          Select Destination Product Space:
        </label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
          {[
            { id: 'xpi', name: 'Magic xpi (iPaaS)', icon: Workflow, color: '#06b6d4' },
            { id: 'xpa', name: 'Magic xpa (Studio)', icon: Zap, color: '#f59e0b' },
            { id: 'cloud_native', name: 'Cloud Native', icon: Cloud, color: '#10b981' },
            { id: 'general', name: 'General Docs', icon: Layers, color: '#94a3b8' }
          ].map(p => {
            const Icon = p.icon
            const isSel = selectedProduct === p.id
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedProduct(p.id)}
                style={{
                  padding: '12px',
                  borderRadius: '10px',
                  background: isSel ? 'rgba(0, 141, 199, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                  border: isSel ? `1px solid ${p.color}` : '1px solid rgba(255, 255, 255, 0.08)',
                  color: isSel ? '#ffffff' : '#9ca3af',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  transition: 'all 0.2s'
                }}
              >
                <Icon size={18} style={{ color: p.color }} />
                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{p.name}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Drag and Drop Zone */}
      <form onSubmit={handleFileUploadSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className="glass-panel"
          style={{
            padding: '40px 20px',
            borderRadius: '16px',
            border: dragActive ? '2px dashed #008DC7' : '2px dashed rgba(255, 255, 255, 0.15)',
            background: dragActive ? 'rgba(0, 141, 199, 0.1)' : 'rgba(15, 23, 42, 0.5)',
            textAlign: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s'
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

          <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: 'rgba(0, 141, 199, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#008DC7', margin: '0 auto 16px auto' }}>
            <Upload size={28} />
          </div>

          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ffffff', marginBottom: '8px' }}>
            Drag and drop files here, or browse
          </h3>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', maxWidth: '420px', margin: '0 auto 12px auto' }}>
            Supported formats: <strong>HTML, PDF, DOCX (Word), Markdown (.md), TXT</strong>. Embedded images and tables are extracted automatically.
          </p>
          <span style={{ fontSize: '0.75rem', padding: '4px 10px', borderRadius: '20px', background: 'rgba(255, 255, 255, 0.05)', color: '#cbd5e1' }}>
            Destination: uploads/{selectedProduct}/
          </span>
        </div>

        {/* Selected Files List */}
        {selectedFiles.length > 0 && (
          <div className="glass-panel" style={{ padding: '16px', borderRadius: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#ffffff' }}>
                Files ready for instant indexing ({selectedFiles.length}):
              </span>
              <button
                type="button"
                onClick={() => setSelectedFiles([])}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '0.78rem', cursor: 'pointer' }}
              >
                Clear all
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {selectedFiles.map((file, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.06)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileText size={16} style={{ color: '#008DC7' }} />
                    <span style={{ fontSize: '0.85rem', color: '#f3f4f6' }}>{file.name}</span>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>({(file.size / 1024).toFixed(1)} KB)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>

            <button
              type="submit"
              disabled={uploadLoading}
              style={{
                marginTop: '16px',
                width: '100%',
                padding: '12px',
                borderRadius: '10px',
                background: uploadLoading ? 'rgba(255,255,255,0.1)' : 'linear-gradient(135deg, #008DC7, #2DBCEE)',
                border: 'none',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '0.95rem',
                cursor: uploadLoading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 15px rgba(0, 141, 199, 0.35)'
              }}
            >
              <Upload size={18} />
              <span>{uploadLoading ? 'Uploading & Indexing (<50ms)...' : `Upload & Index ${selectedFiles.length} File(s)`}</span>
            </button>
          </div>
        )}

        {/* Upload Feedback */}
        {uploadResult && (
          <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px' }}>
            {uploadResult.message && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', marginBottom: '10px' }}>
                <CheckCircle size={18} />
                <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{uploadResult.message}</span>
              </div>
            )}
            {uploadResult.errors && uploadResult.errors.length > 0 && (
              <div style={{ color: '#f43f5e', fontSize: '0.85rem' }}>
                {uploadResult.errors.map((err, i) => (
                  <p key={i}>• {err}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </form>
    </div>
  )
}
