import React, { useState, useRef, useEffect } from 'react'
import { 
  X, 
  Sparkles, 
  Send, 
  Bot, 
  User, 
  FileText, 
  Copy, 
  Check, 
  ArrowRight, 
  Layers, 
  Zap, 
  Workflow, 
  Cloud,
  HelpCircle,
  CornerDownLeft,
  RotateCcw
} from 'lucide-react'

export default function AICopilotModal({ isOpen, onClose, onSelectDoc, initialQuery = '', activeProduct = 'all' }) {
  const [messages, setMessages] = useState([
    {
      sender: 'ai',
      text: 'Hello! I am your **Magic Enterprise AI Copilot** (ROVO Assistant). Ask me anything about Magic xpa, Magic xpi connectors, GigaSpaces grid, configuration flags, or Cloud Native architectures.',
      citations: []
    }
  ])
  const [inputQuery, setInputQuery] = useState(initialQuery)
  const [loading, setLoading] = useState(false)
  const [productScope, setProductScope] = useState(activeProduct || 'all')
  const [copiedIndex, setCopiedIndex] = useState(null)
  
  const chatBottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (initialQuery && isOpen) {
      setInputQuery(initialQuery)
      handleSend(initialQuery)
    }
  }, [initialQuery, isOpen])

  if (!isOpen) return null

  const handleSend = async (queryToSend = null) => {
    const q = queryToSend || inputQuery
    if (!q || !q.trim() || loading) return

    const userMessage = { sender: 'user', text: q }
    setMessages((prev) => [...prev, userMessage])
    setInputQuery('')
    setLoading(true)

    try {
      const formData = new FormData()
      formData.append('question', q)
      if (productScope && productScope !== 'all') {
        formData.append('product', productScope)
      }

      const res = await fetch('/api/copilot/ask', {
        method: 'POST',
        body: formData
      })

      if (!res.ok) throw new Error('Copilot request failed')
      const data = await res.json()

      setMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: data.answer || 'No answer generated.',
          citations: data.citations || []
        }
      ])
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          sender: 'ai',
          text: `⚠️ Copilot encountered an issue: ${err.message}. Please try a different query.`,
          citations: []
        }
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleCopyText = (text, idx) => {
    navigator.clipboard.writeText(text)
    setCopiedIndex(idx)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  const samplePrompts = [
    { label: 'GigaSpaces queryCache Flag', text: 'How do I set the queryCache JVM_ARGS flag for GigaSpaces in Magic.ini?' },
    { label: 'REST Client Salesforce OAuth2', text: 'How to configure OAuth2 for REST Client with Salesforce in Magic xpi?' },
    { label: 'SAP B1 V10 Resource Error', text: 'How to validate SAP B1 V10 resource with MSSQL 2019?' },
    { label: 'Studio Debugger Port', text: 'How to configure the Debugger Port in Studio to a different port than 8005?' }
  ]

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
          maxWidth: '840px',
          height: '85vh',
          maxHeight: '750px',
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
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(0, 86, 140, 0.15)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #008DC7, #2DBCEE)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <Sparkles size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#ffffff' }}>
                  Magic AI Copilot (ROVO Assistant)
                </h3>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '1px 6px', borderRadius: '10px', background: 'rgba(45, 188, 238, 0.2)', color: '#2DBCEE' }}>
                  RAG Active
                </span>
              </div>
              <p style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                Context-aware troubleshooting & instant technical resolution
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Product Scope Selector */}
            <select
              value={productScope}
              onChange={(e) => setProductScope(e.target.value)}
              style={{
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '8px',
                color: '#e2e8f0',
                fontSize: '0.78rem',
                padding: '6px 10px',
                outline: 'none',
                cursor: 'pointer'
              }}
            >
              <option value="all" style={{ background: '#0f172a' }}>🌐 All Products Scope</option>
              <option value="xpa" style={{ background: '#0f172a' }}>⚡ Magic xpa Only</option>
              <option value="xpi" style={{ background: '#0f172a' }}>🔗 Magic xpi Only</option>
              <option value="cloud_native" style={{ background: '#0f172a' }}>☁️ Cloud Native Only</option>
            </select>

            <button
              onClick={() => {
                setMessages([{
                  sender: 'ai',
                  text: 'Chat history reset. How can I help you with Magic Software products today?',
                  citations: []
                }])
              }}
              title="Reset Conversation"
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
              <RotateCcw size={15} />
            </button>

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
        </div>

        {/* Chat History Messages */}
        <div 
          style={{
            flex: 1,
            padding: '20px',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px'
          }}
        >
          {messages.map((msg, idx) => {
            const isAI = msg.sender === 'ai'
            return (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  gap: '12px',
                  alignItems: 'flex-start',
                  alignSelf: isAI ? 'flex-start' : 'flex-end',
                  maxWidth: isAI ? '90%' : '80%'
                }}
              >
                {isAI && (
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, #008DC7, #2DBCEE)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0, marginTop: '2px' }}>
                    <Bot size={18} />
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div
                    style={{
                      padding: '12px 16px',
                      borderRadius: isAI ? '12px 12px 12px 2px' : '12px 12px 2px 12px',
                      background: isAI ? 'rgba(255, 255, 255, 0.04)' : 'linear-gradient(135deg, #00568C, #008DC7)',
                      border: isAI ? '1px solid rgba(255, 255, 255, 0.08)' : 'none',
                      color: '#f1f5f9',
                      fontSize: '0.92rem',
                      lineHeight: 1.6,
                      position: 'relative'
                    }}
                  >
                    <div style={{ whiteSpace: 'pre-wrap' }}>
                      {msg.text.split('\n').map((line, i) => {
                        // Render bold markdown
                        if (line.includes('**')) {
                          const parts = line.split('**')
                          return (
                            <p key={i} style={{ marginBottom: line.startsWith('•') ? '6px' : '8px' }}>
                              {parts.map((p, j) => j % 2 === 1 ? <strong key={j} style={{ color: '#38bdf8' }}>{p}</strong> : p)}
                            </p>
                          )
                        }
                        return <p key={i} style={{ marginBottom: line.startsWith('•') ? '6px' : '8px' }}>{line}</p>
                      })}
                    </div>

                    {isAI && (
                      <button
                        onClick={() => handleCopyText(msg.text, idx)}
                        style={{
                          position: 'absolute',
                          top: '8px',
                          right: '8px',
                          background: 'rgba(255,255,255,0.06)',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '3px 6px',
                          color: '#94a3b8',
                          fontSize: '0.72rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        {copiedIndex === idx ? <Check size={12} style={{ color: '#10b981' }} /> : <Copy size={12} />}
                        {copiedIndex === idx ? 'Copied' : 'Copy'}
                      </button>
                    )}
                  </div>

                  {/* Verified Source Citations */}
                  {isAI && msg.citations && msg.citations.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '4px' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Verified Knowledge Base Sources:
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {msg.citations.map((cite) => (
                          <button
                            key={cite.id}
                            onClick={() => {
                              onSelectDoc(cite.id)
                              onClose()
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '6px 10px',
                              borderRadius: '8px',
                              background: 'rgba(0, 141, 199, 0.1)',
                              border: '1px solid rgba(0, 141, 199, 0.3)',
                              color: '#38bdf8',
                              fontSize: '0.78rem',
                              cursor: 'pointer',
                              textAlign: 'left',
                              transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = 'rgba(0, 141, 199, 0.25)'
                              e.currentTarget.style.borderColor = '#008DC7'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'rgba(0, 141, 199, 0.1)'
                              e.currentTarget.style.borderColor = 'rgba(0, 141, 199, 0.3)'
                            }}
                          >
                            <FileText size={14} />
                            <span style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {cite.title}
                            </span>
                            <span style={{ fontSize: '0.65rem', padding: '1px 4px', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', color: '#e2e8f0', textTransform: 'uppercase' }}>
                              {cite.product}
                            </span>
                            <ArrowRight size={12} />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {!isAI && (
                  <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0, marginTop: '2px' }}>
                    <User size={18} />
                  </div>
                )}
              </div>
            )
          })}

          {loading && (
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, #008DC7, #2DBCEE)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                <Sparkles size={18} className="animate-spin" />
              </div>
              <div style={{ padding: '10px 16px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Searching Magic Knowledge Base & synthesizing technical solution...</span>
              </div>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* Suggested Prompts (if only initial greeting) */}
        {messages.length === 1 && (
          <div style={{ padding: '0 20px 12px 20px' }}>
            <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600, display: 'block', marginBottom: '8px' }}>
              Suggested Technical Questions:
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {samplePrompts.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setInputQuery(p.text)
                    handleSend(p.text)
                  }}
                  style={{
                    fontSize: '0.75rem',
                    padding: '5px 10px',
                    borderRadius: '8px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    color: '#cbd5e1',
                    cursor: 'pointer',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(0, 141, 199, 0.15)'
                    e.currentTarget.style.borderColor = '#008DC7'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)'
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)'
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input Bar */}
        <div 
          style={{
            padding: '16px 20px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(15, 23, 42, 0.8)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}
        >
          <input
            ref={inputRef}
            type="text"
            placeholder="Ask a technical question (e.g., 'How to troubleshoot memory leaks in GigaSpaces?')..."
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            style={{
              flex: 1,
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '10px',
              padding: '12px 16px',
              color: '#ffffff',
              fontSize: '0.9rem',
              outline: 'none'
            }}
          />

          <button
            onClick={() => handleSend()}
            disabled={!inputQuery.trim() || loading}
            style={{
              padding: '12px 18px',
              borderRadius: '10px',
              background: (!inputQuery.trim() || loading) 
                ? 'rgba(255, 255, 255, 0.1)' 
                : 'linear-gradient(135deg, #008DC7, #2DBCEE)',
              border: 'none',
              color: '#ffffff',
              fontWeight: 700,
              cursor: (!inputQuery.trim() || loading) ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: (!inputQuery.trim() || loading) ? 'none' : '0 4px 15px rgba(0, 141, 199, 0.35)'
            }}
          >
            <Send size={16} />
            <span>Ask</span>
          </button>
        </div>
      </div>
    </div>
  )
}
