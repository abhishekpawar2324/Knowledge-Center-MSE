// Magic Software Enterprises Knowledge Center Client Application
document.addEventListener('DOMContentLoaded', () => {
  // State
  let token = localStorage.getItem('token') || ''
  let username = localStorage.getItem('username') || ''
  let role = localStorage.getItem('role') || ''
  let activeProduct = 'all' // 'all', 'xpa', 'xpi', 'cloud_native'
  let currentDoc = null
  let overviewData = null
  let searchDebounce = null
  let adminDocsCache = []
  let contribDataCache = null

  // Hot Topic Definitions per product
  const hotTopicsMap = {
    xpi: [
      { label: 'JVM_ARGS & Memory', query: 'JVM_ARGS memory' },
      { label: 'SAP Connectors', query: 'SAP connector' },
      { label: 'Salesforce REST', query: 'Salesforce OAuth2' },
      { label: 'GigaSpaces Grid', query: 'GigaSpaces GSC' },
      { label: 'Data Mapper', query: 'Data Mapper' },
      { label: 'Environment Variables', query: 'Environment Variables' }
    ],
    xpa: [
      { label: 'Magic.ini Settings', query: 'Magic.ini' },
      { label: 'RIA Server Setup', query: 'RIA Server' },
      { label: 'Studio & Forms', query: 'Studio Form' },
      { label: 'Mobile Deployment', query: 'Mobile deployment' },
      { label: 'Port 8005 Debugger', query: 'Port 8005' }
    ],
    cloud_native: [
      { label: 'AOC Team SOPs', query: 'AOC' },
      { label: 'Docker Containers', query: 'Docker' },
      { label: 'Kubernetes Setup', query: 'Kubernetes' },
      { label: 'Linux Modernization', query: 'Linux modernization' }
    ]
  }

  // Init Lucide icons
  if (window.lucide) lucide.createIcons()

  // ==================== 1. RECENTLY VIEWED ====================
  function getRecentlyViewed() {
    try {
      return JSON.parse(localStorage.getItem('recently_viewed_docs') || '[]')
    } catch (e) {
      return []
    }
  }

  function addRecentlyViewed(doc) {
    if (!doc || !doc.id) return
    let recents = getRecentlyViewed()
    recents = [{ id: doc.id, title: doc.title, product: doc.product || activeProduct }, ...recents.filter(r => r.id !== doc.id)].slice(0, 8)
    localStorage.setItem('recently_viewed_docs', JSON.stringify(recents))
    renderRecentlyViewed()
  }

  function removeRecentlyViewed(id) {
    let recents = getRecentlyViewed().filter(r => r.id !== id)
    localStorage.setItem('recently_viewed_docs', JSON.stringify(recents))
    renderRecentlyViewed()
  }

  function renderRecentlyViewed() {
    const container = document.getElementById('left-recent-list')
    if (!container) return
    const recents = getRecentlyViewed()
    const filtered = (activeProduct === 'all') 
      ? recents 
      : recents.filter(r => r.product === activeProduct)

    container.innerHTML = ''
    if (filtered.length === 0) {
      container.innerHTML = '<span style="font-size:0.75rem; color:#64748b;">Open any article to track it here.</span>'
      return
    }

    filtered.slice(0, 5).forEach(r => {
      const row = document.createElement('div')
      row.className = 'sidebar-item-row'
      row.innerHTML = `
        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#e2e8f0;">🕒 ${r.title}</span>
        <button class="sidebar-item-remove" title="Remove from Recent">✕</button>
      `
      row.onclick = (e) => {
        if (e.target.classList.contains('sidebar-item-remove')) {
          e.stopPropagation()
          removeRecentlyViewed(r.id)
          return
        }
        openDocument(r.id)
      }
      container.appendChild(row)
    })
  }

  // ==================== 2. PINNED SOPS ====================
  async function unpinDocument(docId) {
    try {
      await fetch(`/api/document/${docId}/pin`, { method: 'POST' })
      if (currentDoc && currentDoc.id === docId) {
        currentDoc.is_pinned = false
        updatePinButtonState(false)
      }
      fetchOverview()
    } catch (e) {}
  }

  function updatePinButtonState(isPinned) {
    const pinBtn = document.getElementById('btn-doc-pin')
    const pinLabel = document.getElementById('btn-doc-pin-label')
    if (!pinBtn || !pinLabel) return
    if (isPinned) {
      pinBtn.style.background = 'rgba(245,158,11,0.2)'
      pinBtn.style.borderColor = '#f59e0b'
      pinBtn.style.color = '#fbbf24'
      pinLabel.textContent = 'Pinned SOP'
    } else {
      pinBtn.style.background = 'rgba(255,255,255,0.06)'
      pinBtn.style.borderColor = 'rgba(255,255,255,0.1)'
      pinBtn.style.color = '#fbbf24'
      pinLabel.textContent = 'Pin SOP'
    }
  }

  function renderPinnedList(pinnedDocs) {
    const container = document.getElementById('left-pinned-list')
    if (!container) return
    container.innerHTML = ''
    
    const filtered = (activeProduct === 'all') 
      ? pinnedDocs 
      : pinnedDocs.filter(d => d.product === activeProduct)

    if (!filtered || filtered.length === 0) {
      container.innerHTML = '<span style="font-size:0.75rem; color:#64748b;">No pinned SOPs in this space.</span>'
      return
    }

    filtered.slice(0, 5).forEach(doc => {
      const row = document.createElement('div')
      row.className = 'sidebar-item-row'
      row.innerHTML = `
        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#fbbf24;">⭐ ${doc.title}</span>
        <button class="sidebar-item-remove" title="Unpin SOP">✕</button>
      `
      row.onclick = (e) => {
        if (e.target.classList.contains('sidebar-item-remove')) {
          e.stopPropagation()
          unpinDocument(doc.id)
          return
        }
        openDocument(doc.id)
      }
      container.appendChild(row)
    })
  }

  // ==================== 3. FAVOURITES ====================
  function getUserFavourites() {
    try {
      return JSON.parse(localStorage.getItem('user_favourites') || '[]')
    } catch (e) {
      return []
    }
  }

  function saveUserFavourites(favs) {
    localStorage.setItem('user_favourites', JSON.stringify(favs))
    renderFavouritesList()
  }

  function isDocFavourite(docId) {
    const favs = getUserFavourites()
    return favs.some(f => f.id === docId)
  }

  function toggleDocFavourite(doc) {
    if (!doc || !doc.id) return
    let favs = getUserFavourites()
    const exists = favs.some(f => f.id === doc.id)
    if (exists) {
      favs = favs.filter(f => f.id !== doc.id)
    } else {
      favs.unshift({ id: doc.id, title: doc.title, product: doc.product || activeProduct })
    }
    saveUserFavourites(favs)
    updateFavouriteButtonState(doc.id)
  }

  function updateFavouriteButtonState(docId) {
    const btn = document.getElementById('btn-doc-fav')
    const label = document.getElementById('btn-doc-fav-label')
    if (!btn || !label) return

    const isFav = isDocFavourite(docId)
    if (isFav) {
      btn.style.background = 'rgba(244,63,94,0.2)'
      btn.style.borderColor = '#f43f5e'
      btn.style.color = '#f43f5e'
      label.textContent = 'Favourited'
    } else {
      btn.style.background = 'rgba(255,255,255,0.06)'
      btn.style.borderColor = 'rgba(255,255,255,0.1)'
      btn.style.color = '#f43f5e'
      label.textContent = 'Favourite'
    }
  }

  function renderFavouritesList() {
    const container = document.getElementById('left-top-favorites-list')
    if (!container) return

    const userFavs = getUserFavourites()
    const filteredUserFavs = (activeProduct === 'all') 
      ? userFavs 
      : userFavs.filter(f => f.product === activeProduct)

    container.innerHTML = ''

    if (filteredUserFavs.length > 0) {
      filteredUserFavs.slice(0, 5).forEach(f => {
        const row = document.createElement('div')
        row.className = 'sidebar-item-row'
        row.style.borderColor = 'rgba(244,63,94,0.15)'
        row.innerHTML = `
          <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#fca5a5;">❤️ ${f.title}</span>
          <button class="sidebar-item-remove" title="Remove from Favourites">✕</button>
        `
        row.onclick = (e) => {
          if (e.target.classList.contains('sidebar-item-remove')) {
            e.stopPropagation()
            toggleDocFavourite(f)
            return
          }
          openDocument(f.id)
        }
        container.appendChild(row)
      })
    } else {
      container.innerHTML = '<span style="font-size:0.75rem; color:#64748b;">No favourite guides saved yet.</span>'
    }
  }

  // ==================== 4. BOOKMARKS ====================
  function getLocalBookmarks() {
    try {
      return JSON.parse(localStorage.getItem('user_bookmarks') || '[]')
    } catch (e) {
      return []
    }
  }

  function saveLocalBookmarks(bks) {
    localStorage.setItem('user_bookmarks', JSON.stringify(bks))
    renderBookmarksList()
  }

  function isDocBookmarked(docId) {
    const bks = getLocalBookmarks()
    return bks.some(b => b.id === docId)
  }

  function toggleDocBookmark(doc) {
    if (!doc || !doc.id) return
    let bks = getLocalBookmarks()
    const exists = bks.some(b => b.id === doc.id)
    if (exists) {
      bks = bks.filter(b => b.id !== doc.id)
    } else {
      bks.unshift({ id: doc.id, title: doc.title, product: doc.product || activeProduct })
    }
    saveLocalBookmarks(bks)
    updateBookmarkButtonState(doc.id)
  }

  function updateBookmarkButtonState(docId) {
    const btn = document.getElementById('btn-doc-bookmark')
    const label = document.getElementById('btn-doc-bookmark-label')
    if (!btn || !label) return

    const bookmarked = isDocBookmarked(docId)
    if (bookmarked) {
      btn.style.background = 'rgba(0,141,199,0.2)'
      btn.style.borderColor = '#008DC7'
      btn.style.color = '#38bdf8'
      label.textContent = 'Bookmarked'
    } else {
      btn.style.background = 'rgba(255,255,255,0.06)'
      btn.style.borderColor = 'rgba(255,255,255,0.1)'
      btn.style.color = '#38bdf8'
      label.textContent = 'Bookmark'
    }
  }

  function renderBookmarksList() {
    const container = document.getElementById('left-favorites-list')
    const countBadge = document.getElementById('left-bookmarks-count')
    if (!container) return

    const bks = getLocalBookmarks()
    const filtered = (activeProduct === 'all') 
      ? bks 
      : bks.filter(b => b.product === activeProduct)

    if (countBadge) countBadge.textContent = filtered.length

    container.innerHTML = ''
    if (filtered.length === 0) {
      container.innerHTML = '<span style="font-size:0.75rem; color:#64748b;">No saved bookmarks yet.</span>'
      return
    }

    filtered.slice(0, 6).forEach(b => {
      const row = document.createElement('div')
      row.className = 'sidebar-item-row'
      row.style.borderColor = 'rgba(0,141,199,0.15)'
      row.innerHTML = `
        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#38bdf8;">🔖 ${b.title}</span>
        <button class="sidebar-item-remove" title="Remove Bookmark">✕</button>
      `
      row.onclick = (e) => {
        if (e.target.classList.contains('sidebar-item-remove')) {
          e.stopPropagation()
          toggleDocBookmark(b)
          return
        }
        openDocument(b.id)
      }
      container.appendChild(row)
    })
  }

  // ==================== 5. AUTH & PROFILE ====================
  function updateAuthUI() {
    const userBox = document.getElementById('user-profile-box')
    const signinBtn = document.getElementById('btn-open-signin')
    const btnWriteKb = document.getElementById('btn-write-kb')
    const btnUpload = document.getElementById('btn-tab-upload')
    const btnAdmin = document.getElementById('btn-tab-admin')
    const userNameLabel = document.getElementById('user-name-label')

    if (token) {
      userBox.classList.remove('hide')
      signinBtn.classList.add('hide')
      userNameLabel.textContent = username

      if (['Admin', 'Editor'].includes(role)) {
        btnWriteKb.classList.remove('hide')
        btnUpload.classList.remove('hide')
      } else {
        btnWriteKb.classList.add('hide')
        btnUpload.classList.add('hide')
      }

      if (role === 'Admin') {
        btnAdmin.classList.remove('hide')
      } else {
        btnAdmin.classList.add('hide')
      }
    } else {
      userBox.classList.add('hide')
      signinBtn.classList.remove('hide')
      btnWriteKb.classList.add('hide')
      btnUpload.classList.add('hide')
      btnAdmin.classList.add('hide')
    }
  }

  // ==================== 6. OVERVIEW METRICS ====================
  async function fetchOverview() {
    try {
      const res = await fetch('/api/products/overview')
      if (!res.ok) return
      overviewData = await res.json()
      
      let xpaCount = 0
      let xpiCount = 0
      let cloudCount = 0

      if (overviewData.products) {
        xpaCount = typeof overviewData.products.xpa === 'number' ? overviewData.products.xpa : (overviewData.products.xpa?.count || 0)
        xpiCount = typeof overviewData.products.xpi === 'number' ? overviewData.products.xpi : (overviewData.products.xpi?.count || 0)
        cloudCount = typeof overviewData.products.cloud_native === 'number' ? overviewData.products.cloud_native : (overviewData.products.cloud_native?.count || 0)
      } else if (overviewData.by_product) {
        xpaCount = overviewData.by_product.xpa || 0
        xpiCount = overviewData.by_product.xpi || 0
        cloudCount = overviewData.by_product.cloud_native || 0
      }

      const xpaEl = document.getElementById('home-xpa-count')
      const xpiEl = document.getElementById('home-xpi-count')
      const cloudEl = document.getElementById('home-cloud-count')

      if (xpaEl) xpaEl.textContent = `${xpaCount} Articles`
      if (xpiEl) xpiEl.textContent = `${xpiCount} Articles`
      if (cloudEl) cloudEl.textContent = `${cloudCount} Articles`

      if (overviewData.pinned) {
        renderPinnedList(overviewData.pinned)
      }
    } catch (e) {
      console.error('Error fetching overview:', e)
    }
  }

  // ==================== 7. PRODUCT HERO QUICK SUGGESTIONS ====================
  function renderProductHeroChips() {
    const quickChips = document.getElementById('product-hero-quick-chips')
    if (!quickChips) return
    const topics = hotTopicsMap[activeProduct] || []
    quickChips.innerHTML = ''

    topics.forEach(t => {
      const chip = document.createElement('button')
      chip.style.cssText = 'padding:6px 14px; border-radius:20px; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12); color:#e2e8f0; font-size:0.8rem; cursor:pointer; transition:all 0.2s;'
      chip.textContent = `# ${t.label}`
      chip.onclick = () => {
        const searchInput = document.getElementById('omnibox-search-input')
        searchInput.value = t.query
        document.getElementById('btn-clear-search').classList.remove('hide')
        performSearch()
      }
      quickChips.appendChild(chip)
    })
  }

  // ==================== 8. FEATURED DOCUMENTATION WELCOME ====================
  async function fetchFeaturedProductDocs() {
    const container = document.getElementById('product-doc-listing-container')
    const counter = document.getElementById('product-doc-listing-counter')
    const heroTitle = document.getElementById('product-hero-title')
    const heroDesc = document.getElementById('product-hero-desc')
    if (!container) return

    const productNames = {
      xpa: 'Magic xpa Application Platform',
      xpi: 'Magic xpi Integration Platform',
      cloud_native: 'Cloud Native Products'
    }

    const pTitle = productNames[activeProduct] || 'Product Space'
    if (heroTitle) heroTitle.textContent = `Explore ${pTitle}`
    if (heroDesc) heroDesc.textContent = `Search documentation, error codes, and connectors, or explore key guides below.`
    if (counter) counter.textContent = `Featured & Essential Guides for ${pTitle}`

    container.innerHTML = '<div style="padding:20px; color:#94a3b8; text-align:center;">Loading featured guides...</div>'

    try {
      const res = await fetch(`/api/search?q=*&product=${encodeURIComponent(activeProduct)}`)
      if (!res.ok) throw new Error('Failed to load docs')
      const docs = await res.json()

      container.innerHTML = ''
      const featured = docs.slice(0, 5)

      if (featured.length === 0) {
        container.innerHTML = `
          <div class="glass-panel" style="padding:32px; text-align:center;">
            <p style="font-size:0.88rem; color:#94a3b8;">No articles published for this space yet.</p>
          </div>
        `
        return
      }

      featured.forEach(doc => {
        const card = document.createElement('div')
        card.className = 'glass-panel glass-panel-hover'
        card.style.cssText = 'padding:16px 20px; cursor:pointer; display:flex; flex-direction:column; gap:6px;'
        card.innerHTML = `
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:0.72rem; font-weight:700; padding:2px 8px; border-radius:6px; background:rgba(0,141,199,0.15); color:#38bdf8; text-transform:uppercase;">${doc.product}</span>
              <span style="font-size:0.72rem; padding:2px 8px; border-radius:6px; background:rgba(255,255,255,0.06); color:#9ca3af; text-transform:uppercase;">${doc.file_type}</span>
              ${doc.is_pinned ? `<span style="font-size:0.72rem; color:#f59e0b; font-weight:700;">★ Pinned SOP</span>` : ''}
            </div>
            <span style="font-size:0.72rem; color:#64748b;">${doc.views || 0} views</span>
          </div>
          <h4 style="font-size:1.05rem; font-weight:700; color:#fff; margin:2px 0;">${doc.title}</h4>
          ${doc.snippet ? `<p style="font-size:0.84rem; color:#94a3b8; line-height:1.5; margin:0;">${doc.snippet}</p>` : ''}
        `
        card.onclick = () => openDocument(doc.id)
        container.appendChild(card)
      })

      if (window.lucide) lucide.createIcons()
    } catch (e) {
      container.innerHTML = '<div style="padding:20px; color:#f43f5e; text-align:center;">Failed to load featured guides.</div>'
    }
  }

  // ==================== 9. NOTIFICATIONS & ALERTS ====================
  async function fetchNotifications() {
    try {
      const res = await fetch('/api/notifications')
      if (!res.ok) return
      const data = await res.json()
      const badge = document.getElementById('notif-badge')
      if (data.unread_count > 0) {
        badge.textContent = data.unread_count
        badge.classList.remove('hide')
      } else {
        badge.classList.add('hide')
      }
      renderNotifications(data.notifications || [])
    } catch (e) {}
  }

  window.dismissNotification = async function(notifId, e) {
    if (e) e.stopPropagation()
    const itemEl = document.getElementById(`notif-item-${notifId}`)
    if (itemEl) {
      itemEl.style.transition = 'all 0.2s ease'
      itemEl.style.opacity = '0'
      itemEl.style.transform = 'translateX(20px)'
      setTimeout(() => {
        itemEl.remove()
        const container = document.getElementById('notification-list')
        if (container && container.children.length === 0) {
          container.innerHTML = '<span style="font-size:0.78rem; color:#64748b; text-align:center; padding:16px; display:block;">✓ All caught up! No unread notifications.</span>'
        }
      }, 200)
    }

    // Decrement badge count
    const badge = document.getElementById('notif-badge')
    if (badge && !badge.classList.contains('hide')) {
      const current = parseInt(badge.textContent || '1', 10) - 1
      if (current <= 0) {
        badge.classList.add('hide')
      } else {
        badge.textContent = current
      }
    }

    try {
      await fetch(`/api/notifications/${notifId}`, { method: 'DELETE' })
    } catch (err) {
      console.error('Failed to dismiss notification:', err)
    }
  }

  function renderNotifications(notifs) {
    const container = document.getElementById('notification-list')
    if (!container) return
    container.innerHTML = ''
    
    // Only show active unread notifications so read items disappear
    const unreadNotifs = notifs.filter(n => !n.is_read)
    
    if (unreadNotifs.length === 0) {
      container.innerHTML = '<span style="font-size:0.78rem; color:#64748b; text-align:center; padding:16px; display:block;">✓ All caught up! No unread notifications.</span>'
      return
    }

    unreadNotifs.slice(0, 10).forEach(n => {
      const item = document.createElement('div')
      item.id = `notif-item-${n.id}`
      const timeStr = n.timestamp || 'Just now'
      item.style.cssText = `padding:11px 13px; border-radius:8px; background:rgba(0,141,199,0.14); border:1px solid rgba(0,141,199,0.25); cursor:pointer; transition:all 0.2s; position:relative;`
      item.innerHTML = `
        <div style="font-size:0.84rem; font-weight:700; color:#fff; margin-bottom:3px; display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="width:6px; height:6px; border-radius:50%; background:#38bdf8; flex-shrink:0;"></span>
            <span>${n.title}</span>
          </div>
          <button 
            type="button" 
            onclick="dismissNotification(${n.id}, event)" 
            title="Dismiss notification" 
            style="background:none; border:none; color:#94a3b8; font-size:0.95rem; line-height:1; cursor:pointer; padding:1px 5px; border-radius:4px; transition:all 0.15s; flex-shrink:0;"
            onmouseover="this.style.color='#f43f5e'; this.style.background='rgba(244,63,94,0.15)'" 
            onmouseout="this.style.color='#94a3b8'; this.style.background='transparent'"
          >✕</button>
        </div>
        <div style="font-size:0.78rem; color:#cbd5e1; margin-bottom:5px; line-height:1.4;">${n.message}</div>
        <div style="font-size:0.68rem; color:#94a3b8;">${timeStr}</div>
      `
      item.onclick = async () => {
        try {
          await fetch(`/api/notifications/${n.id}/read`, { method: 'POST' })
        } catch (e) {}
        if (n.doc_id) openDocument(n.doc_id)
        document.getElementById('notification-dropdown').classList.add('hide')
        fetchNotifications()
      }
      container.appendChild(item)
    })
  }

  document.getElementById('btn-mark-all-read').addEventListener('click', async () => {
    // Instant Optimistic UI: clear badge and list
    const badge = document.getElementById('notif-badge')
    if (badge) {
      badge.classList.add('hide')
      badge.textContent = '0'
    }
    const container = document.getElementById('notification-list')
    if (container) {
      container.innerHTML = '<span style="font-size:0.78rem; color:#64748b; text-align:center; padding:16px; display:block;">✓ All caught up! No unread notifications.</span>'
    }

    try {
      await fetch('/api/notifications/read-all', { method: 'POST' })
      fetchNotifications()
    } catch (e) {}
  })

  // ==================== 10. PRODUCT SCOPE SWITCHING ====================
  window.switchProductScope = function(prodId) {
    activeProduct = prodId
    document.querySelectorAll('.product-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.product === prodId)
    })

    const copilotScope = document.getElementById('copilot-product-scope')
    if (copilotScope) copilotScope.value = prodId

    // Hide special pages (Admin Suite, Upload Portal, Login Page)
    document.getElementById('page-admin-suite').classList.add('hide')
    document.getElementById('page-upload-portal').classList.add('hide')
    const pageLogin = document.getElementById('page-login')
    if (pageLogin) pageLogin.classList.add('hide')

    if (prodId === 'all') {
      // Clean Home Landing
      document.getElementById('page-home-landing').classList.remove('hide')
      document.getElementById('page-product-workspace').classList.add('hide')
      fetchOverview()
    } else {
      // Dedicated Product Workspace
      document.getElementById('page-home-landing').classList.add('hide')
      document.getElementById('page-product-workspace').classList.remove('hide')

      // Reset subviews
      document.getElementById('view-search-results').classList.add('hide')
      document.getElementById('view-document-reader').classList.add('hide')
      document.getElementById('view-product-doc-listing').classList.remove('hide')

      const activeBadge = document.getElementById('workspace-active-badge')
      const searchInput = document.getElementById('omnibox-search-input')
      searchInput.value = ''
      document.getElementById('btn-clear-search').classList.add('hide')

      if (prodId === 'xpa') {
        activeBadge.textContent = '⚡ Magic xpa Workspace'
        activeBadge.style.background = 'rgba(245, 158, 11, 0.15)'
        activeBadge.style.color = '#fbbf24'
        activeBadge.style.border = '1px solid rgba(245, 158, 11, 0.3)'
        searchInput.placeholder = 'Search Magic xpa documentation, Studio, RIA, parameters...'
      } else if (prodId === 'xpi') {
        activeBadge.textContent = '🔗 Magic xpi Workspace'
        activeBadge.style.background = 'rgba(6, 182, 212, 0.15)'
        activeBadge.style.color = '#22d3ee'
        activeBadge.style.border = '1px solid rgba(6, 182, 212, 0.3)'
        searchInput.placeholder = 'Search Magic xpi connectors, Data Mapper, JVM_ARGS, GigaSpaces...'
      } else if (prodId === 'cloud_native') {
        activeBadge.textContent = '☁️ Cloud Native Workspace'
        activeBadge.style.background = 'rgba(16, 185, 129, 0.15)'
        activeBadge.style.color = '#34d399'
        activeBadge.style.border = '1px solid rgba(16, 185, 129, 0.3)'
        searchInput.placeholder = 'Search AOC SOPs, Docker/K8s, Linux modernization guides...'
      }

      renderRecentlyViewed()
      renderBookmarksList()
      renderFavouritesList()
      renderProductHeroChips()
      fetchFeaturedProductDocs()
      if (overviewData?.pinned) renderPinnedList(overviewData.pinned)
    }
  }

  document.querySelectorAll('.product-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchProductScope(btn.dataset.product)
    })
  })

  // Back to All Products
  document.getElementById('btn-workspace-back-home').addEventListener('click', () => {
    switchProductScope('all')
  })
  document.getElementById('header-brand-logo').addEventListener('click', () => {
    switchProductScope('all')
  })

  // ==================== 11. OMNIBOX SEARCH ====================
  const searchInput = document.getElementById('omnibox-search-input')
  const clearSearchBtn = document.getElementById('btn-clear-search')

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim()
    clearSearchBtn.classList.toggle('hide', !q)
    clearTimeout(searchDebounce)
    if (!q) {
      document.getElementById('view-search-results').classList.add('hide')
      document.getElementById('view-document-reader').classList.add('hide')
      document.getElementById('view-product-doc-listing').classList.remove('hide')
      return
    }
    searchDebounce = setTimeout(performSearch, 200)
  })

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = ''
    clearSearchBtn.classList.add('hide')
    document.getElementById('view-search-results').classList.add('hide')
    document.getElementById('view-document-reader').classList.add('hide')
    document.getElementById('view-product-doc-listing').classList.remove('hide')
  })

  document.getElementById('filter-format').addEventListener('change', performSearch)

  // AI Assistant Search Trigger option below Search Bar
  document.getElementById('btn-search-ai-assist').addEventListener('click', () => {
    const q = searchInput.value.trim()
    openCopilotWithQuery(q)
  })

  async function performSearch() {
    const q = searchInput.value.trim()
    if (!q) {
      document.getElementById('view-search-results').classList.add('hide')
      document.getElementById('view-product-doc-listing').classList.remove('hide')
      return
    }

    const fmt = document.getElementById('filter-format').value
    let url = `/api/search?q=${encodeURIComponent(q)}`
    if (activeProduct !== 'all') url += `&product=${encodeURIComponent(activeProduct)}`
    if (fmt) url += `&type=${encodeURIComponent(fmt)}`

    const headers = {}
    if (token) headers['Authorization'] = `Bearer ${token}`

    try {
      const res = await fetch(url, { headers })
      if (!res.ok) return
      const results = await res.json()
      renderSearchResults(results, q)
    } catch (e) {
      console.error(e)
    }
  }

  function renderSearchResults(results, query) {
    document.getElementById('view-product-doc-listing').classList.add('hide')
    document.getElementById('view-document-reader').classList.add('hide')
    document.getElementById('view-search-results').classList.remove('hide')

    const counter = document.getElementById('search-results-counter')
    const container = document.getElementById('search-results-container')
    counter.textContent = `Found ${results.length} result(s) in this product space for "${query}"`
    container.innerHTML = ''

    if (results.length === 0) {
      container.innerHTML = `
        <div class="glass-panel" style="padding:36px; text-align:center;">
          <h3 style="font-size:1.15rem; font-weight:700; color:#fff; margin-bottom:8px;">No matching documents found</h3>
          <p style="font-size:0.85rem; color:#94a3b8; margin-bottom:16px;">Try searching with different keywords, or ask the Magic AI Assistant to synthesize a solution.</p>
          <button class="btn btn-primary" onclick="openCopilotWithQuery('${query.replace(/'/g, "\\'")}')">
            <i data-lucide="sparkles" style="width:16px; height:16px;"></i> Ask Magic AI Assistant
          </button>
        </div>
      `
      if (window.lucide) lucide.createIcons()
      return
    }

    results.forEach(doc => {
      const card = document.createElement('div')
      card.className = 'glass-panel glass-panel-hover'
      card.style.cssText = 'padding:18px 20px; cursor:pointer; display:flex; flex-direction:column; gap:8px;'
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
          <div>
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
              <span style="font-size:0.72rem; font-weight:700; padding:2px 8px; border-radius:6px; background:rgba(0,141,199,0.15); color:#38bdf8; text-transform:uppercase;">${doc.product}</span>
              <span style="font-size:0.72rem; padding:2px 8px; border-radius:6px; background:rgba(255,255,255,0.06); color:#9ca3af; text-transform:uppercase;">${doc.file_type}</span>
              ${doc.version && doc.version !== 'Universal' ? `<span style="font-size:0.72rem; color:#cbd5e1;">${doc.version}</span>` : ''}
              ${doc.is_pinned ? `<span style="font-size:0.72rem; color:#f59e0b; font-weight:700;">★ Pinned SOP</span>` : ''}
            </div>
            <h3 style="font-size:1.15rem; font-weight:700; color:#fff; margin-bottom:4px;">${doc.title}</h3>
          </div>
          <span style="font-size:0.75rem; color:#64748b;">${doc.views || 0} views</span>
        </div>
        ${doc.snippet ? `<p style="font-size:0.88rem; color:#cbd5e1; line-height:1.6;">${doc.snippet}</p>` : ''}
        <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid rgba(255,255,255,0.04); padding-top:8px; font-size:0.78rem; color:#64748b;">
          <span>By ${doc.author || 'Engineering'} • ${doc.created_at}</span>
          <span style="color:#008DC7; font-weight:600;">Read SOP →</span>
        </div>
      `
      card.onclick = () => openDocument(doc.id)
      container.appendChild(card)
    })
    if (window.lucide) lucide.createIcons()
  }

  // ==================== 12. DOCUMENT READER VIEW ====================
  async function openDocument(docId) {
    document.getElementById('page-admin-suite').classList.add('hide')
    document.getElementById('page-upload-portal').classList.add('hide')
    document.getElementById('page-home-landing').classList.add('hide')
    document.getElementById('page-product-workspace').classList.remove('hide')
    document.getElementById('view-product-doc-listing').classList.add('hide')
    document.getElementById('view-search-results').classList.add('hide')
    document.getElementById('view-document-reader').classList.remove('hide')

    try {
      const res = await fetch(`/api/document/${docId}`)
      if (!res.ok) return
      currentDoc = await res.json()

      // Track in Recently Viewed immediately
      addRecentlyViewed(currentDoc)

      document.getElementById('reader-doc-title').textContent = currentDoc.title
      document.getElementById('reader-product-badge').textContent = `${currentDoc.product || 'XPI'} Platform`
      document.getElementById('reader-version-badge').textContent = currentDoc.version || 'Universal'
      document.getElementById('reader-format-badge').textContent = `Format: ${currentDoc.file_type}`
      document.getElementById('reader-doc-author').textContent = currentDoc.author || 'Engineering'
      document.getElementById('reader-doc-date').textContent = `Updated: ${currentDoc.created_at}`
      document.getElementById('reader-doc-views').textContent = `${currentDoc.views || 0} Views`

      // Update Button states
      updateFavouriteButtonState(currentDoc.id)
      updateBookmarkButtonState(currentDoc.id)
      updatePinButtonState(currentDoc.is_pinned)

      // Render content
      const bodyContainer = document.getElementById('reader-doc-body')
      if (currentDoc.file_type === 'pdf') {
        bodyContainer.innerHTML = `
          <div style="margin-bottom:14px; display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:10px; background:rgba(255,255,255,0.03); padding:10px 16px; border-radius:10px; border:1px solid rgba(255,255,255,0.08);">
            <div style="display:flex; gap:8px;">
              <button id="btn-toggle-pdf-view" class="btn" style="padding:6px 14px; font-size:0.8rem; font-weight:700; background:rgba(0,141,199,0.25); border:1px solid rgba(45,188,238,0.4); color:#38bdf8; border-radius:6px;">
                📄 Original PDF Document
              </button>
              <button id="btn-toggle-text-view" class="btn" style="padding:6px 14px; font-size:0.8rem; font-weight:600; background:transparent; border:1px solid transparent; color:#94a3b8; border-radius:6px;">
                📝 Search Text View
              </button>
            </div>
            <a href="/api/document/raw/${currentDoc.id}" target="_blank" class="btn btn-secondary" style="padding:6px 12px; font-size:0.78rem; text-decoration:none; display:flex; align-items:center; gap:6px;">
              📥 Open Fullscreen / Download
            </a>
          </div>
          <div id="pdf-view-frame-container">
            <iframe src="/api/document/raw/${currentDoc.id}#toolbar=1&navpanes=1" style="width:100%; height:820px; border:none; border-radius:10px; background:#0f172a; box-shadow:0 10px 30px rgba(0,0,0,0.5);"></iframe>
          </div>
          <div id="pdf-view-text-container" class="hide" style="padding:20px; border-radius:10px; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.05); color:#cbd5e1; line-height:1.8;">
            ${currentDoc.html_content || `<pre style="white-space:pre-wrap; font-family:inherit;">${currentDoc.content}</pre>`}
          </div>
        `
        document.getElementById('btn-toggle-pdf-view').onclick = () => {
          document.getElementById('pdf-view-frame-container').classList.remove('hide')
          document.getElementById('pdf-view-text-container').classList.add('hide')
          document.getElementById('btn-toggle-pdf-view').style.background = 'rgba(0,141,199,0.25)'
          document.getElementById('btn-toggle-pdf-view').style.color = '#38bdf8'
          document.getElementById('btn-toggle-pdf-view').style.borderColor = 'rgba(45,188,238,0.4)'
          document.getElementById('btn-toggle-text-view').style.background = 'transparent'
          document.getElementById('btn-toggle-text-view').style.color = '#94a3b8'
          document.getElementById('btn-toggle-text-view').style.borderColor = 'transparent'
        }
        document.getElementById('btn-toggle-text-view').onclick = () => {
          document.getElementById('pdf-view-frame-container').classList.add('hide')
          document.getElementById('pdf-view-text-container').classList.remove('hide')
          document.getElementById('btn-toggle-text-view').style.background = 'rgba(0,141,199,0.25)'
          document.getElementById('btn-toggle-text-view').style.color = '#38bdf8'
          document.getElementById('btn-toggle-text-view').style.borderColor = 'rgba(45,188,238,0.4)'
          document.getElementById('btn-toggle-pdf-view').style.background = 'transparent'
          document.getElementById('btn-toggle-pdf-view').style.color = '#94a3b8'
          document.getElementById('btn-toggle-pdf-view').style.borderColor = 'transparent'
        }
      } else if (currentDoc.html_content) {
        bodyContainer.innerHTML = currentDoc.html_content
      } else {
        bodyContainer.innerHTML = `<pre style="white-space:pre-wrap; font-family:inherit;">${currentDoc.content}</pre>`
      }

      fetchComments(docId)
    } catch (e) {
      console.error(e)
    }
  }

  // Favourite Button in Reader
  document.getElementById('btn-doc-fav').addEventListener('click', () => {
    if (!currentDoc) return
    toggleDocFavourite(currentDoc)
  })

  // Bookmark Button in Reader
  document.getElementById('btn-doc-bookmark').addEventListener('click', () => {
    if (!currentDoc) return
    toggleDocBookmark(currentDoc)
  })

  // Pin Button in Reader
  document.getElementById('btn-doc-pin').addEventListener('click', async () => {
    if (!currentDoc) return
    try {
      const res = await fetch(`/api/document/${currentDoc.id}/pin`, { method: 'POST' })
      if (!res.ok) return
      const data = await res.json()
      currentDoc.is_pinned = data.is_pinned
      updatePinButtonState(currentDoc.is_pinned)
      fetchOverview()
    } catch (e) {}
  })

  // Like Button
  document.getElementById('btn-doc-like').addEventListener('click', async () => {
    if (!currentDoc) return
    try {
      const res = await fetch(`/api/document/${currentDoc.id}/like`, { method: 'POST' })
      if (!res.ok) return
      const data = await res.json()
      document.getElementById('btn-doc-like-label').textContent = `${data.likes} Helpful`
    } catch (e) {}
  })

  // Back to Documentation List
  document.getElementById('btn-back-to-doc-listing').addEventListener('click', () => {
    document.getElementById('view-document-reader').classList.add('hide')
    if (searchInput.value.trim()) {
      document.getElementById('view-search-results').classList.remove('hide')
    } else {
      document.getElementById('view-product-doc-listing').classList.remove('hide')
    }
  })

  // ==================== 13. COMMENTS ====================
  async function fetchComments(docId) {
    try {
      const res = await fetch(`/api/document/${docId}/comments`)
      if (!res.ok) return
      const comments = await res.json()
      const container = document.getElementById('comments-container')
      container.innerHTML = ''
      comments.forEach(c => {
        const item = document.createElement('div')
        item.style.cssText = 'padding:12px; border-radius:8px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05);'
        item.innerHTML = `
          <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:0.75rem; color:#94a3b8;">
            <span style="font-weight:700; color:#38bdf8;">${c.username}</span>
            <span>${c.created_at}</span>
          </div>
          <p style="font-size:0.88rem; color:#e2e8f0; margin:0;">${c.content}</p>
        `
        container.appendChild(item)
      })
    } catch (e) {}
  }

  document.getElementById('comment-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const input = document.getElementById('comment-input')
    const text = input.value.trim()
    if (!text || !currentDoc) return
    if (!token) {
      document.getElementById('modal-signin').classList.remove('hide')
      return
    }

    const formData = new FormData()
    formData.append('content', text)

    try {
      const res = await fetch(`/api/document/${currentDoc.id}/comments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      })
      if (!res.ok) return
      input.value = ''
      fetchComments(currentDoc.id)
      fetchNotifications()
    } catch (e) {}
  })

  // ==================== 14. MAGIC AI ASSISTANT, CHATGPT SESSIONS & SALESFORCE COPILOT ====================

  let currentChatSessionId = null
  let currentAttachments = []

  function renderMarkdownSafe(rawText) {
    if (!rawText) return ''
    if (window.marked && typeof window.marked.parse === 'function') {
      try {
        return window.marked.parse(rawText)
      } catch (e) {
        console.error('Marked parse error:', e)
      }
    }
    // Fallback basic formatter
    return rawText
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/^### (.*$)/gim, '<h3 style="font-size:1.05rem; font-weight:700; color:#fff; margin-top:14px; margin-bottom:6px;">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 style="font-size:1.15rem; font-weight:800; color:#38bdf8; margin-top:16px; margin-bottom:8px;">$1</h2>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong style="color:#fff;">$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em>$1</em>')
      .replace(/```([\s\S]*?)```/gim, '<pre style="background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); padding:12px; border-radius:8px; overflow-x:auto; color:#38bdf8; font-family:monospace; font-size:0.85rem; margin:10px 0;"><code>$1</code></pre>')
      .replace(/`([^`]+)`/gim, '<code style="background:rgba(255,255,255,0.08); padding:2px 6px; border-radius:4px; color:#38bdf8; font-family:monospace; font-size:0.85rem;">$1</code>')
      .replace(/\n/gim, '<br>')
  }

  window.copyToClipboard = function(text, btnEl) {
    navigator.clipboard.writeText(text).then(() => {
      const originalHtml = btnEl ? btnEl.innerHTML : ''
      if (btnEl) {
        btnEl.innerHTML = '✓ Copied!'
        btnEl.style.color = '#34d399'
        setTimeout(() => {
          btnEl.innerHTML = originalHtml
          btnEl.style.color = ''
        }, 2000)
      }
    }).catch(err => alert('Copied to clipboard'))
  }

  window.markResolutionVerified = async function(resolutionId, btnEl) {
    if (!resolutionId) return
    try {
      const res = await fetch('/api/ai/mark-verified', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ resolution_id: resolutionId })
      })
      if (!res.ok) throw new Error('Verification failed')
      if (btnEl) {
        btnEl.innerHTML = '✓ Verified & Learned'
        btnEl.disabled = true
        btnEl.style.background = 'rgba(16,185,129,0.3)'
      }
    } catch (e) {
      alert('Could not mark as verified: ' + e.message)
    }
  }

  window.createKbFromAI = async function(title, product, content, resolutionId, btnEl) {
    if (!content) return
    const defaultTitle = title || `Magic ${product.toUpperCase()} Resolution: ${new Date().toLocaleDateString()}`
    const articleTitle = prompt('Publish as Knowledge Base Article Title:', defaultTitle)
    if (!articleTitle) return

    try {
      if (btnEl) btnEl.innerHTML = 'Publishing...'
      const res = await fetch('/api/ai/create-kb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title: articleTitle,
          product: product || 'xpi',
          content: content,
          resolution_id: resolutionId
        })
      })
      if (!res.ok) throw new Error('Could not publish article')
      const data = await res.json()
      alert(`Success! Published KB Article: "${data.title}"`)
      if (btnEl) {
        btnEl.innerHTML = '✓ Published to KC'
        btnEl.disabled = true
      }
      fetchNotifications()
      if (data.doc_id) {
        document.getElementById('modal-copilot').classList.add('hide')
        openDocument(data.doc_id)
      }
    } catch (e) {
      alert('Error publishing KB: ' + e.message)
      if (btnEl) btnEl.innerHTML = '✨ 1-Click Publish'
    }
  }

  window.applyCopilotPrompt = function(promptText, product) {
    const input = document.getElementById('copilot-input')
    const scope = document.getElementById('copilot-product-scope')
    if (input) input.value = promptText
    if (scope && product) scope.value = product
    document.getElementById('copilot-form').dispatchEvent(new Event('submit'))
  }

  // Session Management & History
  async function loadRecentSessions() {
    const listEl = document.getElementById('copilot-sessions-list')
    if (!listEl) return
    try {
      const res = await fetch('/api/ai/sessions')
      if (!res.ok) return
      const sessions = await res.json()
      if (sessions.length === 0) {
        listEl.innerHTML = '<div style="font-size:0.75rem; color:#64748b; padding:8px;">No past sessions</div>'
        return
      }
      listEl.innerHTML = sessions.map(s => `
        <div onclick="switchChatSession('${s.id}')" style="display:flex; justify-content:space-between; align-items:center; padding:7px 10px; border-radius:6px; background:${s.id === currentChatSessionId ? 'rgba(0,141,199,0.25)' : 'rgba(255,255,255,0.03)'}; border:1px solid ${s.id === currentChatSessionId ? 'rgba(45,188,238,0.3)' : 'transparent'}; cursor:pointer; transition:all 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.08)'" onmouseout="this.style.background='${s.id === currentChatSessionId ? 'rgba(0,141,199,0.25)' : 'rgba(255,255,255,0.03)'}'">
          <div style="display:flex; align-items:center; gap:6px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">
            <span style="font-size:0.75rem; color:${s.id === currentChatSessionId ? '#38bdf8' : '#94a3b8'};">💬</span>
            <span style="font-size:0.75rem; color:#cbd5e1; overflow:hidden; text-overflow:ellipsis;">${s.title}</span>
          </div>
          <button onclick="deleteChatSession('${s.id}', event)" style="background:none; border:none; color:#64748b; padding:2px 4px; cursor:pointer;" title="Delete Chat">×</button>
        </div>
      `).join('')
    } catch (e) {}
  }

  window.createNewChatSession = async function() {
    currentChatSessionId = `session_${Date.now()}`
    currentAttachments = []
    renderAttachmentPreviews()
    const thread = document.getElementById('copilot-messages-thread')
    thread.innerHTML = `
      <div style="padding:16px; border-radius:12px; background:linear-gradient(135deg, rgba(0,141,199,0.15), rgba(45,188,238,0.08)); border:1px solid rgba(45,188,238,0.3); color:#e2e8f0; font-size:0.9rem; line-height:1.6;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
          <span style="font-size:1.1rem;">👋</span>
          <strong style="color:#fff;">New Magic AI Troubleshooting Session Started</strong>
        </div>
        Ask any configuration question, attach logs/config files with <strong>📎</strong>, or switch to <strong>Salesforce Case Analyzer</strong>.
      </div>
    `
    try {
      await fetch('/api/ai/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: currentChatSessionId, title: 'New Troubleshooting Session' })
      })
      loadRecentSessions()
    } catch (e) {}
  }

  window.switchChatSession = async function(sessionId) {
    currentChatSessionId = sessionId
    currentAttachments = []
    renderAttachmentPreviews()
    loadRecentSessions()
    const thread = document.getElementById('copilot-messages-thread')
    thread.innerHTML = '<div style="padding:10px; text-align:center; color:#94a3b8;">Loading chat history...</div>'

    try {
      const res = await fetch(`/api/ai/sessions/${sessionId}/messages`)
      if (!res.ok) throw new Error('Could not load history')
      const msgs = await res.json()
      thread.innerHTML = ''
      if (msgs.length === 0) {
        thread.innerHTML = '<div style="padding:10px; text-align:center; color:#64748b;">Empty chat session. Type a message below.</div>'
        return
      }
      for (const m of msgs) {
        if (m.role === 'user') {
          const userMsg = document.createElement('div')
          userMsg.style.cssText = 'align-self:flex-end; max-width:85%; padding:12px 18px; border-radius:14px 14px 4px 14px; background:linear-gradient(135deg,#008DC7,#2DBCEE); color:#fff; font-size:0.9rem;'
          userMsg.textContent = m.content
          thread.appendChild(userMsg)
        } else {
          const botMsg = document.createElement('div')
          botMsg.style.cssText = 'align-self:flex-start; max-width:92%; width:92%; padding:18px 20px; border-radius:14px 14px 14px 4px; background:rgba(15,23,42,0.9); border:1px solid rgba(0,141,199,0.25); color:#cbd5e1; font-size:0.9rem;'
          botMsg.innerHTML = `
            <div class="ai-response-rendered" style="color:#e2e8f0; font-size:0.92rem; line-height:1.75;">
              ${renderMarkdownSafe(m.content)}
            </div>
          `
          thread.appendChild(botMsg)
        }
      }
      thread.scrollTop = thread.scrollHeight
    } catch (e) {
      thread.innerHTML = '<div style="color:#f43f5e;">Could not load session messages.</div>'
    }
  }

  window.deleteChatSession = async function(sessionId, event) {
    if (event) event.stopPropagation()
    try {
      await fetch(`/api/ai/sessions/${sessionId}`, { method: 'DELETE' })
      if (currentChatSessionId === sessionId) {
        createNewChatSession()
      } else {
        loadRecentSessions()
      }
    } catch (e) {}
  }

  // Attachment Handling (File Picker & FileReader)
  function renderAttachmentPreviews() {
    const box = document.getElementById('copilot-attachments-preview')
    if (!box) return
    if (currentAttachments.length === 0) {
      box.classList.add('hide')
      box.innerHTML = ''
      return
    }
    box.classList.remove('hide')
    box.innerHTML = currentAttachments.map((att, idx) => `
      <div style="display:flex; align-items:center; gap:6px; padding:4px 10px; border-radius:6px; background:rgba(0,141,199,0.25); border:1px solid rgba(45,188,238,0.4); color:#38bdf8; font-size:0.75rem;">
        <span>📄 ${att.name}</span>
        <span onclick="removeAttachment(${idx})" style="cursor:pointer; font-weight:bold; margin-left:4px;">×</span>
      </div>
    `).join('')
  }

  window.removeAttachment = function(idx) {
    currentAttachments.splice(idx, 1)
    renderAttachmentPreviews()
  }

  const fileInput = document.getElementById('copilot-file-input')
  const attachBtn = document.getElementById('btn-copilot-attach')
  if (attachBtn && fileInput) {
    attachBtn.addEventListener('click', () => fileInput.click())
    fileInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files)
      for (const file of files) {
        try {
          const text = await file.text()
          currentAttachments.push({ name: file.name, content: text })
        } catch (err) {
          console.error('Error reading file:', err)
        }
      }
      renderAttachmentPreviews()
      fileInput.value = ''
    })
  }

  window.openCopilotWithQuery = function(initialQ = '', product = '') {
    const modal = document.getElementById('modal-copilot')
    modal.classList.remove('hide')
    if (window.lucide) lucide.createIcons()

    if (!currentChatSessionId) {
      createNewChatSession()
    } else {
      loadRecentSessions()
    }

    if (product) {
      const scope = document.getElementById('copilot-product-scope')
      if (scope) scope.value = product
    }

    if (initialQ) {
      document.getElementById('copilot-input').value = initialQ
      document.getElementById('copilot-form').dispatchEvent(new Event('submit'))
    }
  }

  document.getElementById('btn-new-chat').addEventListener('click', () => createNewChatSession())
  document.getElementById('btn-clear-chats').addEventListener('click', () => {
    if (confirm('Clear all chat history?')) {
      createNewChatSession()
    }
  })

  // Modal open & close
  document.getElementById('btn-open-copilot').addEventListener('click', () => openCopilotWithQuery())
  document.getElementById('btn-close-copilot').addEventListener('click', () => {
    document.getElementById('modal-copilot').classList.add('hide')
  })

  // Mode Tabs Switching
  const tabBtnChat = document.getElementById('copilot-tab-btn-chat')
  const tabBtnSF = document.getElementById('copilot-tab-btn-salesforce')
  const tabBtnSettings = document.getElementById('copilot-tab-btn-settings')

  const tabChat = document.getElementById('copilot-tab-chat')
  const tabSF = document.getElementById('copilot-tab-salesforce')
  const tabSettings = document.getElementById('copilot-tab-settings')

  function switchCopilotTab(activeTab) {
    [tabChat, tabSF, tabSettings].forEach(t => t.classList.add('hide'))
    ;[tabBtnChat, tabBtnSF, tabBtnSettings].forEach(b => {
      b.style.background = 'transparent'
      b.style.borderColor = 'transparent'
      b.style.color = '#94a3b8'
    })

    if (activeTab === 'chat') {
      tabChat.classList.remove('hide')
      tabBtnChat.style.background = 'rgba(0,141,199,0.25)'
      tabBtnChat.style.borderColor = 'rgba(45,188,238,0.4)'
      tabBtnChat.style.color = '#38bdf8'
    } else if (activeTab === 'salesforce') {
      tabSF.classList.remove('hide')
      tabBtnSF.style.background = 'rgba(0,141,199,0.25)'
      tabBtnSF.style.borderColor = 'rgba(45,188,238,0.4)'
      tabBtnSF.style.color = '#38bdf8'
    } else if (activeTab === 'settings') {
      tabSettings.classList.remove('hide')
      tabBtnSettings.style.background = 'rgba(0,141,199,0.25)'
      tabBtnSettings.style.borderColor = 'rgba(45,188,238,0.4)'
      tabBtnSettings.style.color = '#38bdf8'
      loadAISettings()
    }
    if (window.lucide) lucide.createIcons()
  }

  tabBtnChat.addEventListener('click', () => switchCopilotTab('chat'))
  tabBtnSF.addEventListener('click', () => switchCopilotTab('salesforce'))
  tabBtnSettings.addEventListener('click', () => switchCopilotTab('settings'))

  // 1. Copilot Interactive Chat Form Submission
  document.getElementById('copilot-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const input = document.getElementById('copilot-input')
    const prompt = input.value.trim()
    if (!prompt && currentAttachments.length === 0) return

    const thread = document.getElementById('copilot-messages-thread')
    const scope = document.getElementById('copilot-product-scope').value

    // Append User Message with Attachment chips if present
    const userMsg = document.createElement('div')
    userMsg.style.cssText = 'align-self:flex-end; max-width:85%; padding:12px 18px; border-radius:14px 14px 4px 14px; background:linear-gradient(135deg,#008DC7,#2DBCEE); color:#fff; font-size:0.9rem; box-shadow:0 4px 15px rgba(0,141,199,0.3);'
    
    let userHtml = prompt
    if (currentAttachments.length > 0) {
      userHtml += `<div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:4px;">${currentAttachments.map(a => `<span style="font-size:0.72rem; padding:2px 6px; border-radius:4px; background:rgba(0,0,0,0.2);">📎 ${a.name}</span>`).join('')}</div>`
    }
    userMsg.innerHTML = userHtml
    thread.appendChild(userMsg)
    input.value = ''

    const sentAttachments = [...currentAttachments]
    currentAttachments = []
    renderAttachmentPreviews()

    // Append Bot Loading State
    const botMsg = document.createElement('div')
    botMsg.style.cssText = 'align-self:flex-start; max-width:92%; width:92%; padding:18px 20px; border-radius:14px 14px 14px 4px; background:rgba(15,23,42,0.9); border:1px solid rgba(0,141,199,0.25); color:#cbd5e1; font-size:0.9rem; box-shadow:0 4px 20px rgba(0,0,0,0.4);'
    botMsg.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px; color:#38bdf8; font-size:0.85rem;">
        <span class="animate-spin" style="display:inline-block;">⚡</span>
        <span>Reasoning with Magic AI Engine & cross-referencing knowledge base...</span>
      </div>
    `
    thread.appendChild(botMsg)
    thread.scrollTop = thread.scrollHeight

    try {
      let res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          product: scope,
          session_id: currentChatSessionId,
          attachments: sentAttachments
        })
      })
      if (!res.ok) throw new Error('AI Engine response status ' + res.status)
      const data = await res.json()

      const renderedAnswer = renderMarkdownSafe(data.answer)
      const resId = data.resolution_id

      let citationsHtml = ''
      if (data.citations && data.citations.length > 0) {
        citationsHtml = `
          <div style="margin-top:16px; border-top:1px solid rgba(255,255,255,0.08); padding-top:12px;">
            <span style="font-size:0.75rem; color:#94a3b8; font-weight:700; text-transform:uppercase; letter-spacing:0.04em;">Verified Knowledge Base References:</span>
            <div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:8px;">
              ${data.citations.map(s => `
                <div onclick="openDocument(${s.id})" style="padding:6px 12px; border-radius:6px; background:rgba(0,141,199,0.18); border:1px solid rgba(45,188,238,0.3); color:#38bdf8; font-size:0.8rem; cursor:pointer; display:flex; align-items:center; gap:6px; transition:all 0.2s;" onmouseover="this.style.background='rgba(0,141,199,0.35)'" onmouseout="this.style.background='rgba(0,141,199,0.18)'">
                  <span>📖</span> <span style="font-weight:600;">${s.title}</span>
                </div>
              `).join('')}
            </div>
          </div>
        `
      }

      botMsg.innerHTML = `
        <div class="ai-response-rendered" style="color:#e2e8f0; font-size:0.92rem; line-height:1.75;">
          ${renderedAnswer}
        </div>
        ${citationsHtml}
        <div style="margin-top:16px; border-top:1px solid rgba(255,255,255,0.08); padding-top:12px; display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:8px;">
          <span style="font-size:0.72rem; color:#64748b;">Engine: <strong style="color:#38bdf8;">${data.provider || 'Magic AI'}</strong></span>
          <div style="display:flex; gap:8px;">
            <button onclick="copyToClipboard(\`${data.answer.replace(/[`\\]/g, '\\$&')}\`, this)" class="btn" style="padding:5px 10px; font-size:0.75rem; background:rgba(255,255,255,0.06); color:#cbd5e1; border-radius:6px;">
              📋 Copy
            </button>
            <button onclick="markResolutionVerified(${resId}, this)" class="btn" style="padding:5px 10px; font-size:0.75rem; background:rgba(16,185,129,0.15); border:1px solid rgba(16,185,129,0.3); color:#34d399; border-radius:6px;">
              ✅ Mark Verified
            </button>
            <button onclick="createKbFromAI(\`Magic ${scope.toUpperCase()} Resolution\`, '${scope}', \`${data.answer.replace(/[`\\]/g, '\\$&')}\`, ${resId}, this)" class="btn" style="padding:5px 12px; font-size:0.75rem; background:linear-gradient(135deg, #008DC7, #2DBCEE); color:#fff; font-weight:700; border-radius:6px;">
              ✨ Publish as KB
            </button>
          </div>
        </div>
      `
      loadRecentSessions()
    } catch (err) {
      botMsg.innerHTML = `<span style="color:#f43f5e;">⚠️ Error communicating with Magic AI Engine: ${err.message}. Please check AI Settings or run 'Test Connection'.</span>`
    }
    thread.scrollTop = thread.scrollHeight
    if (window.lucide) lucide.createIcons()
  })

  // 2. Salesforce Case Analyzer Form
  document.getElementById('form-salesforce-case-analyzer').addEventListener('submit', async (e) => {
    e.preventDefault()
    const caseNum = document.getElementById('sf-case-number').value.trim()
    const cust = document.getElementById('sf-case-customer').value.trim()
    const prod = document.getElementById('sf-case-product').value
    const history = document.getElementById('sf-case-history').value.trim()

    if (!history) {
      alert('Please paste the customer case description or error logs.')
      return
    }

    const statusEl = document.getElementById('sf-analysis-status')
    const resultBox = document.getElementById('sf-analysis-result-box')
    const contentEl = document.getElementById('sf-analysis-rendered-content')
    const caseTag = document.getElementById('sf-res-case-tag')

    statusEl.innerHTML = '<span style="color:#38bdf8;">⚡ Analyzing case history & searching Salesforce repository...</span>'
    resultBox.classList.remove('hide')
    contentEl.innerHTML = '<div style="padding:20px; text-align:center; color:#94a3b8;">Synthesizing diagnostic resolution...</div>'

    try {
      const res = await fetch('/api/ai/analyze-case', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          case_number: caseNum,
          customer_name: cust,
          product: prod,
          case_history: history
        })
      })
      if (!res.ok) throw new Error('Case analysis error')
      const data = await res.json()

      statusEl.innerHTML = '<span style="color:#10b981;">✓ Diagnostic resolution generated successfully!</span>'
      caseTag.textContent = caseNum ? `Case #${caseNum}` : ''
      contentEl.innerHTML = renderMarkdownSafe(data.answer)

      // Wire action buttons
      document.getElementById('btn-sf-copy-reply').onclick = (evt) => copyToClipboard(data.answer, evt.currentTarget)
      
      const copyEmailBtn = document.getElementById('btn-sf-copy-customer-email')
      if (copyEmailBtn) {
        copyEmailBtn.onclick = (evt) => {
          let emailText = data.answer
          const emailMatch = data.answer.match(/### 📝 5\. Ready-to-Send Customer Response Draft[\s\S]*?```(?:text)?\n([\s\S]*?)```/) ||
                             data.answer.match(/### 📝 4\. Ready-to-Send Customer Response Draft[\s\S]*?```(?:text)?\n([\s\S]*?)```/) ||
                             data.answer.match(/### 📝.*?Customer Response Draft[\s\S]*?```(?:text)?\n([\s\S]*?)```/)
          if (emailMatch && emailMatch[1]) {
            emailText = emailMatch[1].trim()
          }
          copyToClipboard(emailText, evt.currentTarget)
        }
      }

      document.getElementById('btn-sf-mark-verified').onclick = (evt) => markResolutionVerified(data.resolution_id, evt.currentTarget)
      document.getElementById('btn-sf-publish-kb').onclick = (evt) => {
        createKbFromAI(
          caseNum ? `Case ${caseNum} Solution: ${cust || prod.toUpperCase()}` : `Magic ${prod.toUpperCase()} Solution`,
          prod,
          data.answer,
          data.resolution_id,
          evt.currentTarget
        )
      }
    } catch (err) {
      statusEl.innerHTML = `<span style="color:#f43f5e;">⚠️ Error analyzing case: ${err.message}</span>`
      contentEl.innerHTML = `<span style="color:#f43f5e;">Could not generate diagnosis. Please verify input and retry.</span>`
    }
    if (window.lucide) lucide.createIcons()
  })

  // 3. AI Settings Load & Save & Live Test Connection
  async function loadAISettings() {
    try {
      const res = await fetch('/api/ai/settings')
      if (!res.ok) return
      const data = await res.json()
      const provider = data.provider || 'expert_synthesizer'
      document.getElementById('ai-setting-provider').value = provider
      
      let mName = data.model_name || ''
      if (provider === 'groq' && (!mName || mName.toLowerCase().includes('built-in'))) {
        mName = 'llama-3.3-70b-versatile'
      } else if (provider === 'openrouter' && (!mName || mName.toLowerCase().includes('built-in'))) {
        mName = 'meta-llama/llama-3.2-3b-instruct:free'
      } else if (provider === 'gemini' && (!mName || mName.toLowerCase().includes('built-in'))) {
        mName = 'gemini-1.5-flash'
      } else if (provider === 'openai' && (!mName || mName.toLowerCase().includes('built-in'))) {
        mName = 'gpt-4o'
      } else if (provider === 'ollama' && (!mName || mName.toLowerCase().includes('built-in'))) {
        mName = 'llama3'
      } else if (!mName) {
        mName = 'Built-in Deep-Reasoning Diagnostic Engine'
      }
      document.getElementById('ai-setting-model').value = mName
      document.getElementById('ai-setting-baseurl').value = data.api_base_url || ''
      const keyInput = document.getElementById('ai-setting-apikey')
      if (data.masked_api_key) {
        keyInput.placeholder = `Active (${data.masked_api_key}) - leave blank to keep`
        keyInput.value = ''
        document.getElementById('ai-setting-key-status').textContent = `Current Key Active: ${data.masked_api_key}`
      } else if (provider === 'expert_synthesizer' || provider === 'ollama') {
        document.getElementById('ai-setting-key-status').textContent = `✓ No external key required for ${provider === 'ollama' ? 'Local Ollama' : 'Built-in Engine'}`
      } else {
        document.getElementById('ai-setting-key-status').textContent = `No API key configured`
      }
      const sidebarName = document.getElementById('sidebar-engine-name')
      if (sidebarName) {
        if (data.provider === 'groq') sidebarName.textContent = 'Groq LLaMA 3.3'
        else if (data.provider === 'openrouter') sidebarName.textContent = 'OpenRouter Free'
        else if (data.provider === 'gemini') sidebarName.textContent = 'Gemini 1.5'
        else if (data.provider === 'openai') sidebarName.textContent = 'OpenAI GPT-4o'
        else if (data.provider === 'ollama') sidebarName.textContent = 'Local Ollama'
        else sidebarName.textContent = 'Deep Reasoning'
      }
    } catch (e) {}
  }

  const providerDropdown = document.getElementById('ai-setting-provider')
  if (providerDropdown) {
    providerDropdown.addEventListener('change', () => {
      const p = providerDropdown.value
      const modelInput = document.getElementById('ai-setting-model')
      const baseUrlInput = document.getElementById('ai-setting-baseurl')
      const keyInput = document.getElementById('ai-setting-apikey')
      const keyStatus = document.getElementById('ai-setting-key-status')

      if (p === 'groq') {
        modelInput.value = 'llama-3.3-70b-versatile'
        baseUrlInput.value = 'https://api.groq.com/openai/v1'
        keyInput.placeholder = 'Paste Groq Free API Key (gsk_...)'
        keyStatus.textContent = 'Get free key at console.groq.com (No credit card needed)'
      } else if (p === 'openrouter') {
        modelInput.value = 'meta-llama/llama-3.2-3b-instruct:free'
        baseUrlInput.value = 'https://openrouter.ai/api/v1'
        keyInput.placeholder = 'Paste OpenRouter Key (sk-or-v1-...)'
        keyStatus.textContent = 'Get free key at openrouter.ai'
      } else if (p === 'ollama') {
        modelInput.value = 'llama3'
        baseUrlInput.value = 'http://localhost:11434'
        keyInput.placeholder = 'No API key needed for local Ollama'
        keyStatus.textContent = '✓ Runs 100% locally on your computer with zero keys'
      } else if (p === 'gemini') {
        modelInput.value = 'gemini-1.5-flash'
        baseUrlInput.value = ''
        keyInput.placeholder = 'Enter Google Gemini API Key'
        keyStatus.textContent = 'Google Gemini AI Studio'
      } else if (p === 'openai') {
        modelInput.value = 'gpt-4o'
        baseUrlInput.value = ''
        keyInput.placeholder = 'Enter OpenAI API Key (sk-...)'
        keyStatus.textContent = 'OpenAI Platform'
      } else if (p === 'expert_synthesizer') {
        modelInput.value = 'Built-in Deep-Reasoning Diagnostic Engine'
        baseUrlInput.value = ''
        keyInput.placeholder = 'No key needed (100% Offline & Free)'
        keyStatus.textContent = '✓ Zero configuration required (Active, offline & ready)'
      }
    })
  }

  document.getElementById('form-ai-settings').addEventListener('submit', async (e) => {
    e.preventDefault()
    const provider = document.getElementById('ai-setting-provider').value
    const apiKey = document.getElementById('ai-setting-apikey').value.trim()
    const model = document.getElementById('ai-setting-model').value.trim()
    const baseUrl = document.getElementById('ai-setting-baseurl').value.trim()
    const msgEl = document.getElementById('ai-settings-save-msg')

    try {
      const res = await fetch('/api/ai/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          api_key: apiKey,
          model_name: model,
          api_base_url: baseUrl
        })
      })
      if (!res.ok) throw new Error('Failed to update AI settings')
      msgEl.textContent = '✓ Saved successfully!'
      setTimeout(() => { msgEl.textContent = '' }, 3000)
      loadAISettings()
    } catch (err) {
      alert('Error saving settings: ' + err.message)
    }
  })

  const testBtn = document.getElementById('btn-test-ai-connection')
  if (testBtn) {
    testBtn.addEventListener('click', async () => {
      const resultBox = document.getElementById('ai-connection-test-result')
      resultBox.classList.remove('hide')
      resultBox.innerHTML = '<span style="color:#38bdf8;">⚡ Testing live connection...</span>'
      
      const provider = document.getElementById('ai-setting-provider').value
      const apiKey = document.getElementById('ai-setting-apikey').value.trim()
      const model = document.getElementById('ai-setting-model').value.trim()
      const baseUrl = document.getElementById('ai-setting-baseurl').value.trim()

      try {
        const res = await fetch('/api/ai/test-connection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, api_key: apiKey, model_name: model, api_base_url: baseUrl })
        })
        const rawText = await res.text()
        let data
        try {
          data = JSON.parse(rawText)
        } catch (e) {
          resultBox.innerHTML = `<div style="color:#f43f5e; padding:6px 0;">⚠️ Server Response (${res.status}): ${rawText.substring(0, 180)}</div>`
          return
        }
        if (data.success) {
          resultBox.innerHTML = `<div style="color:#10b981; font-weight:700; padding:6px 0;">✓ ${data.message}</div>`
        } else {
          resultBox.innerHTML = `<div style="color:#f43f5e; font-weight:600; padding:6px 0;">⚠️ ${data.message}</div>`
        }
      } catch (err) {
        resultBox.innerHTML = `<div style="color:#f43f5e; padding:6px 0;">⚠️ Connection Error: ${err.message}</div>`
      }
    })
  }

  // ==================== 15. IN-APP KB AUTHORING & TEMPLATES ====================
  window.insertDocTemplate = function(type) {
    const titleInput = document.getElementById('kb-input-title')
    const contentInput = document.getElementById('kb-input-content')
    const prodSelect = document.getElementById('kb-input-product')

    if (type === 'connector') {
      titleInput.value = 'How to Configure [Target] Connector with OAuth2'
      prodSelect.value = 'xpi'
      contentInput.value = `## Overview
This Standard Operating Procedure details step-by-step setup for connecting Magic xpi to [Target System].

### Prerequisites
- Magic xpi Studio 4.14+
- Valid API credentials (Client ID, Client Secret, Refresh Token)

### Step 1: Connector Topology Setup
1. In Magic xpi Studio, open the **Resource Repository**.
2. Add a new **REST / OData Resource**.
3. Set Base URL: \`https://api.example.com/v2\`

### Step 2: Data Mapper Configuration
- Map incoming JSON schema to Magic xpi Flow Variables.
- Ensure error handling sub-flows are attached.

### Verification & Testing
Trigger flow execution in Debugger and inspect Server Monitor logs.`
    } else if (type === 'troubleshooting') {
      titleInput.value = 'Troubleshooting: Error [Code] in Magic Runtime'
      prodSelect.value = 'xpa'
      contentInput.value = `## Problem Statement
When running Magic xpa / xpi runtime, the engine halts with Error Code \`[-105]\` or \`[Database Error]\`.

### Root Cause
Typically caused by mismatched JVM_ARGS heap allocation or locked database records in Magic.ini.

### Resolution Steps
1. Navigate to configuration directory.
2. Locate \`Magic.ini\` and verify:
   \`\`\`ini
   JVM_ARGS=-Xms512m -Xmx2048m -Dmagic.home=...
   \`\`\`
3. Restart GigaSpaces Grid Management Agent (GSA).
4. Verify port \`8005\` is free.`
    } else if (type === 'cloud_sop') {
      titleInput.value = 'SOP: AOC Modernization & Docker Container Deployment'
      prodSelect.value = 'cloud_native'
      contentInput.value = `## Cloud Native Deployment Guide
Standard SOP for containerizing and deploying workloads to Kubernetes cluster.

### Dockerfile Setup
\`\`\`dockerfile
FROM alpine:3.19
RUN apk add --no-cache openjdk17
COPY . /app
WORKDIR /app
CMD ["./start-server.sh"]
\`\`\`

### Deployment Verification
Run \`kubectl get pods -n magic-cloud\` and check health probes.`
    }
  }

  document.getElementById('btn-write-kb').addEventListener('click', () => {
    document.getElementById('modal-write-kb').classList.remove('hide')
  })
  document.getElementById('btn-close-write-kb').addEventListener('click', () => {
    document.getElementById('modal-write-kb').classList.add('hide')
  })

  document.getElementById('form-write-kb').addEventListener('submit', async (e) => {
    e.preventDefault()
    const title = document.getElementById('kb-input-title').value.trim()
    const product = document.getElementById('kb-input-product').value
    const version = document.getElementById('kb-input-version').value.trim()
    const content = document.getElementById('kb-input-content').value.trim()

    const formData = new FormData()
    formData.append('title', title)
    formData.append('product', product)
    formData.append('version', version)
    formData.append('content', content)

    try {
      const res = await fetch('/api/kb/create', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      })
      if (!res.ok) throw new Error('Failed to publish article')
      const doc = await res.json()
      document.getElementById('modal-write-kb').classList.add('hide')
      fetchOverview()
      fetchNotifications()
      switchProductScope(product)
      openDocument(doc.id)
    } catch (err) {
      alert(err.message)
    }
  })

  // ==================== 16. UPLOAD PORTAL ====================
  document.getElementById('btn-tab-upload').addEventListener('click', () => {
    document.getElementById('page-home-landing').classList.add('hide')
    document.getElementById('page-product-workspace').classList.add('hide')
    document.getElementById('page-admin-suite').classList.add('hide')
    document.getElementById('page-upload-portal').classList.remove('hide')
  })

  document.getElementById('btn-upload-back-home').addEventListener('click', () => {
    switchProductScope('all')
  })

  document.getElementById('file-upload-input').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files)
    if (files.length === 0) return

    const feedback = document.getElementById('upload-status-feedback')
    const targetProduct = document.getElementById('upload-target-product').value

    feedback.innerHTML = `<div style="padding:14px; border-radius:8px; background:rgba(0,141,199,0.15); color:#38bdf8;">Processing & indexing ${files.length} file(s) into ${targetProduct.toUpperCase()} (uploads/${targetProduct}/)...</div>`

    const formData = new FormData()
    formData.append('product', targetProduct)
    files.forEach(f => formData.append('files', f))

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      })
      if (!res.ok) throw new Error('Upload failed')
      const data = await res.json()
      feedback.innerHTML = `<div style="padding:14px; border-radius:8px; background:rgba(16,185,129,0.15); color:#34d399; font-weight:600;">✓ ${data.message}</div>`
      fetchOverview()
      fetchNotifications()
      if (activeProduct === targetProduct) fetchFeaturedProductDocs()
    } catch (err) {
      feedback.innerHTML = `<div style="padding:14px; border-radius:8px; background:rgba(244,63,94,0.15); color:#f43f5e;">✗ ${err.message}</div>`
    }
  })

  // ==================== 17. ENTERPRISE ADMIN SUITE ====================
  document.getElementById('btn-tab-admin').addEventListener('click', () => {
    openAdminSuite()
  })

  document.getElementById('btn-admin-exit').addEventListener('click', () => {
    switchProductScope('all')
  })

  function openAdminSuite() {
    document.getElementById('page-home-landing').classList.add('hide')
    document.getElementById('page-product-workspace').classList.add('hide')
    document.getElementById('page-upload-portal').classList.add('hide')
    document.getElementById('page-admin-suite').classList.remove('hide')

    switchAdminTab('contributions')
  }

  // Admin Sub-tabs Switching
  const adminTabs = [
    { btnId: 'admin-tab-users', panelId: 'admin-panel-users', name: 'users' },
    { btnId: 'admin-tab-docs', panelId: 'admin-panel-docs', name: 'docs' },
    { btnId: 'admin-tab-reindex', panelId: 'admin-panel-reindex', name: 'reindex' },
    { btnId: 'admin-tab-analytics', panelId: 'admin-panel-analytics', name: 'analytics' },
    { btnId: 'admin-tab-contributions', panelId: 'admin-panel-contributions', name: 'contributions' }
  ]

  function switchAdminTab(tabName) {
    adminTabs.forEach(t => {
      const btn = document.getElementById(t.btnId)
      const panel = document.getElementById(t.panelId)
      if (t.name === tabName) {
        btn.classList.remove('btn-secondary')
        btn.classList.add('btn-primary')
        panel.classList.remove('hide')
      } else {
        btn.classList.remove('btn-primary')
        btn.classList.add('btn-secondary')
        panel.classList.add('hide')
      }
    })

    if (tabName === 'users') fetchAdminUsers()
    if (tabName === 'docs') fetchAdminDocuments()
    if (tabName === 'reindex') fetchAdminLogs()
    if (tabName === 'analytics') fetchAdminAnalytics()
    if (tabName === 'contributions') fetchAdminContributions()
  }

  adminTabs.forEach(t => {
    document.getElementById(t.btnId).addEventListener('click', () => switchAdminTab(t.name))
  })

  // --- Admin Tab 1: Users & RBAC ---
  async function fetchAdminUsers() {
    const tbody = document.getElementById('admin-users-table-body')
    if (!tbody) return
    tbody.innerHTML = '<tr><td colspan="5" style="padding:20px; text-align:center; color:#94a3b8;">Loading user directory...</td></tr>'

    try {
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to load users')
      const users = await res.json()

      tbody.innerHTML = ''
      if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="padding:20px; text-align:center; color:#94a3b8;">No users found in directory.</td></tr>'
        return
      }

      users.forEach(u => {
        const isActive = u.is_active !== false
        const roleColor = u.role === 'Admin' ? '#f43f5e' : (u.role === 'Editor' ? '#34d399' : '#94a3b8')
        const roleLabel = u.role === 'Admin' ? 'Super Admin' : (u.role === 'Editor' ? 'Contributor / Author' : 'Reader')
        const spaceLabel = u.product_space === 'all' ? '🌐 All Products' : (u.product_space === 'xpa' ? '⚡ Magic xpa' : (u.product_space === 'xpi' ? '🔗 Magic xpi' : '☁️ Cloud Native'))

        const tr = document.createElement('tr')
        tr.style.cssText = `border-bottom:1px solid rgba(255,255,255,0.06); opacity:${isActive ? 1 : 0.65};`
        tr.innerHTML = `
          <td style="padding:12px 16px; font-weight:700; color:#fff;">
            <div style="display:flex; align-items:center; gap:8px;">
              <i data-lucide="mail" style="width:15px; height:15px; color:#008DC7;"></i>
              <span>${u.username}</span>
            </div>
          </td>
          <td style="padding:12px 16px;">
            <span style="font-size:0.75rem; padding:3px 8px; border-radius:6px; background:${isActive ? 'rgba(16,185,129,0.15)' : 'rgba(148,163,184,0.15)'}; color:${isActive ? '#34d399' : '#94a3b8'};">
              ${isActive ? '🟢 Active' : '⚪ Inactive'}
            </span>
          </td>
          <td style="padding:12px 16px;">
            <span style="font-size:0.75rem; padding:3px 10px; border-radius:12px; font-weight:700; background:rgba(255,255,255,0.05); color:${roleColor}; border:1px solid ${roleColor}40;">
              ${roleLabel}
            </span>
          </td>
          <td style="padding:12px 16px; color:#cbd5e1; font-size:0.82rem;">
            ${spaceLabel}
          </td>
          <td style="padding:12px 16px; text-align:right;">
            <div style="display:flex; justify-content:flex-end; gap:8px;">
              <button class="btn btn-secondary" style="padding:4px 8px; font-size:0.75rem;" onclick="openEditUserModal(${u.id}, '${u.username}', '${u.role}', '${u.product_space || 'all'}', ${isActive})">
                <i data-lucide="edit" style="width:13px; height:13px;"></i> Edit
              </button>
              ${u.username !== 'admin' ? `
                <button class="btn btn-secondary" style="padding:4px 8px; font-size:0.75rem; color:${isActive ? '#f59e0b' : '#34d399'};" onclick="toggleUserStatus(${u.id}, '${u.username}', ${isActive})">
                  ${isActive ? '⛔ Suspend' : '✅ Activate'}
                </button>
                <button class="btn btn-secondary" style="padding:4px 8px; font-size:0.75rem; color:#f43f5e;" onclick="deleteUserAccount(${u.id}, '${u.username}')">
                  <i data-lucide="trash-2" style="width:13px; height:13px;"></i> Delete
                </button>
              ` : ''}
            </div>
          </td>
        `
        tbody.appendChild(tr)
      })
      if (window.lucide) lucide.createIcons()
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="5" style="padding:20px; text-align:center; color:#f43f5e;">${e.message}</td></tr>`
    }
  }

  window.toggleUserStatus = async function(userId, uname, currentActive) {
    const confirmMsg = currentActive 
      ? `Suspend / Deactivate user "${uname}"? They will NOT be able to log in, but all their uploaded KBs and knowledge contributions will remain preserved and labeled as Alumni.`
      : `Reactivate user account for "${uname}"?`
    if (!confirm(confirmMsg)) return

    const formData = new FormData()
    formData.append('is_active', currentActive ? 'false' : 'true')
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      })
      if (!res.ok) throw new Error('Status update failed')
      fetchAdminUsers()
      if (typeof fetchAdminContributions === 'function') fetchAdminContributions()
    } catch (err) {
      alert(err.message)
    }
  }

  // Add User Global Handlers
  window.openAddUserModal = function() {
    const modal = document.getElementById('modal-admin-add-user')
    if (modal) {
      modal.classList.remove('hide')
      const errBox = document.getElementById('admin-add-user-error')
      if (errBox) errBox.classList.add('hide')
      const nameInput = document.getElementById('admin-new-user-name')
      if (nameInput) {
        nameInput.value = ''
        setTimeout(() => nameInput.focus(), 50)
      }
      const passInput = document.getElementById('admin-new-user-pass')
      if (passInput) passInput.value = ''
    }
  }

  window.closeAddUserModal = function() {
    const modal = document.getElementById('modal-admin-add-user')
    if (modal) modal.classList.add('hide')
  }

  const btnAdminAddUser = document.getElementById('btn-admin-add-user')
  if (btnAdminAddUser) {
    btnAdminAddUser.addEventListener('click', window.openAddUserModal)
  }

  const btnCloseAdminAddUser = document.getElementById('btn-close-admin-add-user')
  if (btnCloseAdminAddUser) {
    btnCloseAdminAddUser.addEventListener('click', window.closeAddUserModal)
  }

  const formAdminAddUser = document.getElementById('form-admin-add-user')
  if (formAdminAddUser) {
    formAdminAddUser.addEventListener('submit', async (e) => {
      e.preventDefault()
      const name = document.getElementById('admin-new-user-name').value.trim()
      const pass = document.getElementById('admin-new-user-pass').value.trim()
      const roleVal = document.getElementById('admin-new-user-role').value
      const spaceVal = document.getElementById('admin-new-user-space').value
      const statusVal = document.getElementById('admin-new-user-status').value
      const errBox = document.getElementById('admin-add-user-error')
      const submitBtn = document.getElementById('btn-submit-admin-add-user') || formAdminAddUser.querySelector('button[type="submit"]')

      if (errBox) errBox.classList.add('hide')
      const origBtnText = submitBtn ? submitBtn.innerHTML : 'Create User Account'
      if (submitBtn) {
        submitBtn.disabled = true
        submitBtn.textContent = 'Creating User...'
      }

      const formData = new FormData()
      formData.append('username', name)
      formData.append('password', pass)
      formData.append('role', roleVal)
      formData.append('product_space', spaceVal)
      formData.append('is_active', statusVal)

      const activeToken = localStorage.getItem('token') || token

      try {
        const res = await fetch('/api/admin/users', {
          method: 'POST',
          headers: activeToken ? { Authorization: `Bearer ${activeToken}` } : {},
          body: formData
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.detail || 'Failed to create user')
        }
        window.closeAddUserModal()
        formAdminAddUser.reset()
        fetchAdminUsers()
        if (typeof fetchAdminContributions === 'function') fetchAdminContributions()
      } catch (err) {
        if (errBox) {
          errBox.textContent = err.message
          errBox.classList.remove('hide')
        } else {
          alert(err.message)
        }
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false
          submitBtn.innerHTML = origBtnText
        }
      }
    })
  }

  // Edit User Global Handlers
  window.openEditUserModal = function(id, name, userRole, space, isActive) {
    const editId = document.getElementById('admin-edit-user-id')
    const editName = document.getElementById('admin-edit-user-name')
    const editRole = document.getElementById('admin-edit-user-role')
    const editSpace = document.getElementById('admin-edit-user-space')
    const editStatus = document.getElementById('admin-edit-user-status')
    const editPass = document.getElementById('admin-edit-user-pass')
    const modal = document.getElementById('modal-admin-edit-user')

    if (editId) editId.value = id
    if (editName) editName.value = name
    if (editRole) editRole.value = userRole
    if (editSpace) editSpace.value = space || 'all'
    if (editStatus) editStatus.value = (isActive !== false) ? 'true' : 'false'
    if (editPass) editPass.value = ''
    if (modal) modal.classList.remove('hide')
  }

  window.closeEditUserModal = function() {
    const modal = document.getElementById('modal-admin-edit-user')
    if (modal) modal.classList.add('hide')
  }

  const btnCloseAdminEditUser = document.getElementById('btn-close-admin-edit-user')
  if (btnCloseAdminEditUser) {
    btnCloseAdminEditUser.addEventListener('click', window.closeEditUserModal)
  }

  const formAdminEditUser = document.getElementById('form-admin-edit-user')
  if (formAdminEditUser) {
    formAdminEditUser.addEventListener('submit', async (e) => {
      e.preventDefault()
      const id = document.getElementById('admin-edit-user-id').value
      const roleVal = document.getElementById('admin-edit-user-role').value
      const spaceVal = document.getElementById('admin-edit-user-space').value
      const statusVal = document.getElementById('admin-edit-user-status').value
      const passVal = document.getElementById('admin-edit-user-pass').value.trim()

      const formData = new FormData()
      formData.append('role', roleVal)
      formData.append('product_space', spaceVal)
      formData.append('is_active', statusVal)
      if (passVal) formData.append('password', passVal)

      try {
        const res = await fetch(`/api/admin/users/${id}`, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        })
        if (!res.ok) throw new Error('Failed to update user')
        window.closeEditUserModal()
        fetchAdminUsers()
        if (typeof fetchAdminContributions === 'function') fetchAdminContributions()
      } catch (err) {
        alert(err.message)
      }
    })
  }

  window.deleteUserAccount = async function(id, name) {
    if (!confirm(`Are you sure you want to delete user account '${name}'?`)) return
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to delete user')
      fetchAdminUsers()
      if (typeof fetchAdminContributions === 'function') fetchAdminContributions()
    } catch (err) {
      alert(err.message)
    }
  }

  // --- Admin Tab 2: Master Document Management ---
  async function fetchAdminDocuments() {
    const tbody = document.getElementById('admin-docs-table-body')
    tbody.innerHTML = '<tr><td colspan="6" style="padding:20px; text-align:center; color:#94a3b8;">Loading master document catalog...</td></tr>'

    try {
      const res = await fetch('/api/admin/files', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to load documents')
      adminDocsCache = await res.json()
      renderAdminDocsTable()
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" style="padding:20px; text-align:center; color:#f43f5e;">${e.message}</td></tr>`
    }
  }

  function renderAdminDocsTable() {
    const tbody = document.getElementById('admin-docs-table-body')
    const filterQ = document.getElementById('admin-doc-filter-query').value.toLowerCase().trim()
    const filterProd = document.getElementById('admin-doc-filter-prod').value

    let filtered = adminDocsCache
    if (filterProd) filtered = filtered.filter(d => d.product === filterProd)
    if (filterQ) filtered = filtered.filter(d => d.title.toLowerCase().includes(filterQ))

    tbody.innerHTML = ''
    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="padding:20px; text-align:center; color:#94a3b8;">No documents match your filter.</td></tr>'
      return
    }

    filtered.slice(0, 100).forEach(doc => {
      const prodColor = doc.product === 'xpa' ? '#f59e0b' : (doc.product === 'xpi' ? '#06b6d4' : '#10b981')
      const tr = document.createElement('tr')
      tr.style.cssText = 'border-bottom:1px solid rgba(255,255,255,0.06);'
      tr.innerHTML = `
        <td style="padding:10px 14px; color:#fff; font-weight:600; max-width:320px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          <a onclick="openDocument(${doc.id})" style="color:#e2e8f0; cursor:pointer; text-decoration:none;" onmouseover="this.style.color='#38bdf8'" onmouseout="this.style.color='#e2e8f0'">${doc.title}</a>
        </td>
        <td style="padding:10px 14px;">
          <span style="font-size:0.72rem; padding:2px 8px; border-radius:6px; font-weight:700; background:rgba(255,255,255,0.05); color:${prodColor}; text-transform:uppercase;">
            ${doc.product}
          </span>
        </td>
        <td style="padding:10px 14px; color:#94a3b8; font-size:0.75rem; text-transform:uppercase;">${doc.file_type}</td>
        <td style="padding:10px 14px; color:#cbd5e1; font-size:0.78rem;">${doc.version || 'Universal'}</td>
        <td style="padding:10px 14px; color:#94a3b8; font-size:0.78rem;">${doc.views || 0}</td>
        <td style="padding:10px 14px; text-align:right;">
          <div style="display:flex; justify-content:flex-end; gap:6px;">
            <button class="btn btn-secondary" style="padding:3px 7px; font-size:0.72rem;" onclick="openEditDocModal(${doc.id}, '${doc.title.replace(/'/g, "\\'")}', '${doc.product || 'xpi'}', '${doc.version || 'Universal'}')">
              <i data-lucide="edit-3" style="width:12px; height:12px;"></i> Space/Meta
            </button>
            <button class="btn btn-secondary" style="padding:3px 7px; font-size:0.72rem; color:#f43f5e;" onclick="deleteDocItem(${doc.id}, '${doc.title.replace(/'/g, "\\'")}')">
              <i data-lucide="trash-2" style="width:12px; height:12px;"></i>
            </button>
          </div>
        </td>
      `
      tbody.appendChild(tr)
    })
    if (window.lucide) lucide.createIcons()
  }

  document.getElementById('admin-doc-filter-query').addEventListener('input', renderAdminDocsTable)
  document.getElementById('admin-doc-filter-prod').addEventListener('change', renderAdminDocsTable)

  // Edit Doc Modal
  window.openEditDocModal = function(id, title, product, version) {
    document.getElementById('admin-edit-doc-id').value = id
    document.getElementById('admin-edit-doc-title').value = title
    document.getElementById('admin-edit-doc-product').value = product
    document.getElementById('admin-edit-doc-version').value = version
    document.getElementById('modal-admin-edit-doc').classList.remove('hide')
  }

  document.getElementById('btn-close-admin-edit-doc').addEventListener('click', () => {
    document.getElementById('modal-admin-edit-doc').classList.add('hide')
  })

  document.getElementById('form-admin-edit-doc').addEventListener('submit', async (e) => {
    e.preventDefault()
    const id = document.getElementById('admin-edit-doc-id').value
    const product = document.getElementById('admin-edit-doc-product').value
    const version = document.getElementById('admin-edit-doc-version').value.trim()

    const formData = new FormData()
    formData.append('product', product)
    formData.append('version', version)

    try {
      const res = await fetch(`/api/admin/document/${id}/product`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      })
      if (!res.ok) throw new Error('Failed to update document')
      document.getElementById('modal-admin-edit-doc').classList.add('hide')
      fetchAdminDocuments()
      fetchOverview()
    } catch (err) {
      alert(err.message)
    }
  })

  window.deleteDocItem = async function(id, title) {
    if (!confirm(`Are you sure you want to delete document '${title}'?`)) return
    try {
      const res = await fetch(`/api/admin/document/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to delete document')
      fetchAdminDocuments()
      fetchOverview()
    } catch (err) {
      alert(err.message)
    }
  }

  // --- Admin Tab 3: Reindexer & Logs ---
  document.getElementById('btn-admin-trigger-reindex').addEventListener('click', async () => {
    const statusEl = document.getElementById('admin-reindex-status')
    statusEl.textContent = 'Scanning server product directories (uploads/xpa, xpi, cloud_native) and Confluence (<50ms)...'
    statusEl.style.color = '#008DC7'

    try {
      const res = await fetch('/api/admin/reindex', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Reindexing failed')
      const data = await res.json()
      statusEl.textContent = `✓ ${data.message}: Successfully indexed ${data.count} total documents!`
      statusEl.style.color = '#34d399'
      fetchOverview()
      fetchAdminLogs()
    } catch (err) {
      statusEl.textContent = `✗ ${err.message}`
      statusEl.style.color = '#f43f5e'
    }
  })

  async function fetchAdminLogs() {
    const container = document.getElementById('admin-ingestion-logs-container')
    container.innerHTML = '<div style="color:#94a3b8;">Loading logs...</div>'

    try {
      const res = await fetch('/api/admin/logs', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) return
      const logs = await res.json()

      container.innerHTML = ''
      if (logs.length === 0) {
        container.innerHTML = '<div style="font-size:0.82rem; color:#64748b;">No recent ingestion logs recorded.</div>'
        return
      }

      logs.forEach(l => {
        const item = document.createElement('div')
        item.style.cssText = 'padding:10px 14px; border-radius:8px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;'
        item.innerHTML = `
          <div>
            <div style="font-size:0.82rem; font-weight:700; color:#fff;">${l.message}</div>
            <div style="font-size:0.75rem; color:#94a3b8;">Indexed: ${l.indexed_count} files • Status: <span style="color:#34d399;">${l.status}</span></div>
          </div>
          <span style="font-size:0.75rem; color:#64748b;">${l.timestamp}</span>
        `
        container.appendChild(item)
      })
    } catch (e) {}
  }

  // --- Admin Tab 4: Search Analytics & Knowledge Gaps ---
  async function fetchAdminAnalytics() {
    const grid = document.getElementById('admin-analytics-metrics-grid')
    const zeroGrid = document.getElementById('admin-zero-queries-grid')
    grid.innerHTML = '<div style="color:#94a3b8;">Loading telemetry...</div>'

    try {
      const res = await fetch('/api/admin/analytics', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) return
      const data = await res.json()

      grid.innerHTML = `
        <div class="glass-panel" style="padding:16px; border-left:4px solid #f59e0b;">
          <div style="font-size:0.75rem; color:#94a3b8;">Magic xpa Docs</div>
          <div style="font-size:1.6rem; font-weight:800; color:#f59e0b;">${data.by_product?.xpa || 0}</div>
        </div>
        <div class="glass-panel" style="padding:16px; border-left:4px solid #06b6d4;">
          <div style="font-size:0.75rem; color:#94a3b8;">Magic xpi Docs</div>
          <div style="font-size:1.6rem; font-weight:800; color:#06b6d4;">${data.by_product?.xpi || 0}</div>
        </div>
        <div class="glass-panel" style="padding:16px; border-left:4px solid #10b981;">
          <div style="font-size:0.75rem; color:#94a3b8;">Cloud Native Docs</div>
          <div style="font-size:1.6rem; font-weight:800; color:#10b981;">${data.by_product?.cloud_native || 0}</div>
        </div>
        <div class="glass-panel" style="padding:16px; border-left:4px solid #008DC7;">
          <div style="font-size:0.75rem; color:#94a3b8;">Total Search Queries</div>
          <div style="font-size:1.6rem; font-weight:800; color:#008DC7;">${data.total_searches || 0}</div>
        </div>
      `

      zeroGrid.innerHTML = ''
      if (!data.zero_result_queries || data.zero_result_queries.length === 0) {
        zeroGrid.innerHTML = '<span style="font-size:0.8rem; color:#64748b;">No documentation gaps detected yet.</span>'
      } else {
        data.zero_result_queries.forEach(z => {
          const item = document.createElement('div')
          item.style.cssText = 'padding:10px 14px; border-radius:8px; background:rgba(244,63,94,0.1); border:1px solid rgba(244,63,94,0.2); display:flex; justify-content:space-between; align-items:center;'
          item.innerHTML = `
            <div>
              <div style="font-size:0.85rem; color:#fca5a5; font-weight:600;">"${z.query}"</div>
              <div style="font-size:0.72rem; color:#f43f5e;">${z.count} failed searches</div>
            </div>
            <button class="btn btn-secondary" style="font-size:0.72rem; padding:4px 8px; color:#34d399;" onclick="createKbForGap('${z.query.replace(/'/g, "\\'")}')">
              <i data-lucide="plus" style="width:12px; height:12px;"></i> Create KB
            </button>
          `
          zeroGrid.appendChild(item)
        })
      }
      if (window.lucide) lucide.createIcons()
    } catch (e) {}
  }

  window.createKbForGap = function(gapQuery) {
    document.getElementById('kb-input-title').value = `How to resolve: ${gapQuery}`
    document.getElementById('modal-write-kb').classList.remove('hide')
  }

  // --- Admin Tab 5: User Contributions & Uploads Analytics ---
  async function fetchAdminContributions() {
    const userSel = document.getElementById('contrib-filter-user')
    const yearSel = document.getElementById('contrib-filter-year')
    const monthSel = document.getElementById('contrib-filter-month')
    const prodSel = document.getElementById('contrib-filter-product')
    const statusSel = document.getElementById('contrib-filter-status')
    const startInp = document.getElementById('contrib-filter-start')
    const endInp = document.getElementById('contrib-filter-end')

    const params = new URLSearchParams()
    if (userSel && userSel.value !== 'all') params.append('username', userSel.value)
    
    // Default to 2026 active platform period if not specified
    const selectedYear = yearSel ? yearSel.value : '2026'
    if (selectedYear && selectedYear !== 'all') params.append('year', selectedYear)
    
    if (monthSel && monthSel.value !== 'all') params.append('month', monthSel.value)
    if (prodSel && prodSel.value !== 'all') params.append('product', prodSel.value)
    if (statusSel && statusSel.value !== 'all') params.append('contributor_status', statusSel.value)
    if (startInp && startInp.value) params.append('start_date', startInp.value)
    if (endInp && endInp.value) params.append('end_date', endInp.value)

    try {
      const res = await fetch(`/api/admin/contributions?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) return
      const data = await res.json()
      contribDataCache = data

      // 1. Populate Dropdowns if first load or needs update
      if (data.available_filters) {
        if (userSel && userSel.options.length <= 1 && data.available_filters.users) {
          data.available_filters.users.forEach(u => {
            const opt = document.createElement('option')
            opt.value = u
            opt.textContent = u
            userSel.appendChild(opt)
          })
        }
        if (yearSel && yearSel.options.length <= 2 && data.available_filters.years) {
          data.available_filters.years.forEach(y => {
            if (y !== '2026') {
              const opt = document.createElement('option')
              opt.value = y
              opt.textContent = y
              yearSel.appendChild(opt)
            }
          })
        }
      }

      // 2. Render KPI Summary Cards
      const cardsEl = document.getElementById('contrib-summary-cards')
      if (cardsEl) {
        cardsEl.innerHTML = `
          <div class="glass-panel" style="padding:18px; border-left:4px solid #008DC7;">
            <div style="font-size:0.8rem; color:#94a3b8; font-weight:600;">Total Ingested KBs</div>
            <div style="font-size:1.8rem; font-weight:800; color:#fff; margin-top:4px;">${data.summary.total_uploads}</div>
            <div style="font-size:0.72rem; color:#38bdf8; margin-top:2px;">
              🟢 Active: ${data.summary.active_uploads_count || 0} | 🏛️ Alumni: ${data.summary.former_uploads_count || 0}
            </div>
          </div>
          <div class="glass-panel" style="padding:18px; border-left:4px solid #10b981;">
            <div style="font-size:0.8rem; color:#94a3b8; font-weight:600;">Contributors</div>
            <div style="font-size:1.8rem; font-weight:800; color:#fff; margin-top:4px;">${data.summary.unique_contributors}</div>
            <div style="font-size:0.72rem; color:#34d399; margin-top:2px;">
              🟢 Active: ${data.summary.active_contributors_count || 0} | 🏛️ Alumni: ${data.summary.former_contributors_count || 0}
            </div>
          </div>
          <div class="glass-panel" style="padding:18px; border-left:4px solid #f59e0b;">
            <div style="font-size:0.8rem; color:#94a3b8; font-weight:600;">Top Contributor</div>
            <div style="font-size:1.3rem; font-weight:800; color:#fbbf24; margin-top:4px;">${data.summary.top_contributor}</div>
            <div style="font-size:0.72rem; color:#fcd34d;">${data.summary.top_contributor_count} KBs published</div>
          </div>
          <div class="glass-panel" style="padding:18px; border-left:4px solid #a855f7;">
            <div style="font-size:0.8rem; color:#94a3b8; font-weight:600;">Total Reader Views</div>
            <div style="font-size:1.8rem; font-weight:800; color:#fff; margin-top:4px;">${data.summary.total_views}</div>
            <div style="font-size:0.72rem; color:#c084fc;">Across filtered articles</div>
          </div>
        `
      }

      // 3. Render Leaderboard Table
      const lbody = document.getElementById('contrib-leaderboard-body')
      if (lbody) {
        lbody.innerHTML = ''
        if (data.contributors.length === 0) {
          lbody.innerHTML = '<tr><td colspan="9" style="padding:24px; text-align:center; color:#94a3b8;">No contributions found for selected filters.</td></tr>'
        } else {
          data.contributors.forEach((c, idx) => {
            const rankBadge = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : `#${idx + 1}`))
            const total = data.summary.total_uploads || 1
            const share = Math.round((c.upload_count / total) * 100)
            const statusBadge = c.is_active 
              ? '<span style="font-size:0.72rem; padding:2px 7px; border-radius:6px; background:rgba(16,185,129,0.15); color:#34d399; font-weight:700;">🟢 Active Team</span>'
              : '<span style="font-size:0.72rem; padding:2px 7px; border-radius:6px; background:rgba(244,63,94,0.15); color:#f43f5e; font-weight:700;">🔴 Suspended</span>'

            const actionBtn = (c.username !== 'admin' && (c.user_id || c.is_registered))
              ? `<button class="btn btn-secondary" style="padding:3px 8px; font-size:0.72rem; color:${c.is_active ? '#f59e0b' : '#34d399'}; font-weight:700;" onclick="toggleUserStatus(${c.user_id}, '${c.username}', ${c.is_active})">
                   ${c.is_active ? '⛔ Suspend' : '✅ Activate'}
                 </button>`
              : `<span style="color:#64748b; font-size:0.72rem;">-</span>`

            const tr = document.createElement('tr')
            tr.style.cssText = `border-bottom:1px solid rgba(255,255,255,0.05); opacity:${c.is_active ? 1 : 0.7};`
            tr.innerHTML = `
              <td style="padding:12px 14px; font-weight:800;">${rankBadge}</td>
              <td style="padding:12px 14px; font-weight:700; color:#fff;">${c.username}</td>
              <td style="padding:12px 14px;">${statusBadge}</td>
              <td style="padding:12px 14px;">
                <span style="font-size:0.72rem; padding:2px 8px; border-radius:6px; background:${c.role === 'Admin' ? 'rgba(244,63,94,0.15)' : 'rgba(16,185,129,0.15)'}; color:${c.role === 'Admin' ? '#f43f5e' : '#34d399'}; font-weight:700;">
                  ${c.role}
                </span>
              </td>
              <td style="padding:12px 14px;">
                <strong style="color:#fff;">${c.upload_count} KBs</strong> (${share}%)
              </td>
              <td style="padding:12px 14px; font-size:0.75rem; color:#94a3b8;">
                xpi: ${c.by_product.xpi || 0} | xpa: ${c.by_product.xpa || 0} | cloud: ${c.by_product.cloud_native || 0}
              </td>
              <td style="padding:12px 14px; color:#cbd5e1;">${c.views}</td>
              <td style="padding:12px 14px; color:#94a3b8; font-size:0.78rem;">${c.latest_upload}</td>
              <td style="padding:12px 14px; text-align:right;">${actionBtn}</td>
            `
            lbody.appendChild(tr)
          })
        }
      }

      // 4. Render Articles Log
      const abody = document.getElementById('contrib-articles-body')
      if (abody) {
        abody.innerHTML = ''
        if (data.articles.length === 0) {
          abody.innerHTML = '<tr><td colspan="7" style="padding:20px; text-align:center; color:#94a3b8;">No articles found.</td></tr>'
        } else {
          data.articles.forEach(a => {
            const tr = document.createElement('tr')
            tr.style.cssText = 'border-bottom:1px solid rgba(255,255,255,0.04);'
            tr.innerHTML = `
              <td style="padding:8px 12px; color:#64748b; font-size:0.75rem;">#${a.id}</td>
              <td style="padding:8px 12px; color:#e2e8f0; font-weight:600;">${a.title}</td>
              <td style="padding:8px 12px; color:#38bdf8;">${a.author}</td>
              <td style="padding:8px 12px; text-transform:uppercase; font-size:0.75rem; font-weight:700; color:#f59e0b;">${a.product}</td>
              <td style="padding:8px 12px; text-transform:uppercase; font-size:0.72rem; color:#94a3b8;">${a.file_type}</td>
              <td style="padding:8px 12px; color:#cbd5e1;">${a.views}</td>
              <td style="padding:8px 12px; color:#64748b; font-size:0.75rem;">${a.created_at}</td>
            `
            abody.appendChild(tr)
          })
        }
      }

      if (window.lucide) lucide.createIcons()
    } catch (e) {
      console.error("Contributions fetch failed:", e)
    }
  }

  // Bind filter change events for live updates
  ['contrib-filter-user', 'contrib-filter-year', 'contrib-filter-month', 'contrib-filter-product', 'contrib-filter-status', 'contrib-filter-start', 'contrib-filter-end'].forEach(id => {
    const el = document.getElementById(id)
    if (el) el.addEventListener('change', fetchAdminContributions)
  })

  // Reset Filters button
  const resetBtn = document.getElementById('btn-contrib-reset')
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      document.getElementById('contrib-filter-user').value = 'all'
      document.getElementById('contrib-filter-year').value = '2026'
      document.getElementById('contrib-filter-month').value = 'all'
      document.getElementById('contrib-filter-product').value = 'all'
      if (document.getElementById('contrib-filter-status')) document.getElementById('contrib-filter-status').value = 'all'
      document.getElementById('contrib-filter-start').value = ''
      document.getElementById('contrib-filter-end').value = ''
      fetchAdminContributions()
    })
  }

  // Export CSV button
  const exportBtn = document.getElementById('btn-contrib-export')
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      if (!contribDataCache || !contribDataCache.articles || contribDataCache.articles.length === 0) {
        alert('No articles available to export under current filters.')
        return
      }
      const headers = ['ID', 'Title', 'Author', 'Product Space', 'Format', 'Views', 'Date Uploaded']
      const rows = contribDataCache.articles.map(a => [
        a.id,
        `"${(a.title || '').replace(/"/g, '""')}"`,
        `"${a.author || 'System'}"`,
        a.product.toUpperCase(),
        (a.file_type || '').toUpperCase(),
        a.views || 0,
        `"${a.created_at || ''}"`
      ])
      const csv = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
      const link = document.createElement('a')
      link.setAttribute('href', encodeURI(csv))
      link.setAttribute('download', 'magic_kb_user_contributions.csv')
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    })
  }

  // ==================== 18. SIGN IN & LOGOUT ====================
  window.openLoginPage = function() {
    document.getElementById('page-home-landing').classList.add('hide')
    document.getElementById('page-product-workspace').classList.add('hide')
    document.getElementById('page-upload-portal').classList.add('hide')
    document.getElementById('page-admin-suite').classList.add('hide')
    const pageLogin = document.getElementById('page-login')
    if (pageLogin) {
      pageLogin.classList.remove('hide')
      const errBox = document.getElementById('loginpage-error-box')
      if (errBox) errBox.classList.add('hide')
      const userInp = document.getElementById('loginpage-user')
      const passInp = document.getElementById('loginpage-pass')
      if (userInp) userInp.value = ''
      if (passInp) passInp.value = ''
      setTimeout(() => {
        if (userInp) userInp.focus()
      }, 50)
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
    if (window.lucide) lucide.createIcons()
  }

  window.openSignInModal = function() {
    window.openLoginPage()
  }

  window.closeSignInModal = function() {
    const modal = document.getElementById('modal-signin')
    if (modal) modal.classList.add('hide')
  }

  const signinBtnEl = document.getElementById('btn-open-signin')
  if (signinBtnEl) {
    signinBtnEl.addEventListener('click', window.openLoginPage)
  }

  const logoutBtnEl = document.getElementById('btn-logout')
  if (logoutBtnEl) {
    logoutBtnEl.addEventListener('click', () => {
      token = ''
      username = ''
      role = ''
      localStorage.removeItem('token')
      localStorage.removeItem('username')
      localStorage.removeItem('role')
      updateAuthUI()
      switchProductScope('all')
    })
  }

  // Dedicated Login Page Form Submit
  const formLoginpageEl = document.getElementById('form-loginpage')
  if (formLoginpageEl) {
    formLoginpageEl.addEventListener('submit', async (e) => {
      e.preventDefault()
      const user = document.getElementById('loginpage-user').value.trim()
      const pass = document.getElementById('loginpage-pass').value.trim()
      const errBox = document.getElementById('loginpage-error-box')

      const formData = new FormData()
      formData.append('username', user)
      formData.append('password', pass)

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          body: formData
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.detail || 'Login failed')
        }
        const data = await res.json()
        token = data.access_token
        username = data.username
        role = data.role
        localStorage.setItem('token', token)
        localStorage.setItem('username', username)
        localStorage.setItem('role', role)
        updateAuthUI()
        switchProductScope('all')
      } catch (err) {
        if (errBox) {
          errBox.textContent = err.message
          errBox.classList.remove('hide')
        } else {
          alert(err.message)
        }
      }
    })
  }

  // Modal Sign In Form Submit (Fallback)
  const formSigninEl = document.getElementById('form-signin')
  if (formSigninEl) {
    formSigninEl.addEventListener('submit', async (e) => {
      e.preventDefault()
      const user = document.getElementById('signin-user').value.trim()
      const pass = document.getElementById('signin-pass').value.trim()
      const errBox = document.getElementById('signin-error-box')

      const formData = new FormData()
      formData.append('username', user)
      formData.append('password', pass)

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          body: formData
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.detail || 'Login failed')
        }
        const data = await res.json()
        token = data.access_token
        username = data.username
        role = data.role
        localStorage.setItem('token', token)
        localStorage.setItem('username', username)
        localStorage.setItem('role', role)
        window.closeSignInModal()
        updateAuthUI()
        switchProductScope('all')
      } catch (err) {
        if (errBox) {
          errBox.textContent = err.message
          errBox.classList.remove('hide')
        } else {
          alert(err.message)
        }
      }
    })
  }

  // Close modals on outside click
  document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.add('hide')
    })
  })

  // Notification Bell toggle
  document.getElementById('btn-notification-bell').addEventListener('click', () => {
    document.getElementById('notification-dropdown').classList.toggle('hide')
  })

  // Initial Load
  updateAuthUI()
  fetchOverview()
  fetchNotifications()
  renderRecentlyViewed()
  renderBookmarksList()
  renderFavouritesList()
  switchProductScope('all')
})
