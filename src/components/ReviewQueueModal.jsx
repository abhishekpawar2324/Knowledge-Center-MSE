import React, { useState, useEffect } from 'react'
import { 
  CheckCircle, 
  AlertCircle, 
  XCheck, 
  MessageSquare, 
  X, 
  FileText, 
  User, 
  Clock, 
  Layers, 
  Filter, 
  Send,
  Eye,
  ShieldCheck,
  Zap,
  ArrowRight
} from 'lucide-react'

export default function ReviewQueueModal({ token, onClose, onRefreshData }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDoc, setSelectedDoc] = useState(null)
  const [filterProduct, setFilterProduct] = useState('all')
  const [filterStatus, setFilterStatus] = useState('pending_review')

  // Action Drawer State
  const [actionType, setActionType] = useState(null) // 'request_changes' or 'reject'
  const [reviewerComment, setReviewerComment] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchReviewQueue()
  }, [filterProduct, filterStatus])

  const fetchReviewQueue = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterProduct !== 'all') params.append('product', filterProduct)
      if (filterStatus !== 'all') params.append('status_filter', filterStatus)

      const res = await fetch(`/api/review/queue?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setItems(data)
        if (data.length > 0) {
          setSelectedDoc(data[0])
        } else {
          setSelectedDoc(null)
        }
      }
    } catch (err) {
      console.error("Failed to fetch review queue:", err)
    } finally {
      setLoading(false)
    }
  }

  const handleProcessAction = async (docId, action, commentText = '') => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/review/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          doc_id: docId,
          action: action,
          reviewer_comment: commentText
        })
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail || "Action failed")
      }

      setActionType(null)
      setReviewerComment('')
      fetchReviewQueue()
      if (onRefreshData) onRefreshData()
    } catch (err) {
      alert("Error processing review action: " + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0, 0, 0, 0.85)',
      backdropFilter: 'blur(10px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1200,
      padding: '24px'
    }}>
      <div style={{
        background: '#0f172a',
        border: '1px solid rgba(56, 189, 248, 0.3)',
        borderRadius: '20px',
        width: '100%',
        maxWidth: '1200px',
        height: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 25px 60px rgba(0,0,0,0.7)'
      }}>
        {/* Header */}
        <div style={{
          padding: '20px 28px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          background: 'linear-gradient(135deg, rgba(15,23,42,0.9) 0%, rgba(30,41,59,0.9) 100%)',
          display: 'flex',
          justify: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ padding: '10px', background: 'rgba(56,189,248,0.15)', borderRadius: '12px', color: '#38bdf8' }}>
              <ShieldCheck size={26} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ffffff', margin: 0 }}>
                KB Review & Approval Queue
              </h2>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '2px 0 0 0' }}>
                Review submitted technical articles, request revisions, or approve for publication.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Product Filter */}
            <select
              value={filterProduct}
              onChange={(e) => setFilterProduct(e.target.value)}
              style={{
                padding: '8px 12px',
                background: 'rgba(15,23,42,0.8)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '8px',
                color: '#ffffff',
                fontSize: '0.85rem'
              }}
            >
              <option value="all">🌟 All Spaces</option>
              <option value="xpi">⚡ Magic xpi</option>
              <option value="xpa">🚀 Magic xpa</option>
              <option value="cloud_native">☁️ Cloud Native</option>
              <option value="general">🛠️ General</option>
            </select>

            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{
                padding: '8px 12px',
                background: 'rgba(15,23,42,0.8)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '8px',
                color: '#ffffff',
                fontSize: '0.85rem'
              }}
            >
              <option value="pending_review">⏳ Pending Review</option>
              <option value="changes_requested">📝 Changes Requested</option>
              <option value="rejected">❌ Rejected</option>
              <option value="all">📁 All Review States</option>
            </select>

            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '6px' }}
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Content Body Split View */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          
          {/* Left Panel: Items List */}
          <div style={{
            width: '380px',
            borderRight: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(15,23,42,0.5)',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto'
          }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>
                Loading review queue...
              </div>
            ) : items.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                <CheckCircle size={36} style={{ color: '#10b981', marginBottom: '8px' }} />
                <p style={{ fontWeight: 600, color: '#e2e8f0', margin: 0 }}>Review Queue Clear</p>
                <p style={{ fontSize: '0.82rem', margin: '4px 0 0 0' }}>No pending articles matching filters.</p>
              </div>
            ) : (
              items.map(item => (
                <div
                  key={item.id}
                  onClick={() => setSelectedDoc(item)}
                  style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    background: selectedDoc?.id === item.id ? 'rgba(56,189,248,0.12)' : 'transparent',
                    borderLeft: selectedDoc?.id === item.id ? '4px solid #38bdf8' : '4px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <span style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: item.product === 'xpi' ? 'rgba(56,189,248,0.2)' : 'rgba(245,158,11,0.2)',
                      color: item.product === 'xpi' ? '#38bdf8' : '#fbbf24'
                    }}>
                      {item.product}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                      {item.created_at}
                    </span>
                  </div>

                  <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#f8fafc', margin: '0 0 6px 0', lineHeight: 1.3 }}>
                    {item.title}
                  </h4>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', color: '#94a3b8' }}>
                    <span>By {item.author}</span>
                    <span style={{
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      color: item.status === 'pending_review' ? '#fbbf24' : item.status === 'changes_requested' ? '#f59e0b' : '#f87171'
                    }}>
                      {item.status === 'pending_review' ? '⏳ Pending Review' : item.status === 'changes_requested' ? '📝 Revision Needed' : '❌ Rejected'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Right Panel: Document Preview & Action Controls */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#090d16', overflow: 'hidden' }}>
            {selectedDoc ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
                
                {/* Doc Preview Header */}
                <div style={{ padding: '20px 28px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: 'rgba(15,23,42,0.8)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                        <span style={{ background: 'rgba(56,189,248,0.15)', color: '#38bdf8', fontSize: '0.75rem', padding: '3px 10px', borderRadius: '4px', fontWeight: 700 }}>
                          {selectedDoc.product.toUpperCase()} SPACE
                        </span>
                        <span style={{ background: 'rgba(255,255,255,0.06)', color: '#e2e8f0', fontSize: '0.75rem', padding: '3px 10px', borderRadius: '4px' }}>
                          Version: {selectedDoc.version}
                        </span>
                        <span style={{ background: 'rgba(255,255,255,0.06)', color: '#e2e8f0', fontSize: '0.75rem', padding: '3px 10px', borderRadius: '4px' }}>
                          Type: {selectedDoc.doc_type}
                        </span>
                      </div>
                      <h2 style={{ fontSize: '1.4rem', color: '#ffffff', margin: 0, fontWeight: 700 }}>{selectedDoc.title}</h2>
                      <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '4px 0 0 0' }}>
                        Submitted by <strong>{selectedDoc.author}</strong> on {selectedDoc.created_at}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Doc Content Area */}
                <div style={{ flex: 1, padding: '28px', overflowY: 'auto', color: '#cbd5e1', fontSize: '0.95rem', lineHeight: 1.7 }}>
                  {selectedDoc.review_comment && (
                    <div style={{
                      marginBottom: '20px',
                      padding: '14px 18px',
                      background: 'rgba(245,158,11,0.12)',
                      border: '1px solid rgba(245,158,11,0.3)',
                      borderRadius: '10px',
                      color: '#fbbf24',
                      fontSize: '0.88rem'
                    }}>
                      <strong>Previous Reviewer Note:</strong> "{selectedDoc.review_comment}"
                    </div>
                  )}

                  <div style={{ 
                    background: 'rgba(15,23,42,0.4)', 
                    padding: '24px', 
                    borderRadius: '12px', 
                    border: '1px solid rgba(255,255,255,0.06)',
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'system-ui, -apple-system, sans-serif'
                  }}>
                    {selectedDoc.content_preview || "No content preview available."}
                  </div>
                </div>

                {/* Reviewer Action Bar */}
                <div style={{
                  padding: '20px 28px',
                  borderTop: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(15,23,42,0.95)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}>
                  {actionType ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'rgba(0,0,0,0.4)', padding: '16px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)' }}>
                      <label style={{ fontSize: '0.85rem', color: '#38bdf8', fontWeight: 600 }}>
                        {actionType === 'request_changes' ? '📝 Specify Required Revisions / Comments for Author:' : '❌ Enter Reason for Rejection:'}
                      </label>
                      <textarea
                        rows={3}
                        placeholder={actionType === 'request_changes' ? "e.g. Please clarify step 3 and attach error screenshot..." : "Reason for rejection..."}
                        value={reviewerComment}
                        onChange={(e) => setReviewerComment(e.target.value)}
                        style={{ width: '100%', padding: '10px', background: '#0f172a', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '8px', color: '#ffffff', fontSize: '0.88rem' }}
                      />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                        <button
                          onClick={() => setActionType(null)}
                          style={{ padding: '8px 14px', background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', color: '#94a3b8', cursor: 'pointer', fontSize: '0.85rem' }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleProcessAction(selectedDoc.id, actionType, reviewerComment)}
                          disabled={submitting}
                          style={{
                            padding: '8px 18px',
                            background: actionType === 'request_changes' ? '#f59e0b' : '#ef4444',
                            border: 'none',
                            borderRadius: '6px',
                            color: '#ffffff',
                            fontWeight: 600,
                            fontSize: '0.85rem',
                            cursor: 'pointer'
                          }}
                        >
                          {submitting ? "Sending..." : actionType === 'request_changes' ? 'Send Feedback' : 'Confirm Reject'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                        Review Decision for Article ID <strong>#{selectedDoc.id}</strong>
                      </span>

                      <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                          onClick={() => setActionType('request_changes')}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '10px 18px',
                            background: 'rgba(245,158,11,0.15)',
                            color: '#fbbf24',
                            border: '1px solid rgba(245,158,11,0.3)',
                            borderRadius: '8px',
                            fontWeight: 600,
                            fontSize: '0.88rem',
                            cursor: 'pointer'
                          }}
                        >
                          <MessageSquare size={16} />
                          Request Changes
                        </button>

                        <button
                          onClick={() => setActionType('reject')}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '10px 16px',
                            background: 'rgba(239,68,68,0.15)',
                            color: '#f87171',
                            border: '1px solid rgba(239,68,68,0.3)',
                            borderRadius: '8px',
                            fontWeight: 600,
                            fontSize: '0.88rem',
                            cursor: 'pointer'
                          }}
                        >
                          <X size={16} />
                          Reject
                        </button>

                        <button
                          onClick={() => handleProcessAction(selectedDoc.id, 'approve')}
                          disabled={submitting}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '10px 22px',
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '8px',
                            fontWeight: 700,
                            fontSize: '0.88rem',
                            cursor: 'pointer',
                            boxShadow: '0 4px 14px rgba(16,185,129,0.35)'
                          }}
                        >
                          <CheckCircle size={17} />
                          Approve & Publish
                        </button>
                      </div>
                    </div>
                  )}
                </div>

              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                Select a document from the left queue to review details.
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
