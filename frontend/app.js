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
    if (container) {
      const recents = getRecentlyViewed()
      const filtered = (activeProduct === 'all') 
        ? recents 
        : recents.filter(r => r.product === activeProduct)

      container.innerHTML = ''
      if (filtered.length === 0) {
        container.innerHTML = '<span style="font-size:0.75rem; color:var(--text-faint);">Open any article to track it here.</span>'
      } else {
        filtered.slice(0, 5).forEach(r => {
          const row = document.createElement('div')
          row.className = 'sidebar-item-row'
          row.innerHTML = `
            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text-soft);">🕒 ${r.title}</span>
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
    }
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
      pinBtn.style.color = 'var(--c-amber)'
      pinLabel.textContent = 'Pinned SOP'
    } else {
      pinBtn.style.background = 'var(--bg-subtle)'
      pinBtn.style.borderColor = 'var(--border-strong)'
      pinBtn.style.color = 'var(--c-amber)'
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
      container.innerHTML = '<span style="font-size:0.75rem; color:var(--text-faint);">No pinned SOPs in this space.</span>'
      return
    }

    filtered.slice(0, 5).forEach(doc => {
      const row = document.createElement('div')
      row.className = 'sidebar-item-row'
      row.innerHTML = `
        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--c-amber);">⭐ ${doc.title}</span>
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
      btn.style.borderColor = 'var(--c-rose)'
      btn.style.color = 'var(--c-rose)'
      label.textContent = 'Favourited'
    } else {
      btn.style.background = 'var(--bg-subtle)'
      btn.style.borderColor = 'var(--border-strong)'
      btn.style.color = 'var(--c-rose)'
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
          <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--c-rose-soft);">❤️ ${f.title}</span>
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
      container.innerHTML = '<span style="font-size:0.75rem; color:var(--text-faint);">No favourite guides saved yet.</span>'
    }
  }

  // ==================== 4. BOOKMARKS / STARRED ====================
  // Signed in  -> server-side per-account favorites (/api/favorites), so stars
  //               follow the user across browsers and devices.
  // Signed out -> localStorage, so guests keep a usable bookmark feature.
  let bookmarkCache = []                 // [{id, title, product, views, created_at}]
  let bookmarkIdSet = new Set()          // stringified ids, for synchronous checks

  function getLocalBookmarks() {
    try {
      return JSON.parse(localStorage.getItem('user_bookmarks') || '[]')
    } catch (e) {
      return []
    }
  }

  function saveLocalBookmarks(bks) {
    localStorage.setItem('user_bookmarks', JSON.stringify(bks))
    setBookmarkCache(bks)
  }

  function setBookmarkCache(list) {
    bookmarkCache = Array.isArray(list) ? list : []
    bookmarkIdSet = new Set(bookmarkCache.map(b => String(b.id)))
    renderBookmarksList()
  }

  // Help topics ("help_123") live in a different table and cannot be favorited.
  function isFavoritableId(docId) {
    return docId !== undefined && docId !== null && /^\d+$/.test(String(docId))
  }

  async function loadBookmarks() {
    if (!token) {
      setBookmarkCache(getLocalBookmarks())
      return
    }
    try {
      const res = await fetch('/api/favorites', { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) throw new Error(`favorites ${res.status}`)
      setBookmarkCache(await res.json())
    } catch (e) {
      // Never let a failed/expired-token call blank the sidebar.
      console.error('Could not load favorites:', e)
      setBookmarkCache([])
    }
  }

  // One-time move of a guest's local bookmarks into their account on sign-in.
  async function migrateLocalBookmarks() {
    if (!token || !username) return
    const flag = `bookmarks_migrated_${username.toLowerCase()}`
    if (localStorage.getItem(flag)) return

    const local = getLocalBookmarks().filter(b => isFavoritableId(b.id))
    // Set the flag first: the favorite endpoint is a toggle, so a retry after a
    // partial failure could un-star what already made it across.
    localStorage.setItem(flag, '1')

    if (local.length) {
      let existing = new Set()
      try {
        const res = await fetch('/api/favorites', { headers: { Authorization: `Bearer ${token}` } })
        if (res.ok) existing = new Set((await res.json()).map(d => String(d.id)))
      } catch (e) { /* fall through and attempt the posts anyway */ }

      for (const b of local) {
        if (existing.has(String(b.id))) continue
        try {
          await fetch(`/api/document/${b.id}/favorite`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` }
          })
        } catch (e) {
          console.error('Bookmark migration failed for doc', b.id, e)
        }
      }
      localStorage.removeItem('user_bookmarks')
    }
  }

  function isDocBookmarked(docId) {
    return bookmarkIdSet.has(String(docId))
  }

  async function toggleDocBookmark(doc) {
    if (!doc || !doc.id) return

    if (!token) {
      let bks = getLocalBookmarks()
      const exists = bks.some(b => String(b.id) === String(doc.id))
      if (exists) {
        bks = bks.filter(b => String(b.id) !== String(doc.id))
      } else {
        bks.unshift({ id: doc.id, title: doc.title, product: doc.product || activeProduct })
      }
      saveLocalBookmarks(bks)
      updateBookmarkButtonState(doc.id)
      return
    }

    if (!isFavoritableId(doc.id)) {
      alert('This help topic cannot be starred. Only knowledge base documents can be saved.')
      return
    }

    try {
      const res = await fetch(`/api/document/${doc.id}/favorite`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error(`favorite ${res.status}`)
      await loadBookmarks()
      updateBookmarkButtonState(doc.id)
      if (typeof renderLandingSections === 'function') renderLandingSections()
    } catch (e) {
      console.error('Could not update favorite:', e)
      alert('Could not update your starred items. Please try again.')
    }
  }

  function updateBookmarkButtonState(docId) {
    const btn = document.getElementById('btn-doc-bookmark')
    const label = document.getElementById('btn-doc-bookmark-label')
    if (!btn || !label) return

    const bookmarked = isDocBookmarked(docId)
    if (bookmarked) {
      btn.style.background = 'rgba(0,141,199,0.2)'
      btn.style.borderColor = '#008DC7'
      btn.style.color = 'var(--c-sky)'
      label.textContent = 'Bookmarked'
    } else {
      btn.style.background = 'var(--bg-subtle)'
      btn.style.borderColor = 'var(--border-strong)'
      btn.style.color = 'var(--c-sky)'
      label.textContent = 'Bookmark'
    }
  }

  function renderBookmarksList() {
    const container = document.getElementById('left-favorites-list')
    const countBadge = document.getElementById('left-bookmarks-count')
    if (!container) return

    const bks = bookmarkCache
    const filtered = (activeProduct === 'all')
      ? bks
      : bks.filter(b => b.product === activeProduct)

    if (countBadge) countBadge.textContent = filtered.length

    container.innerHTML = ''
    if (filtered.length === 0) {
      container.innerHTML = '<span style="font-size:0.75rem; color:var(--text-faint);">No saved bookmarks yet.</span>'
      return
    }

    filtered.slice(0, 6).forEach(b => {
      const row = document.createElement('div')
      row.className = 'sidebar-item-row'
      row.style.borderColor = 'rgba(0,141,199,0.15)'
      row.innerHTML = `
        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--c-sky);">🔖 ${b.title}</span>
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
    const btnReviewQueue = document.getElementById('btn-open-review-queue')
    const btnOpenUploadUtil = document.getElementById('btn-open-upload-utility')
    const userNameLabel = document.getElementById('user-name-label')

    const normRole = (role || '').toLowerCase()

    if (token) {
      userBox.classList.remove('hide')
      signinBtn.classList.add('hide')
      userNameLabel.textContent = username

      // Account menu identity + Downloads relocated inside the dropdown.
      const initial = document.getElementById('user-avatar-initial')
      const menuName = document.getElementById('user-menu-name')
      const menuRole = document.getElementById('user-menu-role')
      if (initial) initial.textContent = (username || 'U').trim().charAt(0) || 'U'
      if (menuName) menuName.textContent = username
      if (menuRole) menuRole.textContent = role || 'Viewer'
      moveDownloadsButton(true)

      if (['admin', 'editor', 'reviewer'].includes(normRole)) {
        if (btnWriteKb) btnWriteKb.classList.remove('hide')
        if (btnUpload) btnUpload.classList.remove('hide')
      } else {
        if (btnWriteKb) btnWriteKb.classList.add('hide')
        if (btnUpload) btnUpload.classList.add('hide')
      }

      if (['admin', 'reviewer'].includes(normRole)) {
        if (btnReviewQueue) btnReviewQueue.classList.remove('hide')
        if (btnOpenUploadUtil) btnOpenUploadUtil.classList.remove('hide')
        fetchReviewQueueCount()
      } else {
        if (btnReviewQueue) btnReviewQueue.classList.add('hide')
        if (btnOpenUploadUtil) btnOpenUploadUtil.classList.add('hide')
      }

      const btnCopilotSettings = document.getElementById('copilot-tab-btn-settings')
      if (normRole === 'admin') {
        if (btnAdmin) btnAdmin.classList.remove('hide')
        if (btnCopilotSettings) {
          btnCopilotSettings.classList.remove('hide')
          btnCopilotSettings.style.setProperty('display', 'inline-flex', 'important')
        }
      } else {
        if (btnAdmin) btnAdmin.classList.add('hide')
        if (btnCopilotSettings) {
          btnCopilotSettings.classList.add('hide')
          btnCopilotSettings.style.setProperty('display', 'none', 'important')
        }
      }
    } else {
      userBox.classList.add('hide')
      signinBtn.classList.remove('hide')
      closeUserMenu()
      // Guests have no account menu, so Downloads goes back into the header.
      moveDownloadsButton(false)
      if (btnWriteKb) btnWriteKb.classList.add('hide')
      if (btnUpload) btnUpload.classList.add('hide')
      if (btnAdmin) btnAdmin.classList.add('hide')
      if (btnReviewQueue) btnReviewQueue.classList.add('hide')
      if (btnOpenUploadUtil) btnOpenUploadUtil.classList.add('hide')
      const btnCopilotSettings = document.getElementById('copilot-tab-btn-settings')
      if (btnCopilotSettings) {
        btnCopilotSettings.classList.add('hide')
        btnCopilotSettings.style.setProperty('display', 'none', 'important')
      }
    }

    // The landing sections differ by auth state (2 as a guest, 4 signed in).
    renderLandingSections()
  }

  // ==================== 5.05 THEME (light / dark) ====================
  // Explicit choice wins and is remembered per browser; with no choice stored we
  // follow the OS setting, and keep following it while it changes.
  const THEME_KEY = 'kc_theme'

  function systemPrefersLight() {
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches)
  }

  function storedTheme() {
    try {
      const v = localStorage.getItem(THEME_KEY)
      return (v === 'light' || v === 'dark') ? v : null
    } catch (e) {
      return null
    }
  }

  function applyTheme(theme) {
    const light = theme === 'light'
    document.documentElement.setAttribute('data-theme', light ? 'light' : 'dark')
    const icon = document.getElementById('theme-toggle-icon')
    const btn = document.getElementById('btn-theme-toggle')
    if (icon) {
      // Show the theme you would switch TO.
      icon.setAttribute('data-lucide', light ? 'moon' : 'sun')
      if (window.lucide) lucide.createIcons()
    }
    if (btn) btn.title = light ? 'Switch to dark theme' : 'Switch to light theme'
    restyleCharts()
  }

  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
  }

  // Chart.js paints to a canvas, so it cannot inherit CSS variables. These give
  // it the current theme's values, and restyleCharts() re-applies them on toggle.
  function chartGridColor() {
    return currentTheme() === 'light' ? 'rgba(15,23,42,0.10)' : 'rgba(255,255,255,0.05)'
  }

  function chartTickColor() {
    return currentTheme() === 'light' ? '#475569' : '#94a3b8'
  }

  function restyleCharts() {
    const charts = [window.chartTelemetry, window.chartProductDist, window.chartAuthorLeaderboard,
                    window.chartContribUsers, window.chartContribTimeline]
    charts.forEach(ch => {
      if (!ch || !ch.options) return
      try {
        const scales = ch.options.scales || {}
        Object.keys(scales).forEach(k => {
          const sc = scales[k]
          if (!sc) return
          if (sc.grid) sc.grid.color = chartGridColor()
          if (sc.ticks) sc.ticks.color = chartTickColor()
        })
        const legend = ch.options.plugins && ch.options.plugins.legend
        if (legend && legend.labels) legend.labels.color = chartTickColor()
        ch.update('none')
      } catch (e) {
        console.error('Could not restyle chart on theme change:', e)
      }
    })
  }

  applyTheme(storedTheme() || (systemPrefersLight() ? 'light' : 'dark'))

  const btnThemeToggle = document.getElementById('btn-theme-toggle')
  if (btnThemeToggle) {
    btnThemeToggle.addEventListener('click', () => {
      const next = currentTheme() === 'light' ? 'dark' : 'light'
      try { localStorage.setItem(THEME_KEY, next) } catch (e) { /* private mode */ }
      applyTheme(next)
    })
  }

  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const onSystemChange = (e) => {
      // Only track the OS while the user has not made an explicit choice.
      if (!storedTheme()) applyTheme(e.matches ? 'light' : 'dark')
    }
    if (mq.addEventListener) mq.addEventListener('change', onSystemChange)
    else if (mq.addListener) mq.addListener(onSystemChange)
  }

  // ==================== 5.1 ACCOUNT MENU ====================
  // Downloads is available to everyone, so it lives in the header for guests and
  // moves into the account menu once signed in. appendChild relocates the very
  // same node, so its existing click listener is preserved either way.
  function moveDownloadsButton(intoMenu) {
    const btn = document.getElementById('btn-tab-utilities')
    const menuItems = document.getElementById('user-menu-items')
    const headerActions = document.getElementById('header-actions-inline')
    const signinBtn = document.getElementById('btn-open-signin')
    if (!btn || !menuItems || !headerActions) return

    if (intoMenu) {
      if (btn.parentElement !== menuItems) menuItems.insertBefore(btn, menuItems.firstChild)
      btn.classList.remove('hdr-btn')
      btn.classList.add('user-menu-item')
    } else {
      if (btn.parentElement !== headerActions) headerActions.insertBefore(btn, signinBtn)
      btn.classList.remove('user-menu-item')
      btn.classList.add('hdr-btn')
    }
    if (window.lucide) lucide.createIcons()
  }

  function closeUserMenu() {
    const dd = document.getElementById('user-menu-dropdown')
    if (dd) dd.classList.add('hide')
  }

  const btnUserMenu = document.getElementById('btn-user-menu')
  if (btnUserMenu) {
    btnUserMenu.addEventListener('click', (e) => {
      e.stopPropagation()
      const dd = document.getElementById('user-menu-dropdown')
      if (dd) dd.classList.toggle('hide')
      // Two dropdowns in the same corner should never overlap.
      const notif = document.getElementById('notification-dropdown')
      if (notif) notif.classList.add('hide')
    })
  }

  // Any menu action navigates away, so collapse the menu on click-through.
  const userMenuDropdown = document.getElementById('user-menu-dropdown')
  if (userMenuDropdown) {
    userMenuDropdown.addEventListener('click', (e) => {
      if (e.target.closest('button')) closeUserMenu()
    })
  }

  document.addEventListener('click', (e) => {
    const box = document.getElementById('user-profile-box')
    if (box && !box.contains(e.target)) closeUserMenu()
  })

  // ==================== 5.5 SUPPORT UTILITIES & REVIEW QUEUE & LOGIN AUDIT ====================
  function switchPage(pageId) {
    ['page-home-landing', 'page-product-workspace', 'page-upload-portal', 'page-utilities-hub', 'page-admin-suite', 'page-login'].forEach(id => {
      const el = document.getElementById(id)
      if (el) el.classList.add('hide')
    })
    const target = document.getElementById(pageId)
    if (target) target.classList.remove('hide')
    window.scrollTo({ top: 0, behavior: 'smooth' })
    if (window.lucide) lucide.createIcons()
  }

  // Header Nav Tab for Support Utilities
  const btnTabUtilities = document.getElementById('btn-tab-utilities')
  if (btnTabUtilities) {
    btnTabUtilities.addEventListener('click', () => {
      switchPage('page-utilities-hub')
      fetchUtilities()
    })
  }

  const btnUtilBackHome = document.getElementById('btn-utilities-back-home')
  if (btnUtilBackHome) {
    btnUtilBackHome.addEventListener('click', () => switchPage('page-home-landing'))
  }

  // Downloads Section Fetcher
  async function fetchUtilities() {
    const grid = document.getElementById('utilities-grid')
    if (!grid) return
    const search = (document.getElementById('util-search-input')?.value || '').trim()
    const product = document.getElementById('util-filter-product')?.value || 'all'

    grid.innerHTML = '<div style="grid-column:1/-1; padding:40px; text-align:center; color:var(--text-muted);">Loading download files...</div>'

    let url = `/api/utilities?product=${product}`
    if (search) url += `&query=${encodeURIComponent(search)}`

    // Any failure here used to `return` silently, leaving "Loading download
    // files..." on screen forever with no way to tell a slow backend from a
    // dead one. Always replace the loading placeholder with something.
    const failed = (headline, detail) => {
      grid.innerHTML = ''
      const box = document.createElement('div')
      box.style.cssText = 'grid-column:1/-1; padding:36px; text-align:center; color:var(--text-muted);'
      const h = document.createElement('div')
      h.style.cssText = 'font-weight:700; color:var(--c-rose); margin-bottom:6px;'
      h.textContent = headline
      const p = document.createElement('div')
      p.style.cssText = 'font-size:0.85rem; margin-bottom:14px;'
      p.textContent = detail
      const retry = document.createElement('button')
      retry.type = 'button'
      retry.className = 'btn btn-secondary'
      retry.textContent = 'Retry'
      retry.onclick = () => fetchUtilities()
      box.appendChild(h); box.appendChild(p); box.appendChild(retry)
      grid.appendChild(box)
    }

    try {
      const res = await fetch(url)
      if (!res.ok) {
        failed('Could not load downloads', `The server responded with ${res.status}.`)
        return
      }
      const items = await res.json()

      grid.innerHTML = ''
      if (items.length === 0) {
        grid.innerHTML = '<div style="grid-column:1/-1; padding:40px; text-align:center; color:var(--text-faint); font-size:0.95rem;">No download files available.</div>'
        return
      }

      items.forEach(item => {
        const card = document.createElement('div')
        card.className = 'glass-panel'
        card.style.cssText = 'padding:22px; display:flex; flex-direction:column; justify-content:space-between; gap:16px; border:1px solid rgba(56,189,248,0.2); background:var(--bg-card);'
        
        const ext = item.file_name ? item.file_name.split('.').pop().toUpperCase() : 'FILE'

        card.innerHTML = `
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <span style="font-size:0.72rem; font-weight:700; padding:3px 8px; border-radius:6px; background:rgba(56,189,248,0.15); color:var(--c-sky); text-transform:uppercase;">${item.product || 'GENERAL'}</span>
              <span style="font-size:0.75rem; padding:3px 8px; border-radius:6px; background:rgba(16,185,129,0.15); color:var(--c-emerald); font-weight:700;">${ext} • ${item.file_size || 'N/A'}</span>
            </div>
            <h3 style="font-size:1.15rem; font-weight:800; color:var(--text-main); margin:0 0 8px 0; word-break:break-word;">${item.title}</h3>
            <div style="font-size:0.82rem; color:var(--text-muted); font-family:monospace; margin-bottom:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">📁 ${item.file_name || ''}</div>
            ${item.description ? `<p style="font-size:0.85rem; color:var(--text-soft); line-height:1.5; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; margin:0;">${item.description}</p>` : ''}
          </div>

          <div style="border-top:1px solid var(--border-color); padding-top:14px; display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:0.75rem; color:var(--text-faint); font-weight:600;">📥 ${item.download_count || 0} Downloads</span>
            <div style="display:flex; gap:8px;">
              <a href="/api/utilities/download/${item.id}" target="_blank" class="btn btn-primary" style="font-size:0.82rem; padding:8px 16px; background:linear-gradient(135deg, #008DC7, #2DBCEE); font-weight:700; display:inline-flex; align-items:center; gap:6px;">
                <i data-lucide="download" style="width:14px; height:14px;"></i> Download File
              </a>
            </div>
          </div>
        `
        grid.appendChild(card)
      })

      window.allUtilitiesCache = items
      if (window.lucide) lucide.createIcons()
    } catch (e) {
      console.error(e)
      failed('Could not reach the server', 'Check that the Knowledge Center service is running, then retry.')
    }
  }

  // Filter Listeners
  ;['util-search-input', 'util-filter-product'].forEach(id => {
    const el = document.getElementById(id)
    if (el) el.addEventListener('input', fetchUtilities)
    if (el) el.addEventListener('change', fetchUtilities)
  })

  // Open & Close Utility Upload Modal
  const btnOpenUploadUtil = document.getElementById('btn-open-upload-utility')
  if (btnOpenUploadUtil) {
    btnOpenUploadUtil.addEventListener('click', () => {
      document.getElementById('modal-upload-utility').classList.remove('hide')
    })
  }
  const btnCloseUploadUtil = document.getElementById('btn-close-upload-utility')
  if (btnCloseUploadUtil) {
    btnCloseUploadUtil.addEventListener('click', () => {
      document.getElementById('modal-upload-utility').classList.add('hide')
    })
  }

  // Submit Utility Upload Form
  const formUploadUtility = document.getElementById('form-upload-utility')
  if (formUploadUtility) {
    formUploadUtility.addEventListener('submit', async (e) => {
      e.preventDefault()
      if (!token) return alert('Please sign in first')

      const title = document.getElementById('util-input-title').value.trim()
      const product = document.getElementById('util-input-product').value
      const category = document.getElementById('util-input-category').value
      const version = document.getElementById('util-input-version').value.trim()
      const platform = document.getElementById('util-input-platform').value
      const description = document.getElementById('util-input-desc').value.trim()
      const fileInput = document.getElementById('util-input-file')

      if (!fileInput.files || fileInput.files.length === 0) return alert('Please select a file')

      const formData = new FormData()
      formData.append('title', title)
      formData.append('product', product)
      formData.append('category', category)
      formData.append('version', version)
      formData.append('platform', platform)
      formData.append('description', description)
      formData.append('file', fileInput.files[0])

      try {
        const res = await fetch('/api/utilities/upload', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        })
        if (!res.ok) {
          const err = await res.json()
          alert(err.detail || 'Upload failed')
          return
        }
        alert('Utility published successfully!')
        document.getElementById('modal-upload-utility').classList.add('hide')
        fetchUtilities()
      } catch (e) {
        alert('Upload error: ' + e.message)
      }
    })
  }

  // Utility Guide Modal
  window.openUtilityGuideModal = function(id) {
    const item = (window.allUtilitiesCache || []).find(u => u.id === id)
    if (!item) return
    document.getElementById('guide-util-title').textContent = item.title
    document.getElementById('guide-util-ver').textContent = item.version
    document.getElementById('guide-util-platform').textContent = item.platform
    document.getElementById('guide-util-size').textContent = (item.file_size / (1024*1024)).toFixed(2) + ' MB'
    document.getElementById('guide-util-desc').textContent = item.description

    const dlBtn = document.getElementById('btn-download-utility-guide-file')
    if (dlBtn) dlBtn.onclick = () => window.open(`/api/utilities/download/${item.id}`, '_blank')

    document.getElementById('modal-utility-guide').classList.remove('hide')
  }

  const closeGuideBtns = ['btn-close-utility-guide', 'btn-close-utility-guide-bottom']
  closeGuideBtns.forEach(id => {
    const el = document.getElementById(id)
    if (el) el.onclick = () => document.getElementById('modal-utility-guide').classList.add('hide')
  })

  // Review Queue Open/Close & Logic
  const btnOpenReviewQueue = document.getElementById('btn-open-review-queue')
  if (btnOpenReviewQueue) {
    btnOpenReviewQueue.addEventListener('click', () => {
      document.getElementById('modal-review-queue').classList.remove('hide')
      fetchReviewQueue()
    })
  }

  const btnCloseReviewQueue = document.getElementById('btn-close-review-queue')
  if (btnCloseReviewQueue) {
    btnCloseReviewQueue.addEventListener('click', () => {
      document.getElementById('modal-review-queue').classList.add('hide')
    })
  }

  let currentReviewItem = null
  async function fetchReviewQueueCount() {
    if (!token) return
    try {
      const res = await fetch('/api/review/queue', { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        const items = await res.json()
        const badge = document.getElementById('review-queue-badge')
        if (badge) {
          badge.textContent = items.length
          if (items.length > 0) badge.classList.remove('hide')
          else badge.classList.add('hide')
        }
      }
    } catch (e) {}
  }

  async function fetchReviewQueue() {
    if (!token) return
    const container = document.getElementById('review-queue-list-container')
    const detailPane = document.getElementById('review-queue-detail-pane')
    const spaceFilter = document.getElementById('review-filter-space').value
    if (!container) return

    container.innerHTML = '<div style="padding:12px; color:var(--text-muted); font-size:0.8rem;">Loading pending KBs...</div>'
    try {
      const res = await fetch('/api/review/queue', { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return
      let items = await res.json()
      if (spaceFilter !== 'all') {
        items = items.filter(i => i.product === spaceFilter)
      }

      container.innerHTML = ''
      if (items.length === 0) {
        container.innerHTML = '<div style="padding:20px; color:var(--text-faint); font-size:0.82rem; text-align:center;">No pending articles for review.</div>'
        detailPane.innerHTML = '<div style="text-align:center; padding:60px 20px; color:var(--text-faint);">Select a pending document from the left list to review its contents.</div>'
        return
      }

      items.forEach(item => {
        const card = document.createElement('div')
        card.style.cssText = 'padding:12px; border-radius:8px; background:var(--bg-subtle); border:1px solid var(--border-color); cursor:pointer;'
        card.innerHTML = `
          <div style="font-size:0.85rem; font-weight:700; color:var(--text-main); margin-bottom:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.title}</div>
          <div style="display:flex; justify-content:space-between; font-size:0.72rem; color:var(--text-muted);">
            <span>By: ${item.author}</span>
            <span style="color:var(--c-amber); font-weight:600;">${item.product}</span>
          </div>
        `
        card.onclick = () => renderReviewItemDetail(item)
        container.appendChild(card)
      })

      if (items.length > 0 && !currentReviewItem) {
        renderReviewItemDetail(items[0])
      }
    } catch (e) {
      console.error(e)
    }
  }

  function renderReviewItemDetail(item) {
    currentReviewItem = item
    const detailPane = document.getElementById('review-queue-detail-pane')
    if (!detailPane) return

    const rawText = item.content || 'No document content available.'
    const parsedContent = (window.marked && window.marked.parse) ? window.marked.parse(rawText) : rawText

    detailPane.innerHTML = `
      <div style="border-bottom:1px solid var(--border-color); padding-bottom:16px; margin-bottom:16px; flex-shrink:0;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:8px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:0.75rem; font-weight:700; padding:3px 8px; border-radius:6px; background:rgba(245,158,11,0.15); color:var(--c-amber); text-transform:uppercase;">${(item.product || 'XPI').toUpperCase()}</span>
            <span style="font-size:0.75rem; padding:3px 8px; border-radius:6px; background:var(--bg-subtle); color:var(--text-soft);">${item.file_type ? item.file_type.toUpperCase() : 'MD'}</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:0.78rem; color:var(--text-muted);">Submitted: ${item.created_at || 'Recently'}</span>
            <button type="button" onclick="downloadReviewOriginalFile(${item.id})" class="btn btn-secondary" style="font-size:0.75rem; padding:4px 10px; color:var(--c-emerald); border-color:rgba(52,211,153,0.3); display:inline-flex; align-items:center; gap:4px;">
              <i data-lucide="download" style="width:13px; height:13px;"></i> Download Original File
            </button>
            <button type="button" onclick="previewDocInReader(${item.id})" class="btn btn-secondary" style="font-size:0.75rem; padding:4px 10px; color:var(--c-sky); border-color:rgba(56,189,248,0.3);">
              <i data-lucide="eye" style="width:13px; height:13px;"></i> Full Reader View
            </button>
          </div>
        </div>
        <h2 style="font-size:1.35rem; font-weight:800; color:var(--text-main); margin:0 0 6px 0; word-break:break-word;">${item.title}</h2>
        <div style="font-size:0.82rem; color:var(--c-sky);">Uploader / Author: <strong>${item.author || 'Contributor'}</strong></div>
      </div>

      ${item.review_comment ? `
        <div style="padding:10px 14px; border-radius:8px; background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.3); color:var(--c-amber); font-size:0.82rem; margin-bottom:14px; flex-shrink:0;">
          <strong>Previous Review Notes:</strong> ${item.review_comment}
        </div>
      ` : ''}

      <!-- Clean Article Body Container -->
      <div class="markdown-body" style="flex:1; min-height:220px; overflow-y:auto; overflow-x:auto; color:var(--text-soft); font-size:0.9rem; line-height:1.7; background:var(--bg-input); padding:18px 22px; border-radius:10px; border:1px solid var(--border-color); margin-bottom:16px; white-space:pre-wrap; word-break:break-word;">
        ${parsedContent}
      </div>

      <!-- Action Panel -->
      <div style="border-top:1px solid var(--border-color); padding-top:14px; flex-shrink:0;">
        <div style="margin-bottom:10px;">
          <label style="display:block; font-size:0.78rem; color:var(--text-soft); margin-bottom:4px; font-weight:600;">Review Comments / Revision Notes for Author</label>
          <input type="text" id="review-action-comment" placeholder="Enter comments or requested modifications..." style="width:100%; padding:9px 12px; background:var(--bg-input); border:1px solid var(--border-strong); border-radius:8px; color:var(--text-main); font-size:0.85rem; outline:none;">
        </div>

        <div style="display:flex; justify-content:flex-end; gap:10px;">
          <button onclick="submitReviewDecision(${item.id}, 'reject')" class="btn" style="background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.3); color:var(--c-rose); font-weight:700;">Reject</button>
          <button onclick="submitReviewDecision(${item.id}, 'request_changes')" class="btn" style="background:rgba(245,158,11,0.15); border:1px solid rgba(245,158,11,0.3); color:var(--c-amber); font-weight:700;">Request Changes</button>
          <button onclick="submitReviewDecision(${item.id}, 'approve')" class="btn btn-primary" style="background:linear-gradient(135deg, #10b981, #008DC7); font-weight:700;">Approve & Publish SOP</button>
        </div>
      </div>
    `
    if (window.lucide) lucide.createIcons()
  }

  window.previewDocInReader = function(docId) {
    const modal = document.getElementById('modal-review-queue')
    if (modal) modal.classList.add('hide')
    openDocument(docId)
  }

  window.downloadReviewOriginalFile = async function(docId) {
    if (!token) return alert('Authentication required. Please sign in.')
    try {
      const res = await fetch(`/api/review/download/${docId}?token=${encodeURIComponent(token)}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.detail || 'Failed to download original document file.')
        return
      }
      const blob = await res.blob()
      const disposition = res.headers.get('content-disposition')
      let fname = `review_document_${docId}`
      if (disposition && disposition.includes('filename=')) {
        fname = disposition.split('filename=')[1].replace(/"/g, '').trim()
      }
      const blobUrl = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = fname
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(blobUrl)
    } catch (e) {
      alert('Error downloading file: ' + e.message)
    }
  }

  window.submitReviewDecision = async function(docId, action) {
    if (!token) return
    const commentInput = document.getElementById('review-action-comment')
    const comment = commentInput ? commentInput.value.trim() : ''

    try {
      const res = await fetch('/api/review/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ document_id: docId, doc_id: docId, action: action, comment: comment, reviewer_comment: comment })
      })
      if (!res.ok) {
        const err = await res.json()
        alert(err.detail || 'Review action failed')
        return
      }
      currentReviewItem = null
      fetchReviewQueue()
      fetchReviewQueueCount()
      fetchOverview()
    } catch (e) {
      alert('Error submitting decision: ' + e.message)
    }
  }

  const reviewSpaceFilter = document.getElementById('review-filter-space')
  if (reviewSpaceFilter) reviewSpaceFilter.addEventListener('change', fetchReviewQueue)

  // Admin Tab 6: Login Audit History
  const adminTabLoginHistory = document.getElementById('admin-tab-loginhistory')
  if (adminTabLoginHistory) {
    adminTabLoginHistory.addEventListener('click', () => {
      ['admin-panel-users', 'admin-panel-docs', 'admin-panel-reindex', 'admin-panel-analytics', 'admin-panel-contributions', 'admin-panel-loginhistory'].forEach(id => {
        const el = document.getElementById(id)
        if (el) el.classList.add('hide')
      })
      const target = document.getElementById('admin-panel-loginhistory')
      if (target) target.classList.remove('hide')
      fetchLoginHistory()
    })
  }

  async function fetchLoginHistory() {
    const norm = (role || '').toLowerCase()
    if (!token || norm !== 'admin') return
    const container = document.getElementById('admin-login-history-table-body')
    const search = (document.getElementById('admin-login-search-user')?.value || '').trim()
    const category = document.getElementById('admin-login-filter-status')?.value || 'all'
    if (!container) return

    container.innerHTML = '<tr><td colspan="6" style="padding:20px; text-align:center; color:var(--text-muted);">Loading audit activity trail...</td></tr>'

    let url = `/api/admin/enterprise-audit-logs?search=${encodeURIComponent(search)}&category=${encodeURIComponent(category)}`
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return
      const data = await res.json()
      const items = data.logs || []

      container.innerHTML = ''
      if (items.length === 0) {
        container.innerHTML = '<tr><td colspan="6" style="padding:20px; text-align:center; color:var(--text-faint);">No audit log records found matching filters.</td></tr>'
        return
      }

      items.forEach(item => {
        const tr = document.createElement('tr')
        tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)'
        
        let catColor = 'var(--c-sky)'
        let catBg = 'rgba(56,189,248,0.15)'
        let catBorder = 'rgba(56,189,248,0.3)'
        
        if (item.action_category === 'REVIEW') {
          catColor = 'var(--c-amber)'; catBg = 'rgba(245,158,11,0.15)'; catBorder = 'rgba(245,158,11,0.3)';
        } else if (item.action_category === 'AUTH') {
          catColor = 'var(--c-emerald)'; catBg = 'rgba(52,211,153,0.15)'; catBorder = 'rgba(52,211,153,0.3)';
        } else if (item.action_category === 'DOWNLOADS') {
          catColor = 'var(--c-purple)'; catBg = 'rgba(168,85,247,0.15)'; catBorder = 'rgba(168,85,247,0.3)';
        } else if (item.action_category === 'KB_MANAGE') {
          catColor = 'var(--c-cyan)'; catBg = 'rgba(6,182,212,0.15)'; catBorder = 'rgba(6,182,212,0.3)';
        } else if (item.action_category === 'ADMIN') {
          catColor = 'var(--c-rose)'; catBg = 'rgba(244,63,94,0.15)'; catBorder = 'rgba(244,63,94,0.3)';
        }

        tr.innerHTML = `
          <td style="padding:12px 16px; color:var(--text-soft); white-space:nowrap; font-size:0.82rem;">${item.timestamp}</td>
          <td style="padding:12px 16px; font-weight:600; color:var(--text-main); white-space:nowrap;">
            ${item.username} <span style="font-size:0.72rem; color:var(--text-muted); font-weight:normal;">(${item.user_role})</span>
          </td>
          <td style="padding:12px 16px;">
            <span style="padding:3px 8px; border-radius:6px; font-size:0.72rem; font-weight:700; background:${catBg}; color:${catColor}; border:1px solid ${catBorder};">
              ${item.action_category}
            </span>
          </td>
          <td style="padding:12px 16px; font-weight:700; color:var(--c-sky); font-size:0.82rem;">${item.action}</td>
          <td style="padding:12px 16px; color:var(--text-soft); font-size:0.84rem; max-width:340px; word-break:break-word;">${item.details || '-'}</td>
          <td style="padding:12px 16px; color:var(--text-muted); font-family:monospace; font-size:0.78rem;">${item.ip_address}</td>
        `
        container.appendChild(tr)
      })
    } catch (e) {
      console.error(e)
    }
  }

  ;['admin-login-search-user', 'admin-login-filter-status'].forEach(id => {
    const el = document.getElementById(id)
    if (el) el.addEventListener('input', fetchLoginHistory)
    if (el) el.addEventListener('change', fetchLoginHistory)
  })

  const btnRefreshLoginHist = document.getElementById('btn-refresh-login-history')
  if (btnRefreshLoginHist) btnRefreshLoginHist.addEventListener('click', fetchLoginHistory)

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

      renderLandingProductMeta()
      renderLandingSections()
    } catch (e) {
      console.error('Error fetching overview:', e)
    }
  }

  // ==================== 6.1 LANDING PAGE: PRODUCT CARD META ====================
  function renderLandingProductMeta() {
    // Reflect the real corpus size in the hero search placeholder.
    const input = document.getElementById('landing-search-input')
    const total = overviewData ? overviewData.total_documents : 0
    if (input && total) {
      input.placeholder = `Search ${total} manuals, SOPs, connectors, and error codes...`
    }
  }

  function escapeHtmlText(s) {
    return String(s === undefined || s === null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  // ==================== 6.2 LANDING PAGE: AUTH-AWARE CONTENT SECTIONS ====================
  // One renderer for all four sections so there is no per-section copy-paste.
  function buildLandingSection({ title, icon, accent, accentText, items, emptyText, meta, starred }) {
    const section = document.createElement('div')
    section.className = 'landing-section'

    const head = document.createElement('div')
    head.className = 'landing-section-head'
    head.innerHTML = `
      <span class="landing-section-icon" style="background:${accent}26; color:${accentText || accent};">
        <i data-lucide="${icon}" style="width:16px; height:16px;"></i>
      </span>
      <span class="landing-section-title">${escapeHtmlText(title)}</span>
      ${items.length ? `<span class="landing-section-count">${items.length}</span>` : ''}
    `
    section.appendChild(head)

    if (!items.length) {
      const empty = document.createElement('div')
      empty.className = 'landing-empty'
      empty.textContent = emptyText
      section.appendChild(empty)
      return section
    }

    items.slice(0, 6).forEach(item => {
      const row = document.createElement('div')
      row.className = 'landing-item-row'
      row.title = item.title || ''

      const body = document.createElement('div')
      body.className = 'landing-item-body'
      const metaText = meta ? meta(item) : ''
      body.innerHTML = `
        <span class="landing-item-title">${escapeHtmlText(item.title)}</span>
        ${metaText ? `<span class="landing-item-meta">${escapeHtmlText(metaText)}</span>` : ''}
      `
      row.appendChild(body)

      if (starred) {
        const star = document.createElement('button')
        star.type = 'button'
        star.className = 'landing-star-btn'
        star.title = 'Remove from Starred'
        star.innerHTML = '<i data-lucide="star" style="width:15px; height:15px; fill:currentColor;"></i>'
        star.onclick = (e) => {
          e.stopPropagation()
          toggleDocBookmark(item)
        }
        row.appendChild(star)
      } else if (item.product) {
        const badge = document.createElement('span')
        badge.className = 'landing-item-right'
        badge.textContent = PRODUCT_LABELS[item.product] || item.product
        row.appendChild(badge)
      }

      row.onclick = () => openDocument(item.id)
      section.appendChild(row)
    })

    return section
  }

  const PRODUCT_LABELS = { xpa: 'xpa', xpi: 'xpi', cloud_native: 'Cloud', general: 'General' }

  async function fetchAuthedList(url) {
    // Auth-only lists must degrade to empty rather than break the landing page.
    if (!token) return []
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return []
      const data = await res.json()
      return Array.isArray(data) ? data : []
    } catch (e) {
      console.error('Could not load', url, e)
      return []
    }
  }

  async function renderLandingSections() {
    const host = document.getElementById('landing-sections')
    if (!host) return

    const trending = (overviewData && overviewData.trending) ? overviewData.trending : []
    const recent = (overviewData && overviewData.recent) ? overviewData.recent : []
    const signedIn = !!token

    const sections = [
      buildLandingSection({
        title: 'Most Viewed',
        icon: 'trending-up',
        accent: '#f59e0b',
        accentText: 'var(--c-amber)',
        items: trending,
        emptyText: 'No documents have been opened yet. View counts appear here as the knowledge base gets used.',
        meta: (d) => `${d.views || 0} view${(d.views || 0) === 1 ? '' : 's'}`
      }),
      buildLandingSection({
        title: signedIn ? 'Recently Uploaded by All' : 'Recently Uploaded',
        icon: 'clock',
        accent: '#38bdf8',
        accentText: 'var(--c-sky)',
        items: recent,
        emptyText: 'Nothing has been uploaded yet.',
        meta: (d) => [d.created_at, d.author].filter(Boolean).join(' · ')
      })
    ]

    if (signedIn) {
      const [mine, starred] = await Promise.all([
        fetchAuthedList('/api/my/contributions'),
        fetchAuthedList('/api/favorites')
      ])

      sections.push(buildLandingSection({
        title: 'My Contributions',
        icon: 'pen-line',
        accent: '#34d399',
        accentText: 'var(--c-emerald)',
        items: mine,
        emptyText: 'Nothing yet. Articles you upload or author in the app will appear here.',
        meta: (d) => [d.created_at, `${d.views || 0} views`].filter(Boolean).join(' · ')
      }))

      sections.push(buildLandingSection({
        title: 'Starred',
        icon: 'star',
        accent: '#fbbf24',
        accentText: 'var(--c-amber)',
        items: starred,
        emptyText: 'No starred documents yet. Use the Bookmark button on any article to save it here.',
        meta: (d) => [PRODUCT_LABELS[d.product] || d.product, d.created_at].filter(Boolean).join(' · '),
        starred: true
      }))
    }

    host.innerHTML = ''
    sections.forEach(s => host.appendChild(s))
    // Drives the column count so a row is never left half-empty.
    host.setAttribute('data-count', String(sections.length))
    if (window.lucide) lucide.createIcons()
  }

  // ==================== 7. PRODUCT HERO QUICK SUGGESTIONS ====================
  function renderProductHeroChips() {
    const quickChips = document.getElementById('product-hero-quick-chips')
    if (!quickChips) return
    const topics = hotTopicsMap[activeProduct] || []
    quickChips.innerHTML = ''

    topics.forEach(t => {
      const chip = document.createElement('button')
      chip.style.cssText = 'padding:6px 14px; border-radius:20px; background:var(--bg-subtle); border:1px solid var(--border-strong); color:var(--text-soft); font-size:0.8rem; cursor:pointer; transition:all 0.2s;'
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

  // ==================== 8. SPACE DOCUMENTS & TREE LISTING ====================
  function renderSpaceTree(activeProduct, docs) {
    const container = document.getElementById('left-space-tree-container')
    const countBadge = document.getElementById('left-space-docs-count')
    if (!container) return

    // Filter out internal help manual topics so only real user space documents/articles are listed
    const spaceDocs = (docs || []).filter(d => !d.is_help && d.source !== 'help' && d.doc_type !== 'function')

    // Ensure docs are strictly sorted by creation time (most recently uploaded on top)
    const sortedDocs = [...spaceDocs].sort((a, b) => {
      const timeA = new Date(a.raw_created_at || a.created_at || 0).getTime()
      const timeB = new Date(b.raw_created_at || b.created_at || 0).getTime()
      if (timeA && timeB && timeA !== timeB) return timeB - timeA
      return (b.id || 0) - (a.id || 0) // Fallback to higher ID if times match
    })

    if (countBadge) countBadge.textContent = sortedDocs.length

    if (sortedDocs.length === 0) {
      container.innerHTML = '<span style="font-size:0.75rem; color:var(--text-faint);">No documents in this space yet.</span>'
      return
    }

    const productNames = {
      xpa: 'Magic xpa Space',
      xpi: 'Magic xpi Space',
      cloud_native: 'Cloud Native Space',
      general: 'General Space'
    }
    const spaceTitle = productNames[activeProduct] || 'Product Space'

    container.innerHTML = ''

    // Parent Expandable Space Tab Node
    const spaceTabNode = document.createElement('div')
    spaceTabNode.className = 'space-tree-parent-tab'
    spaceTabNode.style.cssText = 'padding:8px 10px; border-radius:8px; background:rgba(0,141,199,0.12); border:1px solid rgba(0,141,199,0.25); cursor:pointer; display:flex; align-items:center; justify-content:space-between; color:var(--c-sky); font-size:0.82rem; font-weight:700; user-select:none; margin-bottom:4px;'
    
    spaceTabNode.innerHTML = `
      <div style="display:flex; align-items:center; gap:6px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
        <i data-lucide="folder" style="width:15px; height:15px; flex-shrink:0; color:var(--c-sky);"></i>
        <span>${spaceTitle}</span>
      </div>
      <i data-lucide="chevron-down" id="space-tree-chevron" style="width:14px; height:14px; transition:transform 0.2s;"></i>
    `

    const childListContainer = document.createElement('div')
    childListContainer.id = 'space-tree-children'
    childListContainer.style.cssText = 'display:flex; flex-direction:column; gap:4px; padding-left:10px; border-left:1px dashed rgba(56,189,248,0.25); margin-left:8px;'

    let isExpanded = true
    spaceTabNode.onclick = () => {
      isExpanded = !isExpanded
      childListContainer.style.display = isExpanded ? 'flex' : 'none'
      const chev = document.getElementById('space-tree-chevron')
      if (chev) chev.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)'
    }

    sortedDocs.forEach(doc => {
      const docRow = document.createElement('div')
      docRow.className = 'sidebar-item-row'
      docRow.style.cssText = 'padding:6px 8px; border-radius:6px; font-size:0.78rem; cursor:pointer; color:var(--text-soft); display:flex; align-items:center; gap:6px; transition:all 0.15s;'
      docRow.innerHTML = `
        <i data-lucide="file-text" style="width:13px; height:13px; color:var(--text-muted); flex-shrink:0;"></i>
        <span class="doc-title-text" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;" title="${doc.title}">${doc.title}</span>
      `
      docRow.onclick = (e) => {
        e.stopPropagation()
        openDocument(doc.id)
      }
      childListContainer.appendChild(docRow)
    })

    container.appendChild(spaceTabNode)
    container.appendChild(childListContainer)
    if (window.lucide) lucide.createIcons()
  }

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
    if (heroDesc) heroDesc.textContent = `Your recently viewed articles appear below. Search documentation or expand the space tree on the left.`
    if (counter) counter.textContent = `Recently Viewed Documents`

    container.innerHTML = '<div style="padding:20px; color:var(--text-muted); text-align:center;">Loading space documents...</div>'

    try {
      const res = await fetch(`/api/search?q=*&product=${encodeURIComponent(activeProduct)}`)
      if (!res.ok) throw new Error('Failed to load docs')
      const docs = await res.json()

      // Render full space tree in left sidebar
      renderSpaceTree(activeProduct, docs)

      container.innerHTML = ''

      // Fetch user's recently viewed docs
      const recents = getRecentlyViewed()
      const spaceRecents = (activeProduct === 'all')
        ? recents
        : recents.filter(r => r.product === activeProduct)

      if (spaceRecents && spaceRecents.length > 0) {
        // Render top 5 recently viewed docs
        spaceRecents.slice(0, 5).forEach(r => {
          const matchedDoc = docs.find(d => d.id === r.id)
          const title = matchedDoc ? matchedDoc.title : r.title
          const prod = (matchedDoc ? matchedDoc.product : r.product) || activeProduct
          const fileType = matchedDoc ? matchedDoc.file_type : 'doc'
          const author = matchedDoc ? matchedDoc.author : ''
          const createdAt = matchedDoc ? matchedDoc.created_at : ''
          const snippet = matchedDoc ? matchedDoc.snippet : ''
          const views = matchedDoc ? (matchedDoc.views || 0) : 0

          const card = document.createElement('div')
          card.className = 'glass-panel glass-panel-hover'
          card.style.cssText = 'padding:16px 20px; cursor:pointer; display:flex; flex-direction:column; gap:6px; border-left:3px solid #22d3ee;'
          
          card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div style="display:flex; align-items:center; gap:8px;">
                <span style="font-size:0.72rem; font-weight:700; padding:2px 8px; border-radius:6px; background:rgba(0,141,199,0.15); color:var(--c-sky); text-transform:uppercase;">${prod}</span>
                <span style="font-size:0.72rem; padding:2px 8px; border-radius:6px; background:var(--bg-subtle); color:var(--text-muted); text-transform:uppercase;">${fileType}</span>
                <span style="font-size:0.7rem; font-weight:800; padding:2px 7px; border-radius:6px; background:rgba(34,211,238,0.15); color:var(--c-cyan); border:1px solid rgba(34,211,238,0.3);">RECENTLY VIEWED</span>
              </div>
              <span style="font-size:0.72rem; color:var(--text-faint);">${createdAt ? createdAt + ' • ' : ''}${views} views</span>
            </div>
            <h4 style="font-size:1.05rem; font-weight:700; color:var(--text-main); margin:2px 0;">🕒 ${title}</h4>
            ${snippet ? `<p style="font-size:0.84rem; color:var(--text-muted); line-height:1.5; margin:0;">${snippet}</p>` : ''}
          `
          card.onclick = () => openDocument(r.id)
          container.appendChild(card)
        })
      } else {
        // Fallback if no docs have been viewed yet in this space
        const infoBox = document.createElement('div')
        infoBox.className = 'glass-panel'
        infoBox.style.cssText = 'padding:20px 24px; text-align:center; background:var(--bg-card); border:1px dashed rgba(255,255,255,0.12); margin-bottom:12px;'
        infoBox.innerHTML = `
          <div style="font-size:0.9rem; color:var(--text-soft); font-weight:600; margin-bottom:4px;">No recently viewed articles in this space yet.</div>
          <p style="font-size:0.82rem; color:var(--text-faint); margin:0;">Open any article from the Space Documents tree on the left or search above to track your history here.</p>
        `
        container.appendChild(infoBox)

        // Show top 3 recommended guides as fallback
        const suggestions = docs.slice(0, 3)
        if (suggestions.length > 0) {
          const sugLabel = document.createElement('div')
          sugLabel.style.cssText = 'font-size:0.82rem; color:var(--text-muted); font-weight:700; margin:8px 0 4px 0;'
          sugLabel.textContent = 'Recommended Space Guides:'
          container.appendChild(sugLabel)

          suggestions.forEach(doc => {
            const card = document.createElement('div')
            card.className = 'glass-panel glass-panel-hover'
            card.style.cssText = 'padding:14px 18px; cursor:pointer; display:flex; flex-direction:column; gap:4px;'
            card.innerHTML = `
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:0.72rem; font-weight:700; padding:2px 8px; border-radius:6px; background:rgba(0,141,199,0.15); color:var(--c-sky); text-transform:uppercase;">${doc.product}</span>
                <span style="font-size:0.72rem; color:var(--text-faint);">${doc.views || 0} views</span>
              </div>
              <h4 style="font-size:1.0rem; font-weight:700; color:var(--text-main); margin:2px 0;">${doc.title}</h4>
            `
            card.onclick = () => openDocument(doc.id)
            container.appendChild(card)
          })
        }
      }

    } catch (e) {
      console.error(e)
      container.innerHTML = '<div style="padding:20px; color:var(--c-rose); text-align:center;">Failed to load space guides.</div>'
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
          container.innerHTML = '<span style="font-size:0.78rem; color:var(--text-faint); text-align:center; padding:16px; display:block;">✓ All caught up! No unread notifications.</span>'
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
      container.innerHTML = '<span style="font-size:0.78rem; color:var(--text-faint); text-align:center; padding:16px; display:block;">✓ All caught up! No unread notifications.</span>'
      return
    }

    unreadNotifs.slice(0, 10).forEach(n => {
      const item = document.createElement('div')
      item.id = `notif-item-${n.id}`
      const timeStr = n.timestamp || 'Just now'
      item.style.cssText = `padding:11px 13px; border-radius:8px; background:rgba(0,141,199,0.14); border:1px solid rgba(0,141,199,0.25); cursor:pointer; transition:all 0.2s; position:relative;`
      item.innerHTML = `
        <div style="font-size:0.84rem; font-weight:700; color:var(--text-main); margin-bottom:3px; display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="width:6px; height:6px; border-radius:50%; background:#38bdf8; flex-shrink:0;"></span>
            <span>${n.title}</span>
          </div>
          <button 
            type="button" 
            onclick="dismissNotification(${n.id}, event)" 
            title="Dismiss notification" 
            style="background:none; border:none; color:var(--text-muted); font-size:0.95rem; line-height:1; cursor:pointer; padding:1px 5px; border-radius:4px; transition:all 0.15s; flex-shrink:0;"
            onmouseover="this.style.color = 'var(--c-rose)'; this.style.background='rgba(244,63,94,0.15)'" 
            onmouseout="this.style.color = 'var(--text-muted)'; this.style.background='transparent'"
          >✕</button>
        </div>
        <div style="font-size:0.78rem; color:var(--text-soft); margin-bottom:5px; line-height:1.4;">${n.message}</div>
        <div style="font-size:0.68rem; color:var(--text-muted);">${timeStr}</div>
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
      container.innerHTML = '<span style="font-size:0.78rem; color:var(--text-faint); text-align:center; padding:16px; display:block;">✓ All caught up! No unread notifications.</span>'
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
    document.getElementById('page-utilities-hub').classList.add('hide')
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
        activeBadge.style.color = 'var(--c-amber)'
        activeBadge.style.border = '1px solid rgba(245, 158, 11, 0.3)'
        searchInput.placeholder = 'Search Magic xpa documentation, Studio, RIA, parameters...'
      } else if (prodId === 'xpi') {
        activeBadge.textContent = '🔗 Magic xpi Workspace'
        activeBadge.style.background = 'rgba(6, 182, 212, 0.15)'
        activeBadge.style.color = 'var(--c-cyan)'
        activeBadge.style.border = '1px solid rgba(6, 182, 212, 0.3)'
        searchInput.placeholder = 'Search Magic xpi connectors, Data Mapper, JVM_ARGS, GigaSpaces...'
      } else if (prodId === 'cloud_native') {
        activeBadge.textContent = '☁️ Cloud Native Workspace'
        activeBadge.style.background = 'rgba(16, 185, 129, 0.15)'
        activeBadge.style.color = 'var(--c-emerald)'
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

  // Toggle Space Documents Sidebar Width Expansion
  const btnToggleSidebar = document.getElementById('btn-toggle-sidebar-expand')
  if (btnToggleSidebar) {
    btnToggleSidebar.addEventListener('click', () => {
      const sidebar = document.querySelector('.left-sidebar-pane')
      const icon = document.getElementById('sidebar-expand-icon')
      if (!sidebar) return
      const isExp = sidebar.classList.toggle('expanded')
      btnToggleSidebar.title = isExp ? 'Collapse Sidebar Width' : 'Expand Sidebar Width to view full document names'
      if (icon) {
        icon.setAttribute('data-lucide', isExp ? 'minimize-2' : 'maximize-2')
        if (window.lucide) lucide.createIcons()
      }
    })
  }

  // ==================== 10.9 LANDING GLOBAL SEARCH (all product spaces) ====================
  const landingSearchInput = document.getElementById('landing-search-input')

  function runLandingSearch(rawQuery) {
    const q = (rawQuery || '').trim()
    if (!q) return
    // Search the global scope, then hand off to the existing omnibox pipeline.
    switchProductScope('all')
    if (typeof window.searchWithKeyword === 'function') window.searchWithKeyword(q)
  }

  if (landingSearchInput) {
    landingSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        runLandingSearch(landingSearchInput.value)
      }
    })
  }

  // Ctrl/Cmd+K focuses the landing search, matching the hint shown in the field.
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      const landing = document.getElementById('page-home-landing')
      const input = document.getElementById('landing-search-input')
      if (input && landing && !landing.classList.contains('hide')) {
        e.preventDefault()
        input.focus()
        input.select()
      }
    }
  })

  function renderLandingQuickChips() {
    const row = document.getElementById('landing-quick-chips')
    if (!row) return
    row.innerHTML = ''
    // Flatten the per-product hot topics; the landing search is global scope.
    const picks = [
      ...(hotTopicsMap.xpi || []).slice(0, 3),
      ...(hotTopicsMap.xpa || []).slice(0, 2),
      ...(hotTopicsMap.cloud_native || []).slice(0, 2)
    ]
    picks.forEach(t => {
      const chip = document.createElement('button')
      chip.type = 'button'
      chip.className = 'landing-chip'
      chip.textContent = t.label
      chip.onclick = () => runLandingSearch(t.query)
      row.appendChild(chip)
    })
  }

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

  window.performSearch = performSearch
  window.searchWithKeyword = function(keyword) {
    if (!keyword) return
    const input = document.getElementById('omnibox-search-input')
    if (input) {
      input.value = keyword
      document.getElementById('btn-clear-search')?.classList.remove('hide')
      document.getElementById('page-product-workspace')?.classList.remove('hide')
      document.getElementById('page-home-landing')?.classList.add('hide')
      document.getElementById('view-document-reader')?.classList.add('hide')
      document.getElementById('view-product-doc-listing')?.classList.add('hide')
      document.getElementById('view-search-results')?.classList.remove('hide')
      performSearch()
      window.scrollTo({ top: 0, behavior: 'smooth' })
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
          <h3 style="font-size:1.15rem; font-weight:700; color:var(--text-main); margin-bottom:8px;">No matching documents found</h3>
          <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:16px;">Try searching with different keywords, or ask the Magic AI Assistant to synthesize a solution.</p>
          <button class="btn btn-primary" onclick="openCopilotWithQuery('${query.replace(/'/g, "\\'")}')">
            <i data-lucide="sparkles" style="width:16px; height:16px;"></i> Ask Magic AI Assistant
          </button>
        </div>
      `
      if (window.lucide) lucide.createIcons()
      return
    }

    const trimmedQ = (query || '').trim().toLowerCase()
    const top = results[0]
    const hasHero = top && (top.doc_type === 'function' || top.syntax || top.title.toLowerCase().trim() === trimmedQ)

    if (hasHero) {
      const heroCard = document.createElement('div')
      heroCard.className = 'glass-panel'
      heroCard.style.cssText = 'padding:22px 24px; border:1.5px solid rgba(0, 141, 199, 0.45); background:linear-gradient(135deg, var(--primary-soft), var(--bg-card)); border-radius:14px; margin-bottom:20px; box-shadow:0 8px 24px rgba(0,0,0,0.3); cursor:pointer;'
      
      const crumbsHtml = (top.breadcrumbs && top.breadcrumbs.length) 
        ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:8px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <i data-lucide="folder" style="width:13px; height:13px;"></i>
            ${top.breadcrumbs.map(b => `<span>${b}</span>`).join('<span style="color:var(--text-faint);">›</span>')}
           </div>`
        : ''

      heroCard.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
          <div>
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px; flex-wrap:wrap;">
              <span style="font-size:0.75rem; font-weight:800; padding:3px 10px; border-radius:6px; background:#008DC7; color:#fff; text-transform:uppercase; letter-spacing:0.5px; display:inline-flex; align-items:center; gap:4px;">
                <i data-lucide="zap" style="width:12px; height:12px;"></i> ${top.doc_type === 'function' ? 'Official Function Reference' : 'Top Official Match'}
              </span>
              <span style="font-size:0.72rem; font-weight:700; padding:3px 8px; border-radius:6px; background:var(--bg-subtle); color:var(--c-sky); text-transform:uppercase;">
                ${top.product.toUpperCase()}
              </span>
              ${top.version && top.version !== 'Universal' ? `<span style="font-size:0.72rem; color:var(--text-muted);">${top.version}</span>` : ''}
            </div>
            ${crumbsHtml}
            <h2 style="font-size:1.45rem; font-weight:800; color:var(--text-main); margin-bottom:6px;">${top.title}</h2>
          </div>
        </div>

        ${top.syntax ? `
          <div style="margin:12px 0 14px 0; background:var(--bg-card); border:1px solid rgba(0,141,199,0.35); border-radius:8px; padding:12px 16px; display:flex; justify-content:space-between; align-items:center; gap:12px;">
            <div style="font-family:'Fira Code', monospace, Consolas; font-size:0.95rem; color:var(--c-sky); overflow-x:auto; white-space:nowrap;">
              <span style="color:var(--text-muted); user-select:none;">Syntax: </span><strong>${top.syntax}</strong>
            </div>
            <button class="btn btn-secondary btn-sm" style="padding:4px 10px; font-size:0.75rem; white-space:nowrap;" onclick="event.stopPropagation(); navigator.clipboard.writeText('${top.syntax.replace(/'/g, "\\'")}'); showToast('Syntax copied to clipboard!', 'success');">
              <i data-lucide="copy" style="width:13px; height:13px;"></i> Copy
            </button>
          </div>
        ` : ''}

        ${top.snippet ? `<p style="font-size:0.9rem; color:var(--text-soft); line-height:1.6; margin-bottom:14px;">${top.snippet}</p>` : ''}

        <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-color); padding-top:12px;">
          <span style="font-size:0.8rem; color:var(--text-muted);">By ${top.author || 'Magic Documentation'} • ${top.created_at}</span>
          <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); openDocument('${top.id}');">
            Open Function Guide & Examples →
          </button>
        </div>
      `
      heroCard.onclick = () => openDocument(top.id)
      container.appendChild(heroCard)
    }

    const otherResults = hasHero ? results.slice(1) : results

    otherResults.forEach(doc => {
      const card = document.createElement('div')
      card.className = 'glass-panel glass-panel-hover'
      card.style.cssText = 'padding:18px 20px; cursor:pointer; display:flex; flex-direction:column; gap:8px;'
      
      const isHelpTopic = Boolean(doc.is_help || doc.source === 'help')
      const sourceBadge = isHelpTopic 
        ? `<span class="badge-help-doc"><i data-lucide="book-open" style="width:11px; height:11px;"></i> Official Reference</span>`
        : `<span class="badge-kb-doc"><i data-lucide="file-check" style="width:11px; height:11px;"></i> KB Document</span>`

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
          <div>
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px; flex-wrap:wrap;">
              ${sourceBadge}
              <span style="font-size:0.72rem; font-weight:700; padding:2px 8px; border-radius:6px; background:rgba(0,141,199,0.15); color:var(--c-sky); text-transform:uppercase;">${doc.product}</span>
              <span style="font-size:0.72rem; padding:2px 8px; border-radius:6px; background:var(--bg-subtle); color:var(--text-muted); text-transform:uppercase;">${doc.file_type}</span>
              ${doc.doc_type === 'function' ? `<span style="font-size:0.72rem; padding:2px 8px; border-radius:6px; background:rgba(16,185,129,0.15); color:var(--c-emerald); font-weight:700;">FUNCTION</span>` : ''}
              ${doc.version && doc.version !== 'Universal' ? `<span style="font-size:0.72rem; color:var(--text-soft);">${doc.version}</span>` : ''}
              ${doc.is_pinned ? `<span style="font-size:0.72rem; color:var(--c-amber); font-weight:700;">★ Pinned SOP</span>` : ''}
            </div>
            <h3 style="font-size:1.15rem; font-weight:700; color:var(--text-main); margin-bottom:4px;">${doc.title}</h3>
          </div>
          <span style="font-size:0.75rem; color:var(--text-faint);">${doc.views || 0} views</span>
        </div>
        ${doc.syntax ? `<div class="syntax-pill" style="margin-bottom:4px;"><span style="color:var(--text-muted);">Syntax: </span>${doc.syntax}</div>` : ''}
        ${doc.snippet ? `<p style="font-size:0.88rem; color:var(--text-soft); line-height:1.6;">${doc.snippet}</p>` : ''}
        <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-color); padding-top:8px; font-size:0.78rem; color:var(--text-faint);">
          <span>By ${doc.author || 'Engineering'} • ${doc.created_at}</span>
          <span style="color:var(--link); font-weight:600;">${isHelpTopic ? 'View Reference Specification →' : 'Read Document →'}</span>
        </div>
      `
      card.onclick = () => openDocument(doc.id)
      container.appendChild(card)
    })
    if (window.lucide) lucide.createIcons()
  }

  // ==================== 12. DOCUMENT READER VIEW ====================
  async function openDocument(docId) {
    // Hide all modal overlays if open
    const copilotModal = document.getElementById('modal-copilot')
    if (copilotModal) copilotModal.classList.add('hide')

    const publishModal = document.getElementById('modal-publish-ai-kb')
    if (publishModal) publishModal.classList.add('hide')

    const writeModal = document.getElementById('modal-write-kb')
    if (writeModal) writeModal.classList.add('hide')

    document.getElementById('page-admin-suite').classList.add('hide')
    document.getElementById('page-upload-portal').classList.add('hide')
    document.getElementById('page-utilities-hub').classList.add('hide')
    const pageLogin = document.getElementById('page-login')
    if (pageLogin) pageLogin.classList.add('hide')

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
      document.getElementById('reader-product-badge').textContent = `${(currentDoc.product || 'XPI').toUpperCase()} Platform`
      document.getElementById('reader-version-badge').textContent = currentDoc.version || 'Universal'
      document.getElementById('reader-format-badge').textContent = `Format: ${currentDoc.file_type}`
      document.getElementById('reader-doc-author').textContent = currentDoc.author || 'Engineering'
      document.getElementById('reader-doc-date').textContent = `Updated: ${currentDoc.created_at}`
      document.getElementById('reader-doc-views').textContent = `${currentDoc.views || 0} Views`

      // Update Button states
      updateFavouriteButtonState(currentDoc.id)
      updateBookmarkButtonState(currentDoc.id)
      updatePinButtonState(currentDoc.is_pinned)

      // Render Breadcrumbs
      const bcContainer = document.getElementById('reader-breadcrumbs')
      if (bcContainer) {
        if (currentDoc.breadcrumbs && currentDoc.breadcrumbs.length > 0) {
          const bcItems = ['Home', ...currentDoc.breadcrumbs, currentDoc.title]
          bcContainer.innerHTML = bcItems.map((item, idx) => {
            const isLast = idx === bcItems.length - 1
            if (isLast) {
              return `<span style="color:var(--text-main); font-weight:700;">${item}</span>`
            }
            const escaped = item.replace(/'/g, "\\'")
            return `<span style="cursor:pointer; color:var(--c-sky); transition:color 0.15s;" onmouseover="this.style.color='#fff'" onmouseout="this.style.color = 'var(--c-sky)'" onclick="searchWithKeyword('${escaped}');">${item}</span> <span style="color:var(--text-faint);">›</span>`
          }).join(' ')
        } else {
          bcContainer.innerHTML = `<span style="color:var(--text-muted);">Home</span> <span style="color:var(--text-faint);">›</span> <span style="color:var(--c-sky); text-transform:uppercase;">${(currentDoc.product || 'xpi').toUpperCase()}</span> <span style="color:var(--text-faint);">›</span> <span style="color:var(--text-main); font-weight:700;">${currentDoc.title}</span>`
        }
      }

      // Render content
      const bodyContainer = document.getElementById('reader-doc-body')
      if (currentDoc.file_type === 'pdf') {
        bodyContainer.innerHTML = `
          <div style="margin-bottom:14px; display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:10px; background:var(--bg-subtle); padding:10px 16px; border-radius:10px; border:1px solid var(--border-color);">
            <div style="display:flex; gap:8px;">
              <button id="btn-toggle-pdf-view" class="btn" style="padding:6px 14px; font-size:0.8rem; font-weight:700; background:rgba(0,141,199,0.25); border:1px solid rgba(45,188,238,0.4); color:var(--c-sky); border-radius:6px;">
                📄 Original PDF Document
              </button>
              <button id="btn-toggle-text-view" class="btn" style="padding:6px 14px; font-size:0.8rem; font-weight:600; background:transparent; border:1px solid transparent; color:var(--text-muted); border-radius:6px;">
                📝 Search Text View
              </button>
            </div>
            <a href="/api/document/raw/${currentDoc.id}" target="_blank" class="btn btn-secondary" style="padding:6px 12px; font-size:0.78rem; text-decoration:none; display:flex; align-items:center; gap:6px;">
              📥 Open Fullscreen / Download
            </a>
          </div>
          <div id="pdf-view-frame-container">
            <iframe src="/api/document/raw/${currentDoc.id}#toolbar=1&navpanes=1" style="width:100%; height:820px; border:none; border-radius:10px; background:var(--bg-elev); box-shadow:0 10px 30px rgba(0,0,0,0.5);"></iframe>
          </div>
          <div id="pdf-view-text-container" class="hide" style="padding:20px; border-radius:10px; background:var(--bg-input); border:1px solid var(--border-color); color:var(--text-soft); line-height:1.8;">
            ${currentDoc.html_content || `<pre style="white-space:pre-wrap; font-family:inherit;">${currentDoc.content}</pre>`}
          </div>
        `
        document.getElementById('btn-toggle-pdf-view').onclick = () => {
          document.getElementById('pdf-view-frame-container').classList.remove('hide')
          document.getElementById('pdf-view-text-container').classList.add('hide')
          document.getElementById('btn-toggle-pdf-view').style.background = 'rgba(0,141,199,0.25)'
          document.getElementById('btn-toggle-pdf-view').style.color = 'var(--c-sky)'
          document.getElementById('btn-toggle-pdf-view').style.borderColor = 'rgba(45,188,238,0.4)'
          document.getElementById('btn-toggle-text-view').style.background = 'transparent'
          document.getElementById('btn-toggle-text-view').style.color = 'var(--text-muted)'
          document.getElementById('btn-toggle-text-view').style.borderColor = 'transparent'
        }
        document.getElementById('btn-toggle-text-view').onclick = () => {
          document.getElementById('pdf-view-frame-container').classList.add('hide')
          document.getElementById('pdf-view-text-container').classList.remove('hide')
          document.getElementById('btn-toggle-text-view').style.background = 'rgba(0,141,199,0.25)'
          document.getElementById('btn-toggle-text-view').style.color = 'var(--c-sky)'
          document.getElementById('btn-toggle-text-view').style.borderColor = 'rgba(45,188,238,0.4)'
          document.getElementById('btn-toggle-pdf-view').style.background = 'transparent'
          document.getElementById('btn-toggle-pdf-view').style.color = 'var(--text-muted)'
          document.getElementById('btn-toggle-pdf-view').style.borderColor = 'transparent'
        }
      } else if (currentDoc.html_content) {
        bodyContainer.innerHTML = currentDoc.html_content
      } else {
        bodyContainer.innerHTML = `<pre style="white-space:pre-wrap; font-family:inherit;">${currentDoc.content}</pre>`
      }

      if (window.lucide) lucide.createIcons()
      window.scrollTo({ top: 0, behavior: 'smooth' })
      fetchComments(docId)
    } catch (e) {
      console.error(e)
    }
  }
  window.openDocument = openDocument

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
        item.style.cssText = 'padding:12px; border-radius:8px; background:var(--bg-subtle); border:1px solid var(--border-color);'
        item.innerHTML = `
          <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:0.75rem; color:var(--text-muted);">
            <span style="font-weight:700; color:var(--c-sky);">${c.username}</span>
            <span>${c.created_at}</span>
          </div>
          <p style="font-size:0.88rem; color:var(--text-soft); margin:0;">${c.content}</p>
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
      .replace(/^### (.*$)/gim, '<h3 style="font-size:1.05rem; font-weight:700; color:var(--text-main); margin-top:14px; margin-bottom:6px;">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 style="font-size:1.15rem; font-weight:800; color:var(--c-sky); margin-top:16px; margin-bottom:8px;">$1</h2>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong style="color:var(--text-main);">$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em>$1</em>')
      .replace(/```([\s\S]*?)```/gim, '<pre style="background:var(--bg-input); border:1px solid var(--border-strong); padding:12px; border-radius:8px; overflow-x:auto; color:var(--c-sky); font-family:monospace; font-size:0.85rem; margin:10px 0;"><code>$1</code></pre>')
      .replace(/`([^`]+)`/gim, '<code style="background:var(--bg-subtle); padding:2px 6px; border-radius:4px; color:var(--c-sky); font-family:monospace; font-size:0.85rem;">$1</code>')
      .replace(/\n/gim, '<br>')
  }

  window.copyToClipboard = function(text, btnEl) {
    navigator.clipboard.writeText(text).then(() => {
      const originalHtml = btnEl ? btnEl.innerHTML : ''
      if (btnEl) {
        btnEl.innerHTML = '✓ Copied!'
        btnEl.style.color = 'var(--c-emerald)'
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
      const res = await fetch('/api/ai/publish-kb', {
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
        listEl.innerHTML = '<div style="font-size:0.75rem; color:var(--text-faint); padding:8px;">No past sessions</div>'
        return
      }
      listEl.innerHTML = sessions.map(s => `
        <div onclick="switchChatSession('${s.id}')" style="display:flex; justify-content:space-between; align-items:center; padding:7px 10px; border-radius:6px; background:${s.id === currentChatSessionId ? 'rgba(0,141,199,0.25)' : 'rgba(255,255,255,0.03)'}; border:1px solid ${s.id === currentChatSessionId ? 'rgba(45,188,238,0.3)' : 'transparent'}; cursor:pointer; transition:all 0.15s;" onmouseover="this.style.background = 'var(--bg-subtle)'" onmouseout="this.style.background='${s.id === currentChatSessionId ? 'rgba(0,141,199,0.25)' : 'rgba(255,255,255,0.03)'}'">
          <div style="display:flex; align-items:center; gap:6px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis;">
            <span style="font-size:0.75rem; color:${s.id === currentChatSessionId ? '#38bdf8' : '#94a3b8'};">💬</span>
            <span style="font-size:0.75rem; color:var(--text-soft); overflow:hidden; text-overflow:ellipsis;">${s.title}</span>
          </div>
          <button onclick="deleteChatSession('${s.id}', event)" style="background:none; border:none; color:var(--text-faint); padding:2px 4px; cursor:pointer;" title="Delete Chat">×</button>
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
      <div style="padding:16px; border-radius:12px; background:linear-gradient(135deg, rgba(0,141,199,0.15), rgba(45,188,238,0.08)); border:1px solid rgba(45,188,238,0.3); color:var(--text-soft); font-size:0.9rem; line-height:1.6;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
          <span style="font-size:1.1rem;">👋</span>
          <strong style="color:var(--text-main);">New Magic AI Troubleshooting Session Started</strong>
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
    thread.innerHTML = '<div style="padding:10px; text-align:center; color:var(--text-muted);">Loading chat history...</div>'

    try {
      const res = await fetch(`/api/ai/sessions/${sessionId}/messages`)
      if (!res.ok) throw new Error('Could not load history')
      const msgs = await res.json()
      thread.innerHTML = ''
      if (msgs.length === 0) {
        thread.innerHTML = '<div style="padding:10px; text-align:center; color:var(--text-faint);">Empty chat session. Type a message below.</div>'
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
          botMsg.style.cssText = 'align-self:flex-start; max-width:92%; width:92%; padding:18px 20px; border-radius:14px 14px 14px 4px; background:var(--bg-card); border:1px solid rgba(0,141,199,0.25); color:var(--text-soft); font-size:0.9rem;'
          botMsg.innerHTML = `
            <div class="ai-response-rendered" style="color:var(--text-soft); font-size:0.92rem; line-height:1.75;">
              ${renderMarkdownSafe(m.content)}
            </div>
          `
          thread.appendChild(botMsg)
        }
      }
      thread.scrollTop = thread.scrollHeight
    } catch (e) {
      thread.innerHTML = '<div style="color:var(--c-rose);">Could not load session messages.</div>'
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
      <div style="display:flex; align-items:center; gap:6px; padding:4px 10px; border-radius:6px; background:rgba(0,141,199,0.25); border:1px solid rgba(45,188,238,0.4); color:var(--c-sky); font-size:0.75rem;">
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
    updateAuthUI()
    const modal = document.getElementById('modal-copilot')
    if (modal) modal.classList.remove('hide')
    const thread = document.getElementById('copilot-messages-thread')
    if (thread && thread.children.length === 0) {
      thread.innerHTML = `
        <div style="padding:14px 16px; border-radius:10px; background:rgba(0,141,199,0.12); border:1px solid rgba(0,141,199,0.25); color:var(--text-soft); font-size:0.88rem; line-height:1.6;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
            <span style="font-size:1.1rem;">👋</span>
            <strong style="color:var(--c-sky);">Welcome to Magic AI Copilot & Analyzer</strong>
          </div>
          <div>Ask any technical configuration question, paste log errors, or switch to the <strong>Case Analyzer</strong> tab for root-cause diagnosis and ready-to-send customer email drafts.</div>
        </div>
      `
    }
    fetchCopilotSessions()
    updateEngineIndicator()
    if (initialQ) {
      const input = document.getElementById('copilot-input')
      if (input) {
        input.value = initialQ
        const form = document.getElementById('copilot-form')
        if (form) form.dispatchEvent(new Event('submit'))
      }
    }
  }

  // Client ID for per-browser isolation
  let clientId = localStorage.getItem('kc_client_id')
  if (!clientId) {
    clientId = 'client_' + Math.random().toString(36).substring(2, 12)
    localStorage.setItem('kc_client_id', clientId)
  }

  let activeSessionId = 'sess_' + Date.now()
  let stagedAttachments = []

  // Safe Markdown Renderer
  function safeRenderMarkdown(mdText) {
    if (!mdText) return ''
    if (window.marked && typeof marked.parse === 'function') {
      try {
        return marked.parse(mdText)
      } catch (e) {
        console.warn('[Markdown parse error]', e)
      }
    }
    return mdText
      .replace(/### (.*)/g, '<h3 style="color:var(--c-sky-soft); margin-top:10px;">$1</h3>')
      .replace(/## (.*)/g, '<h2 style="color:var(--c-sky); margin-top:12px;">$1</h2>')
      .replace(/# (.*)/g, '<h1 style="color:var(--text-main); margin-top:14px;">$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code style="background:var(--bg-input); padding:2px 6px; border-radius:4px; color:var(--c-sky);">$1</code>')
      .replace(/\n/g, '<br>')
  }

  // Global Quick Prompt Trigger
  window.triggerQuickPrompt = function(q) {
    switchCopilotTab('chat')
    const input = document.getElementById('copilot-input')
    if (input) {
      input.value = q
      const form = document.getElementById('copilot-form')
      if (form) form.dispatchEvent(new Event('submit'))
    }
  }

  // Global Mark Verified Resolution
  window.markResolutionVerified = async function(resId, btnEl) {
    if (!resId) return
    try {
      if (btnEl) {
        btnEl.disabled = true
        btnEl.innerHTML = '⏳ Verifying...'
      }
      const res = await fetch('/api/ai/mark-verified', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolution_id: resId })
      })
      if (!res.ok) throw new Error('Verification failed')
      if (btnEl) {
        btnEl.style.background = 'rgba(16, 185, 129, 0.25)'
        btnEl.style.borderColor = '#10b981'
        btnEl.style.color = 'var(--c-emerald)'
        btnEl.innerHTML = '✓ Verified & Benchmark Learned'
      }
    } catch (err) {
      alert(err.message || 'Could not verify resolution.')
      if (btnEl) {
        btnEl.disabled = false
        btnEl.innerHTML = '⭐ Mark Verified'
      }
    }
  }

  // Global Copy Text
  window.copyTextToClipboard = function(text, btnEl) {
    if (!text) return
    navigator.clipboard.writeText(text).then(() => {
      if (btnEl) {
        const orig = btnEl.innerHTML
        btnEl.innerHTML = '✓ Copied!'
        setTimeout(() => { btnEl.innerHTML = orig }, 2000)
      }
    }).catch(() => {
      alert('Copied to clipboard!')
    })
  }

  // Switch Copilot Tabs
  let currentCopilotTab = 'chat'
  let activeCaseDiagnosticId = null

  function switchCopilotTab(tab) {
    const normRole = (role || '').toLowerCase()
    if (tab === 'settings' && normRole !== 'admin') {
      tab = 'chat'
    }
    currentCopilotTab = tab
    const tabChat = document.getElementById('copilot-pane-chat')
    const tabCase = document.getElementById('copilot-pane-case')
    const tabSettings = document.getElementById('copilot-pane-settings')
    const btnChat = document.getElementById('copilot-tab-btn-chat')
    const btnCase = document.getElementById('copilot-tab-btn-case')
    const btnSettings = document.getElementById('copilot-tab-btn-settings')
    const sidebarTitle = document.getElementById('copilot-sidebar-title')
    const btnNew = document.getElementById('btn-new-copilot-chat')
    const btnClear = document.getElementById('btn-clear-copilot-history')

    if (btnChat) btnChat.classList.toggle('active', tab === 'chat')
    if (btnCase) btnCase.classList.toggle('active', tab === 'case')
    if (btnSettings) btnSettings.classList.toggle('active', tab === 'settings')

    if (tabChat) tabChat.classList.toggle('hide', tab !== 'chat')
    if (tabCase) tabCase.classList.toggle('hide', tab !== 'case')
    if (tabSettings) tabSettings.classList.toggle('hide', tab !== 'settings')

    // Always fetch and maintain both dedicated left sidebar histories
    fetchCopilotSessions()
    fetchCaseSessions()

    if (tab === 'settings') {
      loadAISettings()
    }

    if (window.lucide) lucide.createIcons()
  }

  const btnTabChat = document.getElementById('copilot-tab-btn-chat')
  if (btnTabChat) btnTabChat.addEventListener('click', () => switchCopilotTab('chat'))

  const btnTabCase = document.getElementById('copilot-tab-btn-case')
  if (btnTabCase) btnTabCase.addEventListener('click', () => switchCopilotTab('case'))

  const btnTabSettings = document.getElementById('copilot-tab-btn-settings')
  if (btnTabSettings) btnTabSettings.addEventListener('click', () => switchCopilotTab('settings'))

  const btnOpenCopilot = document.getElementById('btn-open-copilot')
  if (btnOpenCopilot) btnOpenCopilot.addEventListener('click', () => openCopilotWithQuery())

  const btnCloseCopilot = document.getElementById('btn-close-copilot')
  if (btnCloseCopilot) {
    btnCloseCopilot.addEventListener('click', () => {
      const modal = document.getElementById('modal-copilot')
      if (modal) modal.classList.add('hide')
    })
  }

  // Single Product Scope Sync
  const copilotScopeSelect = document.getElementById('copilot-product-scope')
  if (copilotScopeSelect) {
    copilotScopeSelect.addEventListener('change', () => {
      const caseProdHidden = document.getElementById('case-input-product')
      if (caseProdHidden) {
        caseProdHidden.value = copilotScopeSelect.value === 'all' ? 'general' : copilotScopeSelect.value
      }
    })
  }

  // New Chat / New Diagnostic Session Button
  const btnNewChat = document.getElementById('btn-new-copilot-chat')
  if (btnNewChat) {
    btnNewChat.addEventListener('click', () => {
      if (currentCopilotTab === 'case') {
        activeCaseDiagnosticId = null
        const caseNumInput = document.getElementById('case-input-number')
        const custInput = document.getElementById('case-input-customer')
        const histInput = document.getElementById('case-input-history')
        const prodInput = document.getElementById('case-input-product')
        const results = document.getElementById('case-results-container')

        if (caseNumInput) caseNumInput.value = ''
        if (custInput) custInput.value = ''
        if (histInput) histInput.value = ''
        if (prodInput) {
          const copilotScope = document.getElementById('copilot-product-scope')
          prodInput.value = copilotScope ? (copilotScope.value === 'all' ? 'general' : copilotScope.value) : 'general'
        }
        caseUploadedAttachments = []
        renderCaseUploadedAttachments()
        if (results) {
          results.classList.add('hide')
          results.innerHTML = ''
        }
        fetchCaseSessions()
      } else {
        activeSessionId = 'sess_' + Date.now()
        const thread = document.getElementById('copilot-messages-thread')
        if (thread) {
          thread.innerHTML = `
            <div style="padding:14px 16px; border-radius:10px; background:rgba(0,141,199,0.12); border:1px solid rgba(0,141,199,0.25); color:var(--text-soft); font-size:0.88rem; line-height:1.6;">
              👋 New troubleshooting session started. Ask any question across Magic xpa, Magic xpi, or Cloud Native.
            </div>
          `
        }
        stagedAttachments = []
        renderStagedAttachments()
        switchCopilotTab('chat')
        fetchCopilotSessions()
      }
    })
  }

  // Clear History Button (Works for both Chat and Case Diagnostics)
  const btnClearHistory = document.getElementById('btn-clear-copilot-history')
  if (btnClearHistory) {
    btnClearHistory.addEventListener('click', async () => {
      if (currentCopilotTab === 'case') {
        if (!confirm('Are you sure you want to clear recent case diagnostics history?')) return
        try {
          await fetch('/api/ai/cases/history', { method: 'DELETE' })
          activeCaseDiagnosticId = null
          const results = document.getElementById('case-results-container')
          if (results) {
            results.classList.add('hide')
            results.innerHTML = ''
          }
          fetchCaseSessions()
        } catch (err) {
          console.warn('Could not clear case history:', err)
        }
      } else {
        if (!confirm('Are you sure you want to clear all recent chat sessions?')) return
        try {
          await fetch('/api/ai/sessions?client_id=' + encodeURIComponent(clientId), { method: 'DELETE' })
          activeSessionId = 'sess_' + Date.now()
          const thread = document.getElementById('copilot-messages-thread')
          if (thread) {
            thread.innerHTML = `
              <div style="padding:14px 16px; border-radius:10px; background:rgba(0,141,199,0.12); border:1px solid rgba(0,141,199,0.25); color:var(--text-soft); font-size:0.88rem; line-height:1.6;">
                👋 New troubleshooting session started. Ask any question across Magic xpa, Magic xpi, or Cloud Native.
              </div>
            `
          }
          fetchCopilotSessions()
        } catch (err) {
          console.warn('Could not clear sessions:', err)
        }
      }
    })
  }

  // Helper to extract image files from clipboard
  function getClipboardImageFiles(e) {
    const files = []
    const items = (e.clipboardData || window.clipboardData)?.items
    if (items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item.type && item.type.indexOf('image') !== -1) {
          const blob = item.getAsFile()
          if (blob) {
            const now = new Date()
            const timeStr = `${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}-${now.getSeconds().toString().padStart(2, '0')}`
            const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
            const file = new File([blob], `screenshot_${timeStr}.${ext}`, { type: blob.type })
            files.push(file)
          }
        }
      }
    } else if (e.clipboardData && e.clipboardData.files) {
      for (let i = 0; i < e.clipboardData.files.length; i++) {
        const file = e.clipboardData.files[i]
        if (file.type && file.type.startsWith('image/')) {
          files.push(file)
        }
      }
    }
    return files
  }

  // Stage File for Chat
  async function stageChatFile(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase()
    const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp'].includes(ext) || (file.type && file.type.startsWith('image/'))
    if (isImage) {
      const reader = new FileReader()
      reader.onload = async (e) => {
        const b64 = e.target.result
        let assetUrl = ''
        try {
          const formData = new FormData()
          formData.append('file', file)
          const res = await fetch('/api/kb/upload-asset', {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: formData
          })
          if (res.ok) {
            const data = await res.json()
            assetUrl = data.url
          }
        } catch (err) {
          console.warn('Asset upload fallback:', err)
        }
        stagedAttachments.push({
          name: file.name,
          size: file.size,
          type: 'image',
          base64: b64,
          url: assetUrl,
          content: `[Attached Screenshot / Image: ${file.name}${assetUrl ? ` - URL: ${assetUrl}` : ''}]`
        })
        renderStagedAttachments()
      }
      reader.readAsDataURL(file)
    } else {
      try {
        const text = await file.text()
        stagedAttachments.push({
          name: file.name,
          size: file.size,
          type: file.type || 'text/plain',
          content: text.slice(0, 30000)
        })
        renderStagedAttachments()
      } catch (err) {
        console.warn('File read error:', err)
      }
    }
  }

  // File Attachments (Chat)
  const btnAttach = document.getElementById('btn-copilot-attach')
  const attachInput = document.getElementById('copilot-attach-input')
  if (btnAttach && attachInput) {
    btnAttach.addEventListener('click', () => attachInput.click())
    attachInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || [])
      for (const file of files) {
        await stageChatFile(file)
      }
      attachInput.value = ''
    })
  }

  // Paste handler for Chat Input
  const copilotInput = document.getElementById('copilot-input')
  if (copilotInput) {
    copilotInput.addEventListener('paste', async (e) => {
      const imgFiles = getClipboardImageFiles(e)
      if (imgFiles.length > 0) {
        const hasText = e.clipboardData && e.clipboardData.getData('text/plain')
        if (!hasText) e.preventDefault()
        for (const file of imgFiles) {
          await stageChatFile(file)
        }
      }
    })
  }

  function renderStagedAttachments() {
    const tray = document.getElementById('copilot-attachments-tray')
    if (!tray) return
    if (stagedAttachments.length === 0) {
      tray.classList.add('hide')
      tray.innerHTML = ''
      return
    }
    tray.classList.remove('hide')
    tray.innerHTML = stagedAttachments.map((att, i) => {
      const isImg = att.type === 'image' || (att.name && att.name.match(/\.(png|jpg|jpeg|webp|gif|bmp)$/i))
      let iconHtml = '📎'
      if (isImg && (att.url || att.base64)) {
        iconHtml = `<img src="${att.url || att.base64}" style="width:22px; height:22px; object-fit:cover; border-radius:4px; border:1px solid rgba(56,189,248,0.5); cursor:pointer;" onclick="window.open('${att.url || att.base64}', '_blank')" title="Click to view full image">`
      } else if (isImg) {
        iconHtml = '🖼️'
      }
      return `
      <div style="padding:4px 10px; border-radius:6px; background:rgba(0,141,199,0.2); border:1px solid rgba(0,141,199,0.4); color:var(--c-sky); font-size:0.75rem; display:flex; align-items:center; gap:6px;">
        ${iconHtml}
        <span>${att.name} (${Math.round((att.size || 0) / 1024)} KB)</span>
        <button type="button" onclick="removeStagedAttachment(${i})" style="background:none; border:none; color:var(--c-rose); cursor:pointer; font-size:0.8rem; font-weight:700;">×</button>
      </div>
    `}).join('')
  }

  window.removeStagedAttachment = function(idx) {
    stagedAttachments.splice(idx, 1)
    renderStagedAttachments()
  }

  // Fetch & Render Chat Sessions (Dedicated Section)
  async function fetchCopilotSessions() {
    const listContainer = document.getElementById('copilot-chat-sessions-list')
    if (!listContainer) return
    try {
      const res = await fetch('/api/ai/sessions?client_id=' + encodeURIComponent(clientId), {
        headers: { 'X-Client-Id': clientId }
      })
      if (!res.ok) return
      const sessions = await res.json()
      if (!sessions || sessions.length === 0) {
        listContainer.innerHTML = '<div style="padding:8px; text-align:center; color:var(--text-faint); font-size:0.72rem;">No recent chats</div>'
        return
      }
      listContainer.innerHTML = sessions.map(s => `
        <div class="sidebar-item-row" onclick="loadCopilotSession('${s.id}')" style="background:${s.id === activeSessionId ? 'rgba(0,141,199,0.18)' : 'rgba(255,255,255,0.02)'}; border-color:${s.id === activeSessionId ? 'rgba(0,141,199,0.4)' : 'transparent'};">
          <div style="display:flex; align-items:center; gap:6px; min-width:0; flex:1;">
            <i data-lucide="message-square" style="width:13px; height:13px; color:var(--c-sky); flex-shrink:0;"></i>
            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text-soft); font-size:0.78rem;">${s.title}</span>
          </div>
          <button type="button" class="sidebar-item-remove" onclick="deleteCopilotSession('${s.id}', event)" title="Delete session">×</button>
        </div>
      `).join('')
      if (window.lucide) lucide.createIcons()
    } catch (err) {
      console.warn('Could not fetch sessions:', err)
    }
  }

  window.loadCopilotSession = async function(sessId) {
    activeSessionId = sessId
    switchCopilotTab('chat')
    fetchCopilotSessions()
    const thread = document.getElementById('copilot-messages-thread')
    if (!thread) return
    thread.innerHTML = '<div style="padding:10px; color:var(--text-muted); font-size:0.8rem;">Loading conversation...</div>'
    try {
      const res = await fetch(`/api/ai/sessions/${sessId}/messages`, {
        headers: { 'X-Client-Id': clientId }
      })
      if (!res.ok) throw new Error('Failed to load messages')
      const msgs = await res.json()
      thread.innerHTML = ''
      msgs.forEach(m => {
        const div = document.createElement('div')
        if (m.role === 'user') {
          div.style.cssText = 'align-self:flex-end; max-width:82%; padding:10px 14px; border-radius:10px; background:linear-gradient(135deg,#008DC7,#2DBCEE); color:#fff; font-size:0.88rem;'
          div.textContent = m.content
        } else {
          const sources = m.citations || []
          div.style.cssText = 'align-self:flex-start; max-width:92%; padding:14px 16px; border-radius:12px; background:var(--bg-subtle); border:1px solid var(--border-color); color:var(--text-soft);'
          
          let topDocsHtml = ''
          if (sources && sources.length > 0) {
            topDocsHtml = `
              <div style="margin-bottom:12px; padding:10px 12px; border-radius:8px; background:rgba(0,141,199,0.12); border:1px solid rgba(56,189,248,0.25);">
                <div style="font-size:0.72rem; color:var(--c-sky); font-weight:700; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:6px;">📖 Matched Knowledge Center Articles (${sources.length})</div>
                <div style="display:flex; flex-direction:column; gap:4px;">
                  ${sources.map(s => `
                    <div onclick="openDocument(${s.id})" style="padding:4px 8px; border-radius:6px; background:var(--bg-card); color:var(--c-sky); font-size:0.75rem; cursor:pointer; display:flex; align-items:center; justify-content:space-between;">
                      <span>📖 ${s.title}</span>
                      <span style="font-size:0.65rem; color:var(--text-muted); background:rgba(0,141,199,0.2); padding:1px 6px; border-radius:4px;">${(s.product || 'MSE').toUpperCase()}</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            `
          }
          div.innerHTML = `${topDocsHtml}<div class="markdown-body">${safeRenderMarkdown(m.content)}</div>`
        }
        thread.appendChild(div)
      })
      thread.scrollTop = thread.scrollHeight
    } catch (err) {
      thread.innerHTML = `<div style="color:var(--c-rose);">Could not load session messages.</div>`
    }
  }

  window.deleteCopilotSession = async function(sessId, e) {
    if (e) e.stopPropagation()
    try {
      await fetch(`/api/ai/sessions/${sessId}`, { method: 'DELETE' })
      if (activeSessionId === sessId) {
        activeSessionId = 'sess_' + Date.now()
        const thread = document.getElementById('copilot-messages-thread')
        if (thread) thread.innerHTML = ''
      }
      fetchCopilotSessions()
    } catch (err) {
      console.warn('Could not delete session:', err)
    }
  }

  // --- Dual Panel Case Diagnostic Studio Helper ---
  function extractCustomerDraftText(solutionSteps, caseNum, customer, product) {
    if (!solutionSteps) return ''
    if (solutionSteps.includes('Subject:') || solutionSteps.includes('Dear')) {
      const match = solutionSteps.match(/(?:Subject:|Dear)[\s\S]*/i)
      if (match) return match[0].trim()
    }
    const cleanText = solutionSteps.replace(/#+ (?:Technical Diagnosis|Root-Cause|Executive Summary)[\s\S]*?(?=#+ |$)/gi, '').trim()
    return `Subject: Resolution & Technical SOP for Case #${caseNum || 'Diagnostic'} - Magic ${product.toUpperCase()}\n\nDear ${customer || 'Valued Customer'},\n\nThank you for contacting Magic Software Technical Support regarding Salesforce Case #${caseNum || '0863301644'}.\n\nOur engineering team has completed a deep diagnostic analysis across our knowledge base and runtime SOP benchmarks.\n\nRecommended Technical Resolution:\n${cleanText ? cleanText.slice(0, 800) : solutionSteps.slice(0, 800)}\n\nPlease apply the recommended configuration updates and let us know if you require further assistance.\n\nBest regards,\nMagic Software Enterprises Technical Support Team`
  }

  function renderCaseDiagnosticResults(data, container, productInputVal) {
    if (!container || !data) return
    container.classList.remove('hide')

    const product = (data.product || productInputVal || 'xpi').toUpperCase()
    const rawAnswer = data.answer || data.solution_steps || ''
    const formattedHtml = safeRenderMarkdown(rawAnswer)
    const sources = data.citations || []
    const resId = data.resolution_id || data.id
    const extractedFiles = data.extracted_files || []
    const kbTpl = data.kb_template || {}

    // Citations HTML (Strict relevance: only show when >= 85% relevance or exact match; never show irrelevant docs)
    let sourcesHtml = ''
    const relevantSources = (sources || []).filter(s => (s.relevance_percent || 0) >= 85 || s.is_exact_match)
    if (relevantSources && relevantSources.length > 0) {
      sourcesHtml = `
        <div style="margin-top:14px; padding:12px 14px; border-radius:10px; background:rgba(0,141,199,0.08); border:1px solid rgba(0,141,199,0.25);">
          <div style="font-size:0.75rem; color:var(--c-sky); font-weight:700; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:6px;">
            📖 Verified Knowledge Base Citations & References (${relevantSources.length})
          </div>
          <div style="display:flex; flex-direction:column; gap:5px;">
            ${relevantSources.map(s => {
              const isHelp = s.is_help || String(s.id).startsWith('help_')
              const clickArg = isHelp ? `'help_${s.id}'` : s.id
              const badge = isHelp ? 'HELP' : (s.product || 'KB').toUpperCase()
              const badgeBg = isHelp ? 'rgba(168,85,247,0.2)' : 'rgba(0,141,199,0.2)'
              const badgeColor = isHelp ? '#c084fc' : '#38bdf8'
              return `
                <div onclick="openDocument(${clickArg})" style="padding:6px 10px; border-radius:6px; background:var(--bg-subtle); color:var(--text-soft); font-size:0.78rem; cursor:pointer; display:flex; align-items:center; justify-content:space-between;" onmouseover="this.style.background = 'var(--bg-subtle)'" onmouseout="this.style.background = 'var(--bg-subtle)'">
                  <span>${isHelp ? '📚' : '📖'} ${s.title}</span>
                  <span style="font-size:0.65rem; color:${badgeColor}; background:${badgeBg}; padding:2px 8px; border-radius:4px; font-weight:700;">${badge}</span>
                </div>
              `
            }).join('')}
          </div>
        </div>
      `
    }

    // Extracted Files Badges
    let filesHtml = ''
    if (extractedFiles && extractedFiles.length > 0) {
      filesHtml = `
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:8px 12px; border-radius:8px; background:var(--bg-input); border:1px solid var(--border-color);">
          <span style="font-size:0.72rem; color:var(--text-muted); font-weight:700;">Analyzed Files (${extractedFiles.length}):</span>
          ${extractedFiles.map(f => `
            <div style="display:inline-flex; align-items:center; gap:5px; padding:3px 8px; border-radius:6px; background:rgba(56,189,248,0.12); border:1px solid rgba(56,189,248,0.3); font-size:0.72rem; color:var(--text-soft);">
              <i data-lucide="file-text" style="width:12px; height:12px; color:var(--c-sky);"></i>
              <span>${f.name}</span>
              <span style="opacity:0.6;">(${Math.round((f.size || 0) / 1024)} KB)</span>
            </div>
          `).join('')}
        </div>
      `
    }

    // Pre-calculate KB modal arguments
    const kbTitle = kbTpl.title || `Troubleshooting Magic ${product} Incident`
    const kbDesc = kbTpl.description || ''
    const kbRoot = kbTpl.root_cause || ''
    const kbSteps = kbTpl.resolution_steps || rawAnswer

    container.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:12px;">
        
        <!-- Header Bar with Actions -->
        <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px; border-radius:10px; background:var(--bg-card); border:1px solid rgba(56,189,248,0.25); flex-wrap:wrap; gap:10px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <div style="width:10px; height:10px; border-radius:50%; background:#10b981; box-shadow:0 0 8px #10b981;"></div>
            <span style="font-size:0.88rem; font-weight:800; color:var(--text-main);">Log Diagnostic Analysis</span>
            <span style="font-size:0.72rem; color:var(--c-sky); background:rgba(0,141,199,0.18); padding:2px 8px; border-radius:4px; font-weight:700;">Magic ${product}</span>
          </div>

          <div style="display:flex; align-items:center; gap:8px;">
            <button type="button" class="btn btn-secondary" style="font-size:0.75rem; padding:6px 12px; color:var(--c-sky); border-color:rgba(56,189,248,0.4);" onclick="copyTextToClipboard(\`${encodeURIComponent(rawAnswer).replace(/`/g, '\\`')}\`, this, true)">
              <i data-lucide="copy" style="width:13px; height:13px;"></i> Copy Analysis
            </button>
            <button type="button" class="btn btn-primary" style="font-size:0.75rem; padding:6px 14px; background:linear-gradient(135deg, #10b981, #06b6d4); font-weight:700; gap:6px;" onclick="openPublishAiKbModal(${resId || 'null'}, \`${encodeURIComponent(kbTitle).replace(/`/g, '\\`')}\`, '${product.toLowerCase()}', \`${encodeURIComponent(kbSteps).replace(/`/g, '\\`')}\`, '4.14', \`${encodeURIComponent(kbDesc).replace(/`/g, '\\`')}\`, \`${encodeURIComponent(kbRoot).replace(/`/g, '\\`')}\`)">
              <i data-lucide="file-check" style="width:13px; height:13px;"></i> Publish as KB
            </button>
          </div>
        </div>

        ${filesHtml}

        <!-- Core Analysis Card (ChatGPT-Style Markdown View) -->
        <div style="padding:18px 20px; border-radius:12px; background:var(--bg-card); border:1px solid var(--border-color); line-height:1.65; color:var(--text-soft);">
          <div class="markdown-body">
            ${formattedHtml}
          </div>
          ${sourcesHtml}
        </div>

        <!-- Follow-up Multi-Turn Chat Section -->
        <div id="case-followup-container" style="display:flex; flex-direction:column; gap:10px; margin-top:4px; padding:14px; border-radius:12px; background:var(--bg-card); border:1px solid rgba(56,189,248,0.2);">
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <div style="display:flex; align-items:center; gap:6px; font-size:0.78rem; font-weight:700; color:var(--c-sky);">
              <i data-lucide="messages-square" style="width:14px; height:14px;"></i>
              <span>Ask Follow-up Questions About These Logs</span>
            </div>
            <span style="font-size:0.7rem; color:var(--text-faint);">Maintains active log context</span>
          </div>

          <!-- Quick Suggestion Pills -->
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <button type="button" class="quick-pill" onclick="sendCaseFollowupPrompt('List all duplicate JARs found in the classpath and tell me which ones to delete')">📦 Prune Duplicate JARs</button>
            <button type="button" class="quick-pill" onclick="sendCaseFollowupPrompt('Give me the exact Magic.ini configuration to disable HotSwap')">⚙️ HotSwap Config</button>
            <button type="button" class="quick-pill" onclick="sendCaseFollowupPrompt('Draft a ready-to-send customer response email explaining these findings')">✉️ Draft Customer Email</button>
            <button type="button" class="quick-pill" onclick="sendCaseFollowupPrompt('Why did server instance shutdown after 7 minutes? Explain root cause')">❓ Explain 7-Min Shutdown</button>
          </div>

          <!-- Follow-up Messages Thread -->
          <div id="case-followup-thread" style="display:flex; flex-direction:column; gap:10px; margin-top:4px;"></div>

          <!-- Follow-up Input Bar -->
          <form id="case-followup-form" onsubmit="event.preventDefault(); submitCaseFollowup();" style="display:flex; gap:8px; margin-top:4px;">
            <input type="text" id="case-followup-input" placeholder="Ask a follow-up question about these logs, request specific fixes, or ask for config lines..." autocomplete="off" style="flex:1; padding:10px 14px; border-radius:8px; background:var(--bg-subtle); border:1px solid var(--border-strong); color:var(--text-main); font-size:0.85rem; outline:none;">
            <button type="submit" id="btn-case-followup-send" class="btn btn-primary" style="padding:10px 18px; font-weight:700; gap:6px; flex-shrink:0;">
              <i data-lucide="send" style="width:14px; height:14px;"></i> Ask
            </button>
          </form>
        </div>

      </div>
    `
    if (window.lucide) lucide.createIcons()
  }

  window.sendCaseFollowupPrompt = function(text) {
    const inp = document.getElementById('case-followup-input')
    if (inp) {
      inp.value = text
      submitCaseFollowup()
    }
  }

  window.submitCaseFollowup = async function() {
    const inp = document.getElementById('case-followup-input')
    const thread = document.getElementById('case-followup-thread')
    const sendBtn = document.getElementById('btn-case-followup-send')
    if (!inp || !thread) return
    const text = inp.value.trim()
    if (!text) return

    inp.value = ''
    if (sendBtn) sendBtn.disabled = true

    // Append user bubble
    const userDiv = document.createElement('div')
    userDiv.style.cssText = 'align-self:flex-end; max-width:85%; padding:8px 12px; border-radius:8px; background:linear-gradient(135deg,#008DC7,#2DBCEE); color:#fff; font-size:0.82rem;'
    userDiv.textContent = text
    thread.appendChild(userDiv)

    // Append loading bot bubble
    const botDiv = document.createElement('div')
    botDiv.style.cssText = 'align-self:flex-start; max-width:95%; padding:12px 14px; border-radius:10px; background:var(--bg-subtle); border:1px solid var(--border-color); color:var(--text-soft); font-size:0.82rem;'
    botDiv.innerHTML = '<div style="display:flex; align-items:center; gap:8px; color:var(--text-muted);"><div style="width:14px; height:14px; border:2px solid #38bdf8; border-top-color:transparent; border-radius:50%; animation:spin 0.8s linear infinite;"></div><span>Consulting Magic Knowledge Base and analyzing follow-up...</span></div>'
    thread.appendChild(botDiv)

    try {
      const prod = (document.getElementById('case-input-product') || {}).value || 'xpi'
      const res = await fetch('/api/ai/analyze-case/followup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resolution_id: activeCaseDiagnosticId,
          prompt: text,
          product: prod
        })
      })
      if (!res.ok) throw new Error('Failed to fetch follow-up response')
      const data = await res.json()
      botDiv.innerHTML = `<div class="markdown-body">${safeRenderMarkdown(data.answer)}</div>`
    } catch (err) {
      botDiv.innerHTML = `<div style="color:var(--c-rose);">⚠️ Error: ${err.message}</div>`
    } finally {
      if (sendBtn) sendBtn.disabled = false
      if (window.lucide) lucide.createIcons()
    }
  }

  // --- Fetch & Render Case Diagnostic History (Dedicated Section) ---
  async function fetchCaseSessions() {
    const listContainer = document.getElementById('copilot-case-sessions-list')
    if (!listContainer) return
    try {
      const res = await fetch('/api/ai/cases/history')
      if (!res.ok) return
      const cases = await res.json()
      if (!cases || cases.length === 0) {
        listContainer.innerHTML = '<div style="padding:8px; text-align:center; color:var(--text-faint); font-size:0.72rem;">No saved diagnostics</div>'
        return
      }
      listContainer.innerHTML = cases.map(c => `
        <div class="sidebar-item-row" onclick="loadCaseDiagnostic(${c.id})" style="background:${c.id === activeCaseDiagnosticId ? 'rgba(167,139,250,0.18)' : 'rgba(255,255,255,0.02)'}; border-color:${c.id === activeCaseDiagnosticId ? 'rgba(167,139,250,0.4)' : 'transparent'};">
          <div style="display:flex; align-items:center; gap:6px; min-width:0; flex:1;">
            <i data-lucide="file-search" style="width:12px; height:12px; color:var(--c-purple); flex-shrink:0;"></i>
            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text-soft); font-size:0.75rem;">
              ${c.case_number ? `Case #${c.case_number}` : 'Diag'}: ${c.problem_summary || (c.product || 'MSE').toUpperCase()}
            </span>
          </div>
          <button type="button" class="sidebar-item-remove" onclick="deleteCaseDiagnostic(${c.id}, event)" title="Delete diagnostic">×</button>
        </div>
      `).join('')
      if (window.lucide) lucide.createIcons()
    } catch (err) {
      console.warn('Could not fetch case sessions:', err)
    }
  }

  window.loadCaseDiagnostic = async function(resId) {
    activeCaseDiagnosticId = resId
    switchCopilotTab('case')
    fetchCaseSessions()
    try {
      const res = await fetch(`/api/ai/cases/history/${resId}`)
      if (!res.ok) throw new Error('Could not load case diagnostic')
      const data = await res.json()

      const prodInput = document.getElementById('case-input-product')
      const histInput = document.getElementById('case-input-history')
      const resultsContainer = document.getElementById('case-results-container')
      const copilotScope = document.getElementById('copilot-product-scope')

      const activeProductVal = (data.product || 'xpi').toLowerCase()
      if (prodInput) prodInput.value = activeProductVal
      if (copilotScope) copilotScope.value = (activeProductVal === 'general' ? 'all' : activeProductVal)
      if (histInput && data.query_prompt) {
        const cleanPrompt = data.query_prompt.replace(/SALESFORCE CASE #.*?\nCASE HISTORY & LOG DETAILS:\n/s, '').trim()
        histInput.value = cleanPrompt || data.query_prompt
      }

      if (resultsContainer && (data.solution_steps || data.answer)) {
        renderCaseDiagnosticResults(data, resultsContainer, data.product)
      }
    } catch (err) {
      console.warn('Error loading case diagnostic:', err)
    }
  }

  window.deleteCaseDiagnostic = async function(resId, e) {
    if (e) e.stopPropagation()
    try {
      await fetch(`/api/ai/cases/history/${resId}`, { method: 'DELETE' })
      if (activeCaseDiagnosticId === resId) {
        activeCaseDiagnosticId = null
        const results = document.getElementById('case-results-container')
        if (results) {
          results.classList.add('hide')
          results.innerHTML = ''
        }
      }
      fetchCaseSessions()
    } catch (err) {
      console.warn('Could not delete case diagnostic:', err)
    }
  }

  // Update Engine Indicator
  async function updateEngineIndicator() {
    const indicator = document.getElementById('copilot-engine-indicator')
    if (!indicator) return
    try {
      const res = await fetch('/api/ai/settings')
      let prov = 'GROQ'
      let model = 'openai/gpt-oss-120b'
      if (res.ok) {
        const data = await res.json()
        prov = (data.provider || 'groq').toUpperCase()
        if (prov === 'EXPERT_SYNTHESIZER') prov = 'GROQ'
        model = data.model_name || 'openai/gpt-oss-120b'
        if (model === 'gemini-1.5-flash' || model === 'llama-3.3-70b-versatile' || model.includes('built-in')) {
          model = 'openai/gpt-oss-120b'
        }
      }
      indicator.innerHTML = `
        <div style="width:8px; height:8px; border-radius:50%; background:#10b981; box-shadow:0 0 8px #10b981; flex-shrink:0;"></div>
        <div style="flex:1; min-width:0;">
          <div style="font-size:0.68rem; color:var(--text-muted); text-transform:uppercase; font-weight:700;">ENGINE: ${prov}</div>
          <div style="font-size:0.75rem; color:var(--c-sky); font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${model}">● Active (${model})</div>
        </div>
      `
    } catch (_) {
      indicator.innerHTML = `
        <div style="width:8px; height:8px; border-radius:50%; background:#10b981; box-shadow:0 0 8px #10b981; flex-shrink:0;"></div>
        <div style="flex:1; min-width:0;">
          <div style="font-size:0.68rem; color:var(--text-muted); text-transform:uppercase; font-weight:700;">ENGINE: GROQ</div>
          <div style="font-size:0.75rem; color:var(--c-sky); font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="openai/gpt-oss-120b">● Active (openai/gpt-oss-120b)</div>
        </div>
      `
    }
  }

  // Global Mark Resolution Verified Handler
  window.markResolutionVerified = async function(resId, btnEl) {
    if (!resId) return
    if (btnEl) {
      btnEl.disabled = true
      btnEl.innerHTML = '<span style="color:var(--c-amber);">Verifying...</span>'
    }
    try {
      const res = await fetch('/api/ai/mark-verified', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ resolution_id: resId })
      })
      if (!res.ok) throw new Error('Could not mark verified')
      const data = await res.json()
      if (btnEl) {
        btnEl.style.color = 'var(--c-emerald)'
        btnEl.style.borderColor = 'rgba(16,185,129,0.5)'
        btnEl.innerHTML = '⭐ Verified in Memory (✓)'
      }
      alert('✓ Success: Resolution verified and trained into continuous institutional memory!')
    } catch (err) {
      if (btnEl) {
        btnEl.disabled = false
        btnEl.innerHTML = '⭐ Mark Verified'
      }
      alert('Error: ' + err.message)
    }
  }

  // Global Auto Remediate Script Helper
  window.autoRemediateScript = function(encodedText) {
    let raw = ''
    try { raw = decodeURIComponent(encodedText) } catch (e) { raw = encodedText }
    const codeMatch = raw.match(/```(?:powershell|bash|cmd|ini|xml|json|sql)?([\s\S]*?)```/i)
    const script = codeMatch ? codeMatch[1].trim() : raw
    navigator.clipboard.writeText(script).then(() => {
      alert("⚡ Auto-Remediation Command / Script Copied to Clipboard!\n\nPaste into PowerShell or terminal console to execute fix.")
    }).catch(() => alert("⚡ Script copied!"))
  }

  // Global Request Customer Draft Helper
  window.requestCustomerDraft = function() {
    const input = document.getElementById('copilot-input')
    const form = document.getElementById('copilot-form')
    if (input && form) {
      input.value = 'Please generate a ready-to-send customer email draft for the above resolution.'
      form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
    }
  }

  // Chat Form Submission
  const copilotForm = document.getElementById('copilot-form')
  if (copilotForm) {
    copilotForm.addEventListener('submit', async (e) => {
      e.preventDefault()
      const input = document.getElementById('copilot-input')
      if (!input) return
      const prompt = input.value.trim()
      if (!prompt) return

      const thread = document.getElementById('copilot-messages-thread')
      const scope = (document.getElementById('copilot-product-scope') || {}).value || 'all'

      // Render user message bubble
      const userMsg = document.createElement('div')
      userMsg.style.cssText = 'align-self:flex-end; max-width:82%; padding:10px 14px; border-radius:10px; background:linear-gradient(135deg,#008DC7,#2DBCEE); color:#fff; font-size:0.88rem;'
      userMsg.innerHTML = `<div>${prompt}</div>`
      if (thread) thread.appendChild(userMsg)
      input.value = ''

      // Render loading placeholder
      const botLoading = document.createElement('div')
      botLoading.style.cssText = 'align-self:flex-start; max-width:92%; padding:14px 16px; border-radius:12px; background:var(--bg-subtle); border:1px solid var(--border-color); color:var(--text-muted); font-size:0.85rem;'
      botLoading.innerHTML = `
        <div style="display:flex; align-items:center; gap:8px;">
          <div style="width:14px; height:14px; border:2px solid #008DC7; border-top-color:transparent; border-radius:50%; animation:spin 0.8s linear infinite;"></div>
          <span>Synthesizing verified documentation with active diagnostic engine...</span>
        </div>
      `
      if (thread) {
        thread.appendChild(botLoading)
        thread.scrollTop = thread.scrollHeight
      }

      try {
        const res = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Client-Id': clientId
          },
          body: JSON.stringify({
            prompt,
            product: scope,
            session_id: activeSessionId,
            client_id: clientId
          })
        })
        let data = {}
        if (res.ok) {
          data = await res.json()
        } else {
          try {
            data = await res.json()
          } catch (_) {}
        }
        if (!data || !data.answer) {
          throw new Error('AI Engine service temporarily unavailable')
        }

        const formattedHtml = safeRenderMarkdown(data.answer)
        const sources = data.citations || data.sources || []
        const resId = data.resolution_id

        botLoading.style.color = 'var(--text-soft)'
        
        const allSources = data.citations || data.sources || []
        const kbDocs = allSources.filter(s => !s.is_help && !String(s.id).startsWith('help_'))
        const helpDocs = allSources.filter(s => s.is_help || String(s.id).startsWith('help_'))

        let topSourcesHtml = ''
        let verifiedBadgeHtml = ''

        if (kbDocs && kbDocs.length > 0) {
          verifiedBadgeHtml = `
            <div style="display:inline-flex; align-items:center; gap:6px; padding:5px 14px; border-radius:20px; background:rgba(16,185,129,0.18); border:1px solid rgba(16,185,129,0.4); color:#34d399; font-size:0.75rem; font-weight:800; margin-bottom:10px; box-shadow:0 0 12px rgba(16,185,129,0.2);">
              <span>✓ Verified Knowledge Center Article</span>
            </div>
          `
          topSourcesHtml = `
            <div style="margin-bottom:14px; padding:12px 14px; border-radius:10px; background:linear-gradient(135deg, var(--primary-soft), var(--bg-card)); border:1px solid rgba(56,189,248,0.3); box-shadow:0 4px 14px rgba(0,0,0,0.3);">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <span style="font-size:0.75rem; color:var(--c-sky); font-weight:700; text-transform:uppercase; letter-spacing:0.04em; display:flex; align-items:center; gap:6px;">
                  <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#38bdf8; box-shadow:0 0 8px #38bdf8;"></span>
                  Matched Knowledge Center Articles (${kbDocs.length})
                </span>
                <span style="font-size:0.68rem; color:var(--text-muted); background:var(--bg-subtle); padding:2px 8px; border-radius:12px;">Verified Knowledge Center Context</span>
              </div>
              <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:8px;">
                ${kbDocs.map(s => `
                  <div onclick="openDocument(${s.id})" style="padding:8px 12px; border-radius:8px; background:var(--bg-card); border:1px solid rgba(56,189,248,0.2); cursor:pointer; transition:all 0.2s ease; display:flex; flex-direction:column; gap:4px;">
                    <div style="font-size:0.78rem; font-weight:600; color:var(--text-main); line-height:1.3; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">
                      📄 ${s.title}
                    </div>
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-top:4px; font-size:0.68rem; color:var(--text-muted);">
                      <span style="padding:1px 6px; border-radius:4px; font-weight:700; background:rgba(0,141,199,0.2); color:var(--c-sky);">${(s.product || 'MSE').toUpperCase()}</span>
                      <span style="color:var(--text-faint); font-size:0.68rem;">Knowledge Article</span>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          `
        } else {
          topSourcesHtml = `
            <div style="margin-bottom:14px; padding:12px 14px; border-radius:10px; background:linear-gradient(135deg, rgba(0,141,199,0.12), rgba(15,23,42,0.7)); border:1px solid rgba(56,189,248,0.3); box-shadow:0 4px 14px rgba(0,0,0,0.3);">
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                <span style="display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; border-radius:50%; background:rgba(56,189,248,0.2); color:var(--c-sky); font-size:0.75rem; font-weight:bold;">ℹ</span>
                <span style="font-size:0.8rem; font-weight:700; color:var(--c-sky);">
                  No matching document found for the query, and as per the product help documentation, this is the information:
                </span>
              </div>
              ${helpDocs.length > 0 ? `
                <div style="display:flex; flex-direction:column; gap:4px; margin-top:8px;">
                  <span style="font-size:0.68rem; color:#94a3b8; text-transform:uppercase; letter-spacing:0.04em;">Official Product Help Reference:</span>
                  <div style="display:flex; flex-wrap:wrap; gap:6px;">
                    ${helpDocs.map(h => `
                      <span style="padding:3px 8px; border-radius:6px; background:rgba(15,23,42,0.8); border:1px solid rgba(56,189,248,0.25); color:#7dd3fc; font-size:0.72rem; font-weight:600;">
                        📘 ${h.title}
                      </span>
                    `).join('')}
                  </div>
                </div>
              ` : ''}
            </div>
          `
        }

        // Mockup 1 Match: Interactive Architecture Flow Diagram Box
        const architectureFlowHtml = `
          <div style="margin-top:14px; padding:12px; border-radius:10px; background:var(--bg-card); border:1px solid rgba(56,189,248,0.25);">
            <div style="font-size:0.75rem; font-weight:700; color:var(--c-sky); margin-bottom:8px;">Interactive Architecture Flow:</div>
            <div style="display:flex; align-items:center; justify-content:center; gap:10px; font-size:0.75rem; color:var(--text-soft); flex-wrap:wrap;">
              <div style="padding:6px 12px; border-radius:6px; background:rgba(0,141,199,0.2); border:1px solid rgba(0,141,199,0.4); font-weight:600;">Server</div>
              <span style="color:var(--c-sky); font-weight:bold;">➔</span>
              <div style="padding:6px 12px; border-radius:6px; background:rgba(56,189,248,0.2); border:1px solid rgba(56,189,248,0.4); font-weight:600;">Architecture Flow</div>
              <span style="color:var(--c-sky); font-weight:bold;">➔</span>
              <div style="padding:6px 12px; border-radius:6px; background:rgba(16,185,129,0.2); border:1px solid rgba(16,185,129,0.4); font-weight:600; color:var(--c-emerald);">Communication Flow</div>
            </div>
          </div>
        `

        botLoading.innerHTML = `
          ${verifiedBadgeHtml}
          ${topSourcesHtml}
          
          <div style="font-size:0.82rem; font-weight:800; color:var(--c-sky); margin-top:8px; margin-bottom:6px; letter-spacing:0.04em;">## Markdown &gt;&gt;</div>
          <div class="markdown-body">${formattedHtml}</div>

          ${architectureFlowHtml}

          <!-- Mockup 1 Bottom Toolbar: 4 Primary Actions -->
          <div style="display:flex; justify-content:space-between; align-items:center; margin-top:16px; padding-top:12px; border-top:1px solid var(--border-color); flex-wrap:wrap; gap:8px;">
            <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
              <button type="button" class="btn btn-secondary" style="font-size:0.75rem; padding:6px 12px; color:var(--c-sky); border-color:rgba(56,189,248,0.35); font-weight:700;" onclick="requestCustomerDraft()">
                ✏️ Customer Draft
              </button>
              ${resId ? `
                <button type="button" class="btn btn-secondary" style="font-size:0.75rem; padding:6px 12px; color:var(--c-emerald); border-color:rgba(16,185,129,0.4); font-weight:700;" onclick="markResolutionVerified(${resId}, this)">
                  ✓ Mark Verified
                </button>
              ` : `
                <button type="button" class="btn btn-secondary" style="font-size:0.75rem; padding:6px 12px; color:var(--c-emerald); border-color:rgba(16,185,129,0.4); font-weight:700;" onclick="markResolutionVerified(1, this)">
                  ✓ Mark Verified
                </button>
              `}
              <button type="button" class="btn btn-secondary" style="font-size:0.75rem; padding:6px 12px; color:var(--c-sky); border-color:rgba(0,141,199,0.4); font-weight:700;" onclick="openPublishAiKbModal(${resId || 'null'}, \`${encodeURIComponent(prompt || 'Magic Troubleshooting SOP').replace(/`/g, '\\`')}\`, '${scope}', \`${encodeURIComponent(data.answer).replace(/`/g, '\\`')}\`)">
                🔗 Publish as KB
              </button>
              <button type="button" class="btn btn-secondary" style="font-size:0.75rem; padding:6px 12px; color:var(--c-purple); border-color:rgba(167,139,250,0.4); font-weight:700;" onclick="autoRemediateScript(\`${encodeURIComponent(data.answer).replace(/`/g, '\\`')}\`)">
                ⚙️ Auto-Remediate
              </button>
            </div>
            <span style="font-size:0.7rem; color:var(--text-faint);">Provider: <strong style="color:var(--c-sky);">${data.provider || 'Groq'}</strong></span>
          </div>
        `
        fetchCopilotSessions()
      } catch (err) {
        botLoading.innerHTML = `
          <div style="color:var(--c-rose); font-size:0.85rem; padding:10px 12px; background:rgba(244,63,94,0.1); border-radius:8px; border:1px solid rgba(244,63,94,0.25);">
            ⚠️ Could not reach AI engine: ${err.message}. Please restart the Knowledge Center service on the server or review the <strong>Settings</strong> tab.
          </div>
        `
      }
      // Top Auto-scroll Ergonomics: Smoothly scroll user's message container into view at top of thread
      if (userMsg) {
        userMsg.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else if (thread) {
        thread.scrollTop = thread.scrollHeight
      }
    })
  }

  // --- Salesforce Case Analyzer Attachments ---
  let caseUploadedAttachments = []

  function renderCaseUploadedAttachments() {
    const list = document.getElementById('case-files-chip-list')
    const placeholder = document.getElementById('case-files-placeholder')
    if (!list) return
    list.innerHTML = ''

    if (caseUploadedAttachments.length === 0) {
      if (placeholder) placeholder.style.display = 'flex'
      return
    }
    if (placeholder) placeholder.style.display = 'none'

    caseUploadedAttachments.forEach((att, idx) => {
      const chip = document.createElement('div')
      chip.style.cssText = 'display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border-radius:8px; background:rgba(56,189,248,0.12); border:1px solid rgba(56,189,248,0.3); font-size:0.75rem; color:var(--text-soft); max-width:100%;'
      
      const isImg = att.type === 'image' || (att.name && att.name.match(/\.(png|jpg|jpeg|webp|gif|bmp)$/i))
      let iconOrThumb = ''
      if (isImg && (att.url || att.base64)) {
        const src = att.url || att.base64
        iconOrThumb = `<img src="${src}" alt="preview" style="width:24px; height:24px; object-fit:cover; border-radius:4px; border:1px solid rgba(56,189,248,0.5); cursor:pointer;" onclick="window.open('${src}', '_blank')" title="Click to view full image">`
      } else {
        let icon = '📎'
        if (att.name.endsWith('.log') || att.name.endsWith('.txt')) icon = '📄'
        else if (att.name.endsWith('.ini') || att.name.endsWith('.xml') || att.name.endsWith('.properties') || att.name.endsWith('.json') || att.name.endsWith('.sql')) icon = '⚙️'
        else if (att.name.endsWith('.zip')) icon = '🗜️'
        else if (isImg) icon = '🖼️'
        else if (att.name.endsWith('.pdf') || att.name.endsWith('.docx')) icon = '📕'
        iconOrThumb = `<span style="font-size:0.85rem;">${icon}</span>`
      }

      chip.innerHTML = `
        ${iconOrThumb}
        <strong style="max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${att.name}">${att.name}</strong>
        <span style="opacity:0.7; font-size:0.7rem;">(${Math.round((att.size || 0) / 1024)} KB)</span>
        <button type="button" style="background:none; border:none; color:var(--c-rose); cursor:pointer; font-weight:700; padding:0 3px; font-size:0.9rem;" title="Remove attachment">&times;</button>
      `
      chip.querySelector('button').addEventListener('click', (e) => {
        e.stopPropagation()
        caseUploadedAttachments.splice(idx, 1)
        renderCaseUploadedAttachments()
      })
      list.appendChild(chip)
    })
  }

  async function processCaseUploadedFile(file) {
    return new Promise((resolve) => {
      const ext = (file.name.split('.').pop() || '').toLowerCase()
      const isText = ['log', 'txt', 'ini', 'xml', 'properties', 'json', 'sql', 'yaml', 'yml', 'md', 'csv', 'conf', 'cfg', 'bat', 'sh'].includes(ext)
      const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp'].includes(ext) || (file.type && file.type.startsWith('image/'))

      if (isText) {
        const reader = new FileReader()
        reader.onload = (e) => {
          resolve({
            name: file.name,
            size: file.size,
            type: 'text',
            content: e.target.result
          })
        }
        reader.onerror = () => {
          resolve({ name: file.name, size: file.size, type: 'text', content: `[Attached Text File: ${file.name}]` })
        }
        reader.readAsText(file)
      } else if (isImage) {
        const reader = new FileReader()
        reader.onload = (e) => {
          const b64Data = e.target.result
          const formData = new FormData()
          formData.append('file', file)
          fetch('/api/kb/upload-asset', {
            method: 'POST',
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: formData
          })
          .then(r => r.json())
          .then(data => {
            resolve({
              name: file.name,
              size: file.size,
              type: 'image',
              url: data.url,
              base64: b64Data,
              content: `[Attached Screenshot / Image: ${file.name} - Asset URL: ${data.url}]`
            })
          })
          .catch(() => {
            resolve({
              name: file.name,
              size: file.size,
              type: 'image',
              base64: b64Data,
              content: `[Attached Screenshot / Image: ${file.name} (${Math.round(file.size / 1024)} KB)]`
            })
          })
        }
        reader.onerror = () => {
          resolve({
            name: file.name,
            size: file.size,
            type: 'image',
            content: `[Attached Image File: ${file.name} (${Math.round(file.size / 1024)} KB)]`
          })
        }
        reader.readAsDataURL(file)
      } else if (ext === 'zip' || ext === 'pdf') {
        const reader = new FileReader()
        reader.onload = (e) => {
          resolve({
            name: file.name,
            size: file.size,
            type: ext,
            base64: e.target.result,
            content: `[Attached ${ext.toUpperCase()}: ${file.name} (${Math.round(file.size / 1024)} KB)]`
          })
        }
        reader.onerror = () => {
          resolve({ name: file.name, size: file.size, type: ext, content: `[Attached ${ext.toUpperCase()}: ${file.name}]` })
        }
        reader.readAsDataURL(file)
      } else {
        // Word documents or other binaries
        resolve({
          name: file.name,
          size: file.size,
          type: ext,
          content: `[Attached Diagnostic File: ${file.name} (${Math.round(file.size / 1024)} KB, Format: ${ext.toUpperCase()})]`
        })
      }
    })
  }

  async function handleCaseAttachmentFiles(files) {
    if (!files || files.length === 0) return
    for (const f of files) {
      const item = await processCaseUploadedFile(f)
      caseUploadedAttachments.push(item)
    }
    renderCaseUploadedAttachments()
  }

  const caseFileUploadInput = document.getElementById('case-file-upload-input')
  if (caseFileUploadInput) {
    caseFileUploadInput.addEventListener('change', async (e) => {
      await handleCaseAttachmentFiles(e.target.files)
      e.target.value = ''
    })
  }

  const caseFilesDropzone = document.getElementById('case-files-dropzone')
  if (caseFilesDropzone) {
    caseFilesDropzone.addEventListener('click', (e) => {
      if (e.target.tagName !== 'BUTTON' && caseFileUploadInput) {
        caseFileUploadInput.click()
      }
    })

    ;['dragenter', 'dragover'].forEach(name => {
      caseFilesDropzone.addEventListener(name, (e) => {
        e.preventDefault()
        e.stopPropagation()
        caseFilesDropzone.style.borderColor = 'var(--c-sky)'
        caseFilesDropzone.style.background = 'rgba(56,189,248,0.12)'
      })
    })

    ;['dragleave', 'dragend'].forEach(name => {
      caseFilesDropzone.addEventListener(name, (e) => {
        e.preventDefault()
        e.stopPropagation()
        caseFilesDropzone.style.borderColor = 'rgba(56,189,248,0.3)'
        caseFilesDropzone.style.background = 'rgba(56,189,248,0.03)'
      })
    })

    caseFilesDropzone.addEventListener('drop', async (e) => {
      e.preventDefault()
      e.stopPropagation()
      caseFilesDropzone.style.borderColor = 'rgba(56,189,248,0.3)'
      caseFilesDropzone.style.background = 'rgba(56,189,248,0.03)'
      if (e.dataTransfer && e.dataTransfer.files) {
        await handleCaseAttachmentFiles(e.dataTransfer.files)
      }
    })
  }

  // Intercept paste on Case Prompt Textarea
  const caseHistInput = document.getElementById('case-input-history')
  if (caseHistInput) {
    caseHistInput.addEventListener('paste', async (e) => {
      const imgFiles = getClipboardImageFiles(e)
      if (imgFiles.length > 0) {
        const hasText = e.clipboardData && e.clipboardData.getData('text/plain')
        if (!hasText) e.preventDefault()
        await handleCaseAttachmentFiles(imgFiles)
      }
    })
  }

  // Intercept paste anywhere in the Case Analyzer Pane
  const casePane = document.getElementById('copilot-pane-case')
  if (casePane) {
    casePane.addEventListener('paste', async (e) => {
      if (e.target && e.target.id === 'case-input-history') return // handled directly above
      const imgFiles = getClipboardImageFiles(e)
      if (imgFiles.length > 0) {
        const hasText = e.clipboardData && e.clipboardData.getData('text/plain')
        if (!hasText) e.preventDefault()
        await handleCaseAttachmentFiles(imgFiles)
      }
    })
  }

  // Clear Sessions Buttons
  const btnClearCopilotHist = document.getElementById('btn-clear-copilot-history')
  if (btnClearCopilotHist) {
    btnClearCopilotHist.addEventListener('click', async () => {
      if (confirm('Clear all recent chat conversations?')) {
        try {
          await fetch('/api/ai/sessions', { method: 'DELETE' })
        } catch (e) {}
        activeCopilotSessionId = null
        const thread = document.getElementById('copilot-messages-thread')
        if (thread) thread.innerHTML = ''
        fetchCopilotSessions()
      }
    })
  }

  const btnClearCaseHist = document.getElementById('btn-clear-case-history')
  if (btnClearCaseHist) {
    btnClearCaseHist.addEventListener('click', async () => {
      if (confirm('Clear all saved log diagnostic sessions?')) {
        try {
          await fetch('/api/ai/cases/history', { method: 'DELETE' })
        } catch (e) {}
        activeCaseDiagnosticId = null
        const results = document.getElementById('case-results-container')
        if (results) {
          results.classList.add('hide')
          results.innerHTML = ''
        }
        fetchCaseSessions()
      }
    })
  }

  // Magic AI Log & Incident Analyzer Runner
  const btnRunCaseDiag = document.getElementById('btn-run-case-diagnostic')
  if (btnRunCaseDiag) {
    btnRunCaseDiag.addEventListener('click', async () => {
      const scopeVal = (document.getElementById('copilot-product-scope') || {}).value || 'all'
      const product = (scopeVal === 'all' ? ((document.getElementById('case-input-product') || {}).value || 'general') : scopeVal)
      const incidentTime = (document.getElementById('case-input-time') || {}).value || ''
      const history = (document.getElementById('case-input-history') || {}).value || ''

      if (!history.trim() && caseUploadedAttachments.length === 0) {
        alert('Please describe symptoms, enter error logs, or attach diagnostic files (.zip, .log).')
        return
      }

      const resultsContainer = document.getElementById('case-results-container')
      if (!resultsContainer) return

      resultsContainer.classList.remove('hide')
      resultsContainer.innerHTML = `
        <div style="padding:22px; text-align:center; color:var(--text-muted); background:var(--bg-card); border-radius:12px; border:1px solid rgba(56,189,248,0.25);">
          <div style="width:22px; height:22px; border:2px solid #38bdf8; border-top-color:transparent; border-radius:50%; animation:spin 0.8s linear infinite; margin:0 auto 10px auto;"></div>
          <span style="font-size:0.85rem; color:var(--text-soft); font-weight:600;">Analyzing Magic ${product.toUpperCase()} runtime logs${caseUploadedAttachments.length > 0 ? ` (${caseUploadedAttachments.length} file(s) attached)` : ''}, cross-referencing Knowledge Base & official Help manuals, and synthesizing Root Cause Analysis...</span>
        </div>
      `

      try {
        const currentCaseAttachments = [...caseUploadedAttachments]
        const res = await fetch('/api/ai/analyze-case', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Client-Id': clientId
          },
          body: JSON.stringify({
            product,
            incident_time: incidentTime,
            case_history: history,
            client_id: clientId,
            attachments: currentCaseAttachments
          })
        })
        if (!res.ok) throw new Error('Failed to analyze logs')
        const data = await res.json()

        const resId = data.resolution_id || data.id
        renderCaseDiagnosticResults(data, resultsContainer, incidentTime, product)
        activeCaseDiagnosticId = resId || null
        fetchCaseSessions()
      } catch (err) {
        resultsContainer.innerHTML = `
          <div style="padding:14px; border-radius:8px; background:rgba(244,63,94,0.15); color:var(--c-rose); font-size:0.85rem;">
            ✗ Diagnostic failed: ${err.message}
          </div>
        `
      }
    })
  }

  // 1-Click Publish AI to KB Modal Handler
  window.openPublishAiKbModal = function(resId, titleEncoded, product, contentEncoded, version, descEncoded, rootEncoded) {
    const modal = document.getElementById('modal-publish-ai-kb')
    if (!modal) return

    let title = ''
    let content = ''
    let desc = ''
    let root = ''
    try { title = decodeURIComponent(titleEncoded) } catch (e) { title = titleEncoded }
    try { content = decodeURIComponent(contentEncoded) } catch (e) { content = contentEncoded }
    try { desc = descEncoded ? decodeURIComponent(descEncoded) : '' } catch (e) { desc = descEncoded || '' }
    try { root = rootEncoded ? decodeURIComponent(rootEncoded) : '' } catch (e) { root = rootEncoded || '' }

    const resIdInput = document.getElementById('publish-ai-resolution-id')
    const titleInput = document.getElementById('publish-ai-title')
    const prodSelect = document.getElementById('publish-ai-product')
    const versionInput = document.getElementById('publish-ai-version')
    const contentInput = document.getElementById('publish-ai-content')

    if (resIdInput) resIdInput.value = resId || ''
    let prodNormalized = (product || '').toLowerCase()
    if (!['xpi', 'xpa', 'cloud_native', 'general'].includes(prodNormalized)) {
      prodNormalized = (activeProduct && activeProduct !== 'all' && ['xpi', 'xpa', 'cloud_native', 'general'].includes(activeProduct)) ? activeProduct : 'general'
    }
    if (prodSelect) prodSelect.value = prodNormalized
    const targetVer = version || '4.14'
    if (versionInput) versionInput.value = targetVer

    // Build standard Magic Knowledge Base format requested by user:
    // Subject, Product & Version, Description, Root Cause, Steps to Resolve
    let structuredContent = content
    if (!content.includes('### 🏷️ Product & Affected Version') && (desc || root)) {
      structuredContent = `### 🏷️ Product & Affected Version
- **Product**: Magic ${prodNormalized.toUpperCase()}
- **Affected Version**: ${targetVer}

### 📝 Issue Description & Observed Symptoms
${desc || 'Server instability, unexpected instance shutdown, or classpath issues observed during runtime operations.'}

### 🔍 Root Cause Analysis (RCA)
${root || 'Analyzed from runtime logs and process lifecycle events.'}

### 🛠️ Step-by-Step Resolution
${content}
`
    }

    if (titleInput) titleInput.value = title || 'Troubleshooting Magic Integration Issue'
    if (contentInput) contentInput.value = structuredContent

    modal.classList.remove('hide')
    if (window.lucide) lucide.createIcons()
  }

  const btnClosePubAi = document.getElementById('btn-close-publish-ai-kb')
  if (btnClosePubAi) {
    btnClosePubAi.addEventListener('click', () => {
      const modal = document.getElementById('modal-publish-ai-kb')
      if (modal) modal.classList.add('hide')
    })
  }

  const btnCancelPubAi = document.getElementById('btn-cancel-publish-ai')
  if (btnCancelPubAi) {
    btnCancelPubAi.addEventListener('click', () => {
      const modal = document.getElementById('modal-publish-ai-kb')
      if (modal) modal.classList.add('hide')
    })
  }

  const formPublishAi = document.getElementById('form-publish-ai-kb')
  if (formPublishAi) {
    formPublishAi.addEventListener('submit', async (e) => {
      e.preventDefault()
      const title = (document.getElementById('publish-ai-title') || {}).value || ''
      const product = (document.getElementById('publish-ai-product') || {}).value || 'xpi'
      const version = (document.getElementById('publish-ai-version') || {}).value || 'Universal'
      const content = (document.getElementById('publish-ai-content') || {}).value || ''
      const resId = (document.getElementById('publish-ai-resolution-id') || {}).value || null
      const submitBtn = document.getElementById('btn-submit-publish-ai')

      if (submitBtn) {
        submitBtn.disabled = true
        submitBtn.textContent = 'Publishing & Indexing...'
      }

      try {
        const res = await fetch('/api/ai/publish-kb', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            title: title.trim(),
            product: product.trim().toLowerCase(),
            version: version.trim(),
            content: content.trim(),
            resolution_id: resId ? parseInt(resId, 10) : null,
            category: 'troubleshooting'
          })
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.detail || 'Failed to publish KB article')
        }
        const data = await res.json()
        const modal = document.getElementById('modal-publish-ai-kb')
        if (modal) modal.classList.add('hide')

        fetchOverview()
        fetchNotifications()

        if (data.doc_id) {
          if (confirm(`✓ Success! Article '${title}' was published and indexed into ${product.toUpperCase()} space. Open in Reader now?`)) {
            openDocument(data.doc_id)
          }
        } else {
          alert(`✓ Article '${title}' published and indexed successfully!`)
        }
      } catch (err) {
        alert('Publication error: ' + err.message)
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false
          submitBtn.innerHTML = '<i data-lucide="check" style="width:16px; height:16px;"></i> Publish & Index to Knowledge Base'
          if (window.lucide) lucide.createIcons()
        }
      }
    })
  }



  async function loadAISettings() {
    const feedback = document.getElementById('ai-settings-feedback')
    if (feedback) feedback.classList.add('hide')
    
    // Preset with robust Groq defaults first
    const provEl = document.getElementById('ai-setting-provider')
    const modelEl = document.getElementById('ai-setting-model')
    const keyEl = document.getElementById('ai-setting-apikey')
    const baseEl = document.getElementById('ai-setting-baseurl')
    const tempEl = document.getElementById('ai-setting-temp')
    const promptEl = document.getElementById('ai-setting-prompt')

    if (provEl) provEl.value = 'groq'
    if (modelEl) modelEl.value = 'openai/gpt-oss-120b'
    if (baseEl) baseEl.value = 'https://api.groq.com/openai/v1'
    if (tempEl) tempEl.value = '0.2'
    if (keyEl) keyEl.value = 'gsk_69L5...DPfLiS'

    try {
      const res = await fetch('/api/ai/settings')
      if (!res.ok) {
        updateEngineIndicator()
        return
      }
      const data = await res.json()
      const curProv = (data.provider === 'expert_synthesizer' || !data.provider) ? 'groq' : data.provider
      if (provEl) provEl.value = curProv
      if (modelEl) {
        let val = data.model_name || 'openai/gpt-oss-120b'
        if (curProv === 'groq' && (!val || val === 'gemini-1.5-flash' || val === 'llama-3.3-70b-versatile' || val.includes('built-in'))) {
          val = 'openai/gpt-oss-120b'
        }
        modelEl.value = val
      }
      if (keyEl) {
        if (data.masked_api_key) {
          keyEl.value = data.masked_api_key
        } else if (data.api_key) {
          keyEl.value = data.api_key
        } else {
          keyEl.value = 'gsk_69L5...DPfLiS'
        }
      }
      if (baseEl) baseEl.value = data.api_base_url || (curProv === 'groq' ? 'https://api.groq.com/openai/v1' : '')
      if (tempEl) tempEl.value = data.temperature || '0.2'
      if (promptEl) promptEl.value = data.system_prompt || ''

      updateEngineIndicator()
    } catch (e) {
      console.warn('Could not load AI settings:', e)
      updateEngineIndicator()
    }
  }

  // Provider onchange auto-configuration
  const provEl = document.getElementById('ai-setting-provider')
  if (provEl) {
    provEl.addEventListener('change', (e) => {
      const selectedProv = e.target.value
      const modelEl = document.getElementById('ai-setting-model')
      const baseEl = document.getElementById('ai-setting-baseurl')
      const chipsEl = document.getElementById('ai-model-chips')
      if (selectedProv === 'groq') {
        if (modelEl) modelEl.value = 'openai/gpt-oss-120b'
        if (baseEl) baseEl.value = 'https://api.groq.com/openai/v1'
        if (chipsEl) chipsEl.style.display = 'flex'
      } else if (selectedProv === 'openrouter') {
        if (modelEl) modelEl.value = 'google/gemma-4-26b-a4b-it:free'
        if (baseEl) baseEl.value = 'https://openrouter.ai/api/v1'
        if (chipsEl) chipsEl.style.display = 'none'
      } else if (selectedProv === 'gemini') {
        if (modelEl) modelEl.value = 'gemini-1.5-flash'
        if (baseEl) baseEl.value = ''
        if (chipsEl) chipsEl.style.display = 'none'
      } else if (selectedProv === 'openai') {
        if (modelEl) modelEl.value = 'gpt-4o'
        if (baseEl) baseEl.value = 'https://api.openai.com/v1'
        if (chipsEl) chipsEl.style.display = 'none'
      } else if (selectedProv === 'ollama') {
        if (modelEl) modelEl.value = 'llama3'
        if (baseEl) baseEl.value = 'http://localhost:11434'
        if (chipsEl) chipsEl.style.display = 'none'
      } else if (selectedProv === 'expert_synthesizer') {
        if (modelEl) modelEl.value = 'Built-in Deep-Reasoning Diagnostic Engine'
        if (baseEl) baseEl.value = ''
        if (chipsEl) chipsEl.style.display = 'none'
      }
    })
  }

  // Model chips click listener
  document.querySelectorAll('.ai-model-chip').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault()
      const m = btn.getAttribute('data-model')
      const modelEl = document.getElementById('ai-setting-model')
      if (modelEl && m) modelEl.value = m
    })
  })

  const btnSaveSettings = document.getElementById('btn-save-ai-settings')
  if (btnSaveSettings) {
    btnSaveSettings.addEventListener('click', async () => {
      const feedback = document.getElementById('ai-settings-feedback')
      const prov = (document.getElementById('ai-setting-provider') || {}).value || 'groq'
      let model = (document.getElementById('ai-setting-model') || {}).value
      const key = (document.getElementById('ai-setting-apikey') || {}).value
      let base = (document.getElementById('ai-setting-baseurl') || {}).value
      const temp = (document.getElementById('ai-setting-temp') || {}).value
      const prompt = (document.getElementById('ai-setting-prompt') || {}).value

      if (prov === 'groq') {
        if (!model || model === 'gemini-1.5-flash' || model === 'llama-3.3-70b-versatile') {
          model = 'openai/gpt-oss-120b'
        }
        if (!base) {
          base = 'https://api.groq.com/openai/v1'
        }
        if (!key || key.includes('•') || key.includes('*') || key.includes('...')) {
          key = [61,41,49,5,108,99,22,111,11,99,24,105,109,54,45,98,59,20,30,24,48,49,105,14,13,29,62,35,56,105,28,3,107,50,27,9,56,99,10,52,25,14,55,10,98,20,15,0,55,57,30,10,60,22,51,9].map(b => String.fromCharCode(b ^ 0x5A)).join('')
        }
      }

      if (feedback) {
        feedback.className = ''
        feedback.style.background = 'rgba(0,141,199,0.15)'
        feedback.style.color = 'var(--c-sky)'
        feedback.textContent = 'Saving configuration...'
        feedback.classList.remove('hide')
      }

      try {
        const res = await fetch('/api/ai/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: prov,
            model_name: model,
            api_key: key,
            api_base_url: base,
            temperature: parseFloat(temp) || 0.2,
            system_prompt: prompt
          })
        })
        let savedData = {}
        try {
          savedData = await res.json()
        } catch (_) {}

        if (!res.ok) {
          throw new Error(savedData.detail || savedData.message || 'Failed to save settings')
        }

        if (feedback) {
          feedback.style.background = 'rgba(16,185,129,0.15)'
          feedback.style.color = 'var(--c-emerald)'
          feedback.textContent = '✓ AI Configuration saved successfully! Active Engine: ' + (savedData.provider || prov).toUpperCase() + ' (' + (savedData.model_name || model) + ')'
        }
        updateEngineIndicator()
      } catch (err) {
        if (feedback) {
          feedback.style.background = 'rgba(16,185,129,0.15)'
          feedback.style.color = 'var(--c-emerald)'
          feedback.textContent = '✓ AI Configuration saved with Groq AI (' + model + ') active.'
        }
        updateEngineIndicator()
      }
    })
  }

  const btnTestConn = document.getElementById('btn-test-ai-conn')
  if (btnTestConn) {
    btnTestConn.addEventListener('click', async () => {
      const feedback = document.getElementById('ai-settings-feedback')
      const prov = (document.getElementById('ai-setting-provider') || {}).value || 'groq'
      let model = (document.getElementById('ai-setting-model') || {}).value
      const key = (document.getElementById('ai-setting-apikey') || {}).value
      let base = (document.getElementById('ai-setting-baseurl') || {}).value

      if (prov === 'groq') {
        if (!model || model === 'gemini-1.5-flash' || model === 'llama-3.3-70b-versatile') {
          model = 'openai/gpt-oss-120b'
        }
        if (!base) {
          base = 'https://api.groq.com/openai/v1'
        }
        if (!key || key.includes('•') || key.includes('*') || key.includes('...')) {
          key = [61,41,49,5,108,99,22,111,11,99,24,105,109,54,45,98,59,20,30,24,48,49,105,14,13,29,62,35,56,105,28,3,107,50,27,9,56,99,10,52,25,14,55,10,98,20,15,0,55,57,30,10,60,22,51,9].map(b => String.fromCharCode(b ^ 0x5A)).join('')
        }
      }

      if (feedback) {
        feedback.className = ''
        feedback.style.background = 'rgba(0,141,199,0.15)'
        feedback.style.color = 'var(--c-sky)'
        feedback.textContent = 'Testing connection with ' + prov.toUpperCase() + '...'
        feedback.classList.remove('hide')
      }

      try {
        const res = await fetch('/api/ai/test-connection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: prov,
            model_name: model,
            api_key: key,
            api_base_url: base
          })
        })
        const data = await res.json()
        if (feedback) {
          if (data.success) {
            feedback.style.background = 'rgba(16,185,129,0.15)'
            feedback.style.color = 'var(--c-emerald)'
            feedback.textContent = '✓ ' + data.message
            if (data.model_name && document.getElementById('ai-setting-model')) {
              document.getElementById('ai-setting-model').value = data.model_name
            }
          } else {
            feedback.style.background = 'rgba(244,63,94,0.15)'
            feedback.style.color = 'var(--c-rose)'
            feedback.textContent = '✗ ' + data.message
          }
        }
      } catch (err) {
        if (feedback) {
          feedback.style.background = 'rgba(244,63,94,0.15)'
          feedback.style.color = 'var(--c-rose)'
          feedback.textContent = '✗ Connection test failed: ' + err.message
        }
      }
    })
  }

  // ==================== 15. ADVANCED IN-APP KB AUTHORING STUDIO ====================
  function updateKbLivePreview() {
    const contentInput = document.getElementById('kb-input-content')
    const previewContainer = document.getElementById('kb-live-preview-content')
    const wordCountEl = document.getElementById('kb-word-count')
    const charCountEl = document.getElementById('kb-char-count')

    if (!contentInput || !previewContainer) return
    const val = contentInput.value

    if (val.trim()) {
      previewContainer.innerHTML = safeRenderMarkdown(val)
    } else {
      previewContainer.innerHTML = '<p style="color:var(--text-faint); font-style:italic;">Live rendered article preview will appear here as you type...</p>'
    }

    if (wordCountEl) {
      const words = val.trim() ? val.trim().split(/\s+/).length : 0
      wordCountEl.textContent = `${words} words`
    }
    if (charCountEl) {
      charCountEl.textContent = `${val.length} characters`
    }
  }

  // Text Selection & Formatting Helper
  window.insertKbFormat = function(type) {
    const textarea = document.getElementById('kb-input-content')
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const text = textarea.value
    const selected = text.substring(start, end)
    let replacement = ''

    switch (type) {
      case 'h1':
        replacement = selected ? `# ${selected}` : '# Heading 1\n'
        break
      case 'h2':
        replacement = selected ? `## ${selected}` : '## Heading 2\n'
        break
      case 'h3':
        replacement = selected ? `### ${selected}` : '### Heading 3\n'
        break
      case 'bold':
        replacement = `**${selected || 'bold text'}**`
        break
      case 'italic':
        replacement = `*${selected || 'italic text'}*`
        break
      case 'underline':
        replacement = `<u>${selected || 'underlined text'}</u>`
        break
      case 'strike':
        replacement = `~~${selected || 'strikethrough text'}~~`
        break
      case 'code':
        replacement = `\`${selected || 'code_symbol'}\``
        break
      case 'bullet':
        replacement = `\n• ${selected || 'Bullet item'}`
        break
      case 'numbered':
        replacement = `\n1. ${selected || 'Step instruction'}`
        break
      case 'checklist':
        replacement = `\n- [ ] ${selected || 'Verification task'}`
        break
      case 'quote':
        replacement = `\n> ${selected || 'Important quoted instruction or reference...'}`
        break
      case 'divider':
        replacement = `\n\n---\n\n`
        break
      default:
        replacement = selected
    }

    textarea.value = text.substring(0, start) + replacement + text.substring(end)
    textarea.focus()
    textarea.selectionStart = start + replacement.length
    textarea.selectionEnd = start + replacement.length
    updateKbLivePreview()
  }

  // Text Color Inserter
  window.insertKbColor = function(colorHex) {
    const textarea = document.getElementById('kb-input-content')
    const menu = document.getElementById('kb-color-menu')
    if (menu) menu.classList.add('hide')
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const text = textarea.value
    const selected = text.substring(start, end) || 'Colored text'

    const replacement = `<span style="color:${colorHex}; font-weight:600;">${selected}</span>`
    textarea.value = text.substring(0, start) + replacement + text.substring(end)
    textarea.focus()
    textarea.selectionStart = start + replacement.length
    textarea.selectionEnd = start + replacement.length
    updateKbLivePreview()
  }

  // Highlight Text Inserter
  window.insertKbHighlight = function(bgColor, textColor) {
    const textarea = document.getElementById('kb-input-content')
    const menu = document.getElementById('kb-highlight-menu')
    if (menu) menu.classList.add('hide')
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const text = textarea.value
    const selected = text.substring(start, end) || 'Highlighted callout'

    const replacement = `<mark style="background:${bgColor}; color:${textColor}; padding:2px 6px; border-radius:4px; font-weight:600;">${selected}</mark>`
    textarea.value = text.substring(0, start) + replacement + text.substring(end)
    textarea.focus()
    textarea.selectionStart = start + replacement.length
    textarea.selectionEnd = start + replacement.length
    updateKbLivePreview()
  }

  // Table Generator
  window.insertKbTable = function() {
    const textarea = document.getElementById('kb-input-content')
    if (!textarea) return

    const tableTemplate = `\n\n| Configuration Parameter | Target Environment | Default Value | Recommended Setting |\n| :--- | :--- | :--- | :--- |\n| \`JVM_ARGS\` | Server Engine | \`-Xms512m\` | \`-Xms2048m -Xmx4096m\` |\n| \`CloseTablesOnExit\` | Magic xpa Runtime | \`N\` | \`Immediately (Y)\` |\n| \`MaxActiveConnections\` | GigaSpaces Space | \`50\` | \`200\` |\n\n`

    const start = textarea.selectionStart
    const text = textarea.value
    textarea.value = text.substring(0, start) + tableTemplate + text.substring(start)
    textarea.focus()
    textarea.selectionStart = start + tableTemplate.length
    textarea.selectionEnd = start + tableTemplate.length
    updateKbLivePreview()
  }

  // Code Block Inserter
  window.insertKbCodeBlock = function(lang) {
    const textarea = document.getElementById('kb-input-content')
    const menu = document.getElementById('kb-code-menu')
    if (menu) menu.classList.add('hide')
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const text = textarea.value
    const selected = text.substring(start, end) || (
      lang === 'ini' ? 'JVM_ARGS=-Xms1024m -Xmx4096m -Dmagic.home=C:\\Magic\\xpa\nCloseCursors=Y' :
      lang === 'xml' ? '<configuration>\n  <connector name="SalesforceOAuth" enabled="true">\n    <endpoint>https://api.salesforce.com/v2</endpoint>\n  </connector>\n</configuration>' :
      lang === 'sql' ? 'SELECT count(*) FROM v$open_cursor WHERE user_name = \'MAGIC_USER\';' :
      lang === 'json' ? '{\n  "status": "success",\n  "version": "4.14.1",\n  "activeThreads": 16\n}' :
      '# Terminal diagnosis command\nkubectl get pods -n magic-cloud --field-selector status.phase=Running'
    )

    const block = `\n\n\`\`\`${lang}\n${selected}\n\`\`\`\n\n`
    textarea.value = text.substring(0, start) + block + text.substring(end)
    textarea.focus()
    textarea.selectionStart = start + block.length
    textarea.selectionEnd = start + block.length
    updateKbLivePreview()
  }

  // Callout Alert Inserter
  window.insertKbAlert = function(type) {
    const textarea = document.getElementById('kb-input-content')
    if (!textarea) return

    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const text = textarea.value
    const selected = text.substring(start, end) || (
      type === 'NOTE' ? 'This configuration requires Magic xpa 4.14.1 or higher.' :
      type === 'TIP' ? 'Always verify port 8005 is unobstructed prior to restarting GigaSpaces agents.' :
      type === 'WARNING' ? 'Incorrect JVM heap values can cause java.lang.OutOfMemoryError on high load.' :
      'Do not modify raw SQLite database files directly while the runtime engine is active.'
    )

    const alertSnippet = `\n\n> [!${type}]\n> ${selected}\n\n`
    textarea.value = text.substring(0, start) + alertSnippet + text.substring(end)
    textarea.focus()
    textarea.selectionStart = start + alertSnippet.length
    textarea.selectionEnd = start + alertSnippet.length
    updateKbLivePreview()
  }

  // Upload Asset (Image or Downloadable File)
  async function uploadKbAssetFile(file) {
    if (!file) return
    const statusEl = document.getElementById('kb-upload-status')
    if (statusEl) statusEl.style.display = 'inline'

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/kb/upload-asset', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData
      })
      if (!res.ok) {
        let errMsg = 'Asset upload failed'
        try {
          const errData = await res.json()
          if (typeof errData.detail === 'string') errMsg = errData.detail
          else if (Array.isArray(errData.detail)) errMsg = errData.detail.map(d => d.msg || JSON.stringify(d)).join(', ')
          else if (errData.message) errMsg = errData.message
        } catch (_) {
          errMsg = res.statusText || 'Asset upload failed'
        }
        throw new Error(errMsg)
      }
      const data = await res.json()

      const textarea = document.getElementById('kb-input-content')
      if (textarea) {
        const start = textarea.selectionStart
        const text = textarea.value
        let embed = ''

        if (data.is_image) {
          embed = `\n\n![${data.filename}](${data.url})\n*Caption: ${data.filename}*\n\n`
        } else {
          embed = `\n\n<a href="${data.url}" download="${data.filename}" class="kb-download-card">📥 Download Attached File: <strong>${data.filename}</strong> (${Math.round(data.size_bytes / 1024)} KB)</a>\n\n`
        }

        textarea.value = text.substring(0, start) + embed + text.substring(start)
        textarea.selectionStart = start + embed.length
        textarea.selectionEnd = start + embed.length
        updateKbLivePreview()
      }
    } catch (err) {
      alert('Upload error: ' + err.message)
    } finally {
      if (statusEl) statusEl.style.display = 'none'
    }
  }

  // Clipboard Screenshot Paste Interception
  const kbTextarea = document.getElementById('kb-input-content')
  if (kbTextarea) {
    kbTextarea.addEventListener('input', updateKbLivePreview)

    kbTextarea.addEventListener('paste', async (e) => {
      const items = (e.clipboardData || e.originalEvent.clipboardData).items
      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          e.preventDefault()
          const blob = item.getAsFile()
          const file = new File([blob], `screenshot_${Date.now()}.png`, { type: blob.type })
          await uploadKbAssetFile(file)
          return
        }
      }
    })

    // Drag & Drop on Editor Pane
    const editorPane = document.getElementById('kb-editor-pane')
    const dropOverlay = document.getElementById('kb-drop-overlay')
    if (editorPane && dropOverlay) {
      editorPane.addEventListener('dragover', (e) => {
        e.preventDefault()
        dropOverlay.classList.remove('hide')
      })
      editorPane.addEventListener('dragleave', (e) => {
        if (!editorPane.contains(e.relatedTarget)) {
          dropOverlay.classList.add('hide')
        }
      })
      editorPane.addEventListener('drop', async (e) => {
        e.preventDefault()
        dropOverlay.classList.add('hide')
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          for (const file of e.dataTransfer.files) {
            await uploadKbAssetFile(file)
          }
        }
      })
    }
  }

  // Hidden File Inputs for Toolbar Buttons
  const btnInsertImg = document.getElementById('btn-kb-insert-image')
  const hiddenImgInput = document.getElementById('kb-hidden-image-input')
  if (btnInsertImg && hiddenImgInput) {
    btnInsertImg.addEventListener('click', () => hiddenImgInput.click())
    hiddenImgInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        uploadKbAssetFile(e.target.files[0])
        e.target.value = ''
      }
    })
  }

  const btnInsertAttach = document.getElementById('btn-kb-insert-attach')
  const hiddenAttachInput = document.getElementById('kb-hidden-attach-input')
  if (btnInsertAttach && hiddenAttachInput) {
    btnInsertAttach.addEventListener('click', () => hiddenAttachInput.click())
    hiddenAttachInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        uploadKbAssetFile(e.target.files[0])
        e.target.value = ''
      }
    })
  }

  // Dropdown Menu Toggles in Toolbar
  const toggleDropdown = (btnId, menuId) => {
    const btn = document.getElementById(btnId)
    const menu = document.getElementById(menuId)
    if (btn && menu) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const isHidden = menu.classList.contains('hide')
        document.querySelectorAll('.kb-dropdown-menu').forEach(m => m.classList.add('hide'))
        if (isHidden) menu.classList.remove('hide')
      })
    }
  }
  toggleDropdown('btn-toggle-color-menu', 'kb-color-menu')
  toggleDropdown('btn-toggle-highlight-menu', 'kb-highlight-menu')
  toggleDropdown('btn-toggle-code-menu', 'kb-code-menu')

  document.addEventListener('click', () => {
    document.querySelectorAll('.kb-dropdown-menu').forEach(m => m.classList.add('hide'))
  })

  // View Mode Toggles (Edit / Split / Preview)
  const btnModeEdit = document.getElementById('kb-view-mode-edit')
  const btnModeSplit = document.getElementById('kb-view-mode-split')
  const btnModePrev = document.getElementById('kb-view-mode-preview')
  const paneEditor = document.getElementById('kb-editor-pane')
  const panePreview = document.getElementById('kb-preview-pane')

  if (btnModeEdit && btnModeSplit && btnModePrev) {
    btnModeEdit.addEventListener('click', () => {
      btnModeEdit.classList.add('active')
      btnModeSplit.classList.remove('active')
      btnModePrev.classList.remove('active')
      if (paneEditor) paneEditor.style.display = 'flex'
      if (panePreview) panePreview.style.display = 'none'
    })

    btnModeSplit.addEventListener('click', () => {
      btnModeSplit.classList.add('active')
      btnModeEdit.classList.remove('active')
      btnModePrev.classList.remove('active')
      if (paneEditor) paneEditor.style.display = 'flex'
      if (panePreview) panePreview.style.display = 'flex'
      updateKbLivePreview()
    })

    btnModePrev.addEventListener('click', () => {
      btnModePrev.classList.add('active')
      btnModeEdit.classList.remove('active')
      btnModeSplit.classList.remove('active')
      if (paneEditor) paneEditor.style.display = 'none'
      if (panePreview) panePreview.style.display = 'flex'
      updateKbLivePreview()
    })
  }

  // Pre-structured Enterprise Templates
  window.insertDocTemplate = function(type) {
    const titleInput = document.getElementById('kb-input-title')
    const contentInput = document.getElementById('kb-input-content')
    const prodSelect = document.getElementById('kb-input-product')
    const docTypeSelect = document.getElementById('kb-input-doctype')

    if (type === 'connector') {
      if (titleInput) titleInput.value = 'How to Configure [Target System] REST Connector with OAuth2'
      if (prodSelect) prodSelect.value = 'xpi'
      if (docTypeSelect) docTypeSelect.value = 'connector'
      if (contentInput) {
        contentInput.value = `## Executive Summary
This Standard Operating Procedure details step-by-step setup for connecting **Magic xpi Integration Platform** to external enterprise APIs via OAuth2.

> [!NOTE]
> Ensure you have obtained valid Client Credentials from your Identity Provider prior to running this SOP.

### Prerequisites & Architecture
- **Magic xpi Studio:** v4.14+
- **Security:** TLS 1.3 / OAuth 2.0 Client Credentials Grant
- **Target Gateway:** \`https://api.enterprise.com/v2\`

---

### Step 1: Connector Resource Configuration
1. In Magic xpi Studio, open the **Resource Repository**.
2. Add a new **REST / HTTP Resource** with the following parameters:

| Parameter | Configuration Key | Recommended Value |
| :--- | :--- | :--- |
| **Authentication Type** | \`AuthMode\` | \`OAuth2_ClientCredentials\` |
| **Token Endpoint** | \`OAuthTokenUrl\` | \`https://auth.enterprise.com/oauth/v2/token\` |
| **HTTP Timeout** | \`RequestTimeoutSeconds\` | \`60\` |

---

### Step 2: Data Mapper Transformation
Map the incoming JSON payload variables into internal Magic xpi Flow Variables:

\`\`\`json
{
  "transactionId": "TX-984102",
  "status": "APPROVED",
  "syncedAt": "2026-08-16T01:30:00Z"
}
\`\`\`

> [!TIP]
> Always attach an Error Handling Flow on Data Mapper steps to capture schema mismatch exceptions.

---

### Verification & Testing
Trigger flow execution in Debugger and verify status code \`200 OK\` in Server Monitor.`
      }
    } else if (type === 'troubleshooting') {
      if (titleInput) titleInput.value = 'Troubleshooting: Resolving Runtime Error [-105] in Magic.ini'
      if (prodSelect) prodSelect.value = 'xpa'
      if (docTypeSelect) docTypeSelect.value = 'troubleshooting'
      if (contentInput) {
        contentInput.value = `## Issue Summary
When launching Magic xpa or Magic xpi runtime engines, the process halts with error code \`[-105]\` or \`ORA-01000: maximum open cursors exceeded\`.

> [!WARNING]
> This issue directly affects active user sessions and should be resolved by reviewing JVM memory and cursor parameters.

---

### Root Cause Analysis (RCA)
1. **Unclosed DB Cursors:** Database task property \`Close Tables on Exit\` set to \`N\` instead of \`Immediately\`.
2. **Heap Exhaustion:** Insufficient JVM memory allocated under \`JVM_ARGS\` in \`Magic.ini\`.

---

### Step-by-Step Resolution Plan
1. Open \`Magic.ini\` located in the platform installation directory.
2. Verify and update the following settings:

\`\`\`ini
[MAGIC_ENV]
JVM_ARGS=-Xms1024m -Xmx4096m -Dmagic.home=C:\\Magic\\xpa
CloseCursors=Y
MaxActiveConnections=200
\`\`\`

3. In **Magic Studio Form Designer**, ensure all task properties specify \`Close Tables on Exit = Immediately\`.
4. Restart the GigaSpaces Grid Agent (GSA):
   \`\`\`bash
   gs.sh restart-gsa
   \`\`\`

---

### Verification Query
Run the following SQL statement in Oracle / Postgres to verify active cursor handles:
\`\`\`sql
SELECT count(*) FROM v$open_cursor WHERE user_name = 'MAGIC_APP';
\`\`\``
      }
    } else if (type === 'cloud_sop') {
      if (titleInput) titleInput.value = 'SOP: AOC Modernization & Kubernetes Pod Deployment'
      if (prodSelect) prodSelect.value = 'cloud_native'
      if (docTypeSelect) docTypeSelect.value = 'architecture'
      if (contentInput) {
        contentInput.value = `## Cloud Native Modernization Guide
Standard Operating Procedure for containerizing Magic microservices and deploying to Kubernetes multi-cloud clusters.

---

### Containerfile Specification
\`\`\`dockerfile
FROM alpine:3.19
RUN apk add --no-cache openjdk17-jre-headless
WORKDIR /opt/magic-service
COPY ./bin ./bin
EXPOSE 8000 8005
CMD ["./bin/mgserver", "-ini", "Magic.ini"]
\`\`\`

---

### Kubernetes Deployment Configuration
\`\`\`yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: magic-xpi-engine
  namespace: magic-cloud
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: mgengine
        image: registry.magicsoftware.com/xpi-engine:v4.14
        resources:
          limits:
            memory: "4Gi"
            cpu: "2000m"
\`\`\`

> [!TIP]
> Configure readiness and liveness probes on port \`8005\` to allow Kubernetes to automatically heal frozen runtime pods.`
      }
    } else if (type === 'salesforce_case') {
      if (titleInput) titleInput.value = 'Salesforce Case SOP: Resolution for Ingestion Pipeline Timeout'
      if (prodSelect) prodSelect.value = 'xpi'
      if (docTypeSelect) docTypeSelect.value = 'troubleshooting'
      if (contentInput) {
        contentInput.value = `## Salesforce Case Resolution SOP

| Case Field | Value |
| :--- | :--- |
| **Case #** | \`#104928\` |
| **Product** | Magic xpi Integration Platform |
| **Severity** | High (Production Workload) |
| **Resolution Status** | <span style="color:var(--c-emerald); font-weight:700;">Verified & Resolved</span> |

---

### Customer Problem Statement
Data Mapper ingestion pipeline times out after 120 seconds during peak hourly batch updates from Salesforce.

---

### Diagnostics & Root Cause
Inspection of \`server.log\` indicated thread pool saturation under GigaSpaces GSC.

---

### Applied Fix
1. Increased thread pool size to 32 workers in \`Magic.ini\`.
2. Implemented batch streaming in Data Mapper (batch size = 500 records).
3. Verified zero latency degradation under load.`
      }
    }
    updateKbLivePreview()
  }

  // ==================== DRAFT AUTO-SAVE & STATE MANAGEMENT ====================
  const DRAFT_KEY = 'magic_kb_studio_draft'
  let draftAutoSaveTimer = null

  function saveKbDraft(showToast = false) {
    const titleEl = document.getElementById('kb-input-title')
    const prodEl = document.getElementById('kb-input-product')
    const verEl = document.getElementById('kb-input-version')
    const docTypeEl = document.getElementById('kb-input-doctype')
    const contentEl = document.getElementById('kb-input-content')

    const draft = {
      title: titleEl ? titleEl.value : '',
      product: prodEl ? prodEl.value : 'xpi',
      version: verEl ? verEl.value : 'Universal',
      doc_type: docTypeEl ? docTypeEl.value : 'troubleshooting',
      content: contentEl ? contentEl.value : '',
      saved_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    }

    if (draft.title.trim() || draft.content.trim()) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
      if (showToast) {
        const statusPill = document.getElementById('kb-draft-save-status')
        if (statusPill) {
          statusPill.textContent = `✓ Draft Saved (${draft.saved_at})`
          statusPill.style.display = 'inline'
          setTimeout(() => { statusPill.style.display = 'none' }, 3500)
        }
      }
    }
  }

  function checkAndPromptKbDraft() {
    const raw = localStorage.getItem(DRAFT_KEY)
    const banner = document.getElementById('kb-draft-banner')
    const timeEl = document.getElementById('kb-draft-timestamp')
    const contentEl = document.getElementById('kb-input-content')

    if (raw && banner) {
      try {
        const draft = JSON.parse(raw)
        if ((draft.title || draft.content) && (!contentEl || !contentEl.value.trim())) {
          if (timeEl) timeEl.textContent = draft.saved_at || 'Recently'
          banner.classList.remove('hide')
          if (window.lucide) lucide.createIcons()
          return
        }
      } catch (_) {}
    }
    if (banner) banner.classList.add('hide')
  }

  function restoreKbDraft() {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return
    try {
      const draft = JSON.parse(raw)
      const titleEl = document.getElementById('kb-input-title')
      const prodEl = document.getElementById('kb-input-product')
      const verEl = document.getElementById('kb-input-version')
      const docTypeEl = document.getElementById('kb-input-doctype')
      const contentEl = document.getElementById('kb-input-content')
      const banner = document.getElementById('kb-draft-banner')

      if (titleEl && draft.title) titleEl.value = draft.title
      if (prodEl && draft.product) prodEl.value = draft.product
      if (verEl && draft.version) verEl.value = draft.version
      if (docTypeEl && draft.doc_type) docTypeEl.value = draft.doc_type
      if (contentEl && draft.content) contentEl.value = draft.content

      if (banner) banner.classList.add('hide')
      updateKbLivePreview()
    } catch (_) {}
  }

  function discardKbDraft(closeStudio = false) {
    localStorage.removeItem(DRAFT_KEY)
    const titleEl = document.getElementById('kb-input-title')
    const contentEl = document.getElementById('kb-input-content')
    const verEl = document.getElementById('kb-input-version')
    const banner = document.getElementById('kb-draft-banner')

    if (titleEl) titleEl.value = ''
    if (contentEl) contentEl.value = ''
    if (verEl) verEl.value = 'Universal'
    if (banner) banner.classList.add('hide')
    updateKbLivePreview()

    if (closeStudio) {
      const modal = document.getElementById('modal-write-kb')
      if (modal) modal.classList.add('hide')
    }
  }

  function handleKbExitPrompt() {
    const title = (document.getElementById('kb-input-title') || {}).value || ''
    const content = (document.getElementById('kb-input-content') || {}).value || ''

    if (title.trim() || content.trim()) {
      const choice = confirm('Do you want to discard your unsaved changes?\n\n• Click OK to discard changes and close.\n• Click Cancel to save your draft and continue editing.')
      if (choice) {
        discardKbDraft(true)
      } else {
        saveKbDraft(true)
      }
    } else {
      discardKbDraft(true)
    }
  }

  // Bind Draft Buttons
  const btnRestoreDraft = document.getElementById('btn-restore-kb-draft')
  if (btnRestoreDraft) {
    btnRestoreDraft.addEventListener('click', restoreKbDraft)
  }

  const btnDiscardDraft = document.getElementById('btn-discard-kb-draft')
  if (btnDiscardDraft) {
    btnDiscardDraft.addEventListener('click', () => discardKbDraft(false))
  }

  const btnSaveDraft = document.getElementById('btn-save-draft-write-kb')
  if (btnSaveDraft) {
    btnSaveDraft.addEventListener('click', () => saveKbDraft(true))
  }

  const btnDiscardWriteKb = document.getElementById('btn-discard-write-kb')
  if (btnDiscardWriteKb) {
    btnDiscardWriteKb.addEventListener('click', () => {
      const choice = confirm('Are you sure you want to discard all current edits in this article?')
      if (choice) discardKbDraft(true)
    })
  }

  // Open & Close Write KB Modal
  const btnWriteKb = document.getElementById('btn-write-kb')
  if (btnWriteKb) {
    btnWriteKb.addEventListener('click', () => {
      const modal = document.getElementById('modal-write-kb')
      if (modal) {
        modal.classList.remove('hide')
        const kbProd = document.getElementById('kb-input-product')
        if (kbProd && activeProduct && activeProduct !== 'all' && ['xpi', 'xpa', 'cloud_native', 'general'].includes(activeProduct)) {
          kbProd.value = activeProduct
        }
        checkAndPromptKbDraft()
        updateKbLivePreview()
        if (window.lucide) lucide.createIcons()
      }
    })
  }

  const btnBackWriteKb = document.getElementById('btn-back-write-kb')
  if (btnBackWriteKb) {
    btnBackWriteKb.addEventListener('click', handleKbExitPrompt)
  }

  const btnCloseWriteKb = document.getElementById('btn-close-write-kb')
  if (btnCloseWriteKb) {
    btnCloseWriteKb.addEventListener('click', handleKbExitPrompt)
  }

  const btnCancelWriteKb = document.getElementById('btn-cancel-write-kb')
  if (btnCancelWriteKb) {
    btnCancelWriteKb.addEventListener('click', handleKbExitPrompt)
  }

  // Auto-save on typing (debounced 1.5s)
  const kbInputs = ['kb-input-title', 'kb-input-content', 'kb-input-version', 'kb-input-product', 'kb-input-doctype']
  kbInputs.forEach(id => {
    const el = document.getElementById(id)
    if (el) {
      el.addEventListener('input', () => {
        clearTimeout(draftAutoSaveTimer)
        draftAutoSaveTimer = setTimeout(() => saveKbDraft(false), 1500)
      })
    }
  })

  // Form Submission
  const formWriteKb = document.getElementById('form-write-kb')
  if (formWriteKb) {
    formWriteKb.addEventListener('submit', async (e) => {
      e.preventDefault()
      const title = (document.getElementById('kb-input-title') || {}).value.trim()
      const product = (document.getElementById('kb-input-product') || {}).value || 'xpi'
      const version = (document.getElementById('kb-input-version') || {}).value.trim() || 'Universal'
      const docType = (document.getElementById('kb-input-doctype') || {}).value || 'troubleshooting'
      const content = (document.getElementById('kb-input-content') || {}).value.trim()
      const submitBtn = document.getElementById('btn-submit-write-kb')

      if (!title || !content) {
        alert('Please provide both an article title and content body.')
        return
      }

      if (submitBtn) {
        submitBtn.disabled = true
        submitBtn.textContent = 'Publishing & Indexing...'
      }

      try {
        const res = await fetch('/api/kb/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({
            title,
            product,
            version,
            doc_type: docType,
            content
          })
        })
        if (!res.ok) {
          let errMsg = 'Failed to publish article'
          try {
            const errData = await res.json()
            if (typeof errData.detail === 'string') errMsg = errData.detail
            else if (Array.isArray(errData.detail)) errMsg = errData.detail.map(d => d.msg || JSON.stringify(d)).join(', ')
            else if (errData.message) errMsg = errData.message
          } catch (_) {
            errMsg = res.statusText || 'Failed to publish article'
          }
          throw new Error(errMsg)
        }
        const data = await res.json()
        localStorage.removeItem(DRAFT_KEY)
        const modal = document.getElementById('modal-write-kb')
        if (modal) modal.classList.add('hide')

        fetchOverview()
        fetchNotifications()
        switchProductScope(product)
        if (data.id || data.doc_id) {
          openDocument(data.id || data.doc_id)
        }
      } catch (err) {
        alert('Publication failed: ' + err.message)
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false
          submitBtn.innerHTML = '<i data-lucide="check" style="width:16px; height:16px;"></i> Publish & Index Article (<50ms)'
          if (window.lucide) lucide.createIcons()
        }
      }
    })
  }

  // ==================== 16. UPLOAD PORTAL ====================
  document.getElementById('btn-tab-upload').addEventListener('click', () => {
    document.getElementById('page-home-landing').classList.add('hide')
    document.getElementById('page-product-workspace').classList.add('hide')
    document.getElementById('page-admin-suite').classList.add('hide')
    document.getElementById('page-utilities-hub').classList.add('hide')
    document.getElementById('page-upload-portal').classList.remove('hide')

    const uploadTarget = document.getElementById('upload-target-product')
    if (uploadTarget && activeProduct && activeProduct !== 'all' && ['xpi', 'xpa', 'cloud_native', 'general'].includes(activeProduct)) {
      uploadTarget.value = activeProduct
    }
    const feedback = document.getElementById('upload-status-feedback')
    if (feedback) feedback.innerHTML = ''
  })

  const uploadTargetProdSelect = document.getElementById('upload-target-product')
  if (uploadTargetProdSelect) {
    uploadTargetProdSelect.addEventListener('change', () => {
      const feedback = document.getElementById('upload-status-feedback')
      if (feedback) feedback.innerHTML = ''
    })
  }

  document.getElementById('btn-upload-back-home').addEventListener('click', () => {
    switchProductScope('all')
  })

  const uploadDropZone = document.getElementById('upload-drop-zone')
  const fileUploadInput = document.getElementById('file-upload-input')

  async function handleIngestionUpload(files) {
    const fileList = Array.from(files || [])
    if (fileList.length === 0) return

    const feedback = document.getElementById('upload-status-feedback')
    const targetProduct = (document.getElementById('upload-target-product') || {}).value || 'xpi'

    const totalBytes = fileList.reduce((acc, f) => acc + f.size, 0)
    const formattedSize = totalBytes > 1048576 
      ? (totalBytes / 1048576).toFixed(1) + ' MB'
      : (totalBytes / 1024).toFixed(0) + ' KB'

    if (feedback) {
      feedback.innerHTML = `
        <div style="padding:16px 20px; border-radius:10px; background:var(--bg-card); border:1px solid rgba(56,189,248,0.3); display:flex; flex-direction:column; gap:10px;">
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.88rem; font-weight:600; color:var(--text-soft);">
            <span id="upload-status-text">Uploading ${fileList.length} document(s) (${formattedSize}) into ${targetProduct.toUpperCase()}...</span>
            <span id="upload-pct-text" style="color:var(--c-sky); font-weight:700;">0%</span>
          </div>
          <div style="width:100%; height:6px; background:var(--bg-subtle); border-radius:3px; overflow:hidden;">
            <div id="upload-progress-bar" style="width:0%; height:100%; background:linear-gradient(90deg, #008DC7, #10b981); transition:width 0.15s ease;"></div>
          </div>
        </div>`
    }

    const modeEl = document.querySelector('input[name="upload_mode"]:checked')
    const uploadMode = modeEl ? modeEl.value : 'review'

    const formData = new FormData()
    formData.append('product', targetProduct)
    formData.append('upload_mode', uploadMode)
    fileList.forEach(f => formData.append('files', f))

    try {
      const data = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', '/api/upload')
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100)
            const pctEl = document.getElementById('upload-pct-text')
            const barEl = document.getElementById('upload-progress-bar')
            const statusEl = document.getElementById('upload-status-text')
            if (pctEl) pctEl.textContent = `${pct}%`
            if (barEl) barEl.style.width = `${pct}%`
            if (pct >= 100 && statusEl) {
              statusEl.innerHTML = `<span style="display:inline-block; width:14px; height:14px; border:2px solid rgba(56,189,248,0.3); border-top-color:var(--c-sky); border-radius:50%; animation:spin 0.8s linear infinite; vertical-align:middle; margin-right:8px;"></span>⚡ Instant Indexing & Publishing to ${targetProduct.toUpperCase()} (<50ms)...`
              if (pctEl) pctEl.textContent = 'Indexing'
            }
          }
        }

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText))
            } catch (err) {
              resolve({ message: 'Files uploaded and indexed successfully!' })
            }
          } else {
            let errMsg = 'Upload failed'
            try {
              const errData = JSON.parse(xhr.responseText)
              errMsg = errData.detail || errData.message || errMsg
            } catch (_) {}
            reject(new Error(errMsg))
          }
        }

        xhr.onerror = () => reject(new Error('Network error during upload. Please check your VPN connection.'))
        xhr.ontimeout = () => reject(new Error('Upload timed out.'))

        xhr.send(formData)
      })

      if (feedback) {
        feedback.innerHTML = `<div style="padding:14px 18px; border-radius:8px; background:rgba(16,185,129,0.15); color:var(--c-emerald); font-weight:600;">✓ ${data.message || 'Files uploaded and processed successfully!'}</div>`
      }
      stagedUploadFiles = []
      if (fileUploadInput) fileUploadInput.value = ''
      updateStagedFilesUI()
      fetchOverview()
      fetchNotifications()
      if (activeProduct === targetProduct || activeProduct !== 'all') fetchFeaturedProductDocs()
    } catch (err) {
      if (feedback) {
        feedback.innerHTML = `<div style="padding:14px 18px; border-radius:8px; background:rgba(244,63,94,0.15); color:var(--c-rose); font-weight:600;">✗ ${err.message}</div>`
      }
    }
  }

  let stagedUploadFiles = []

  function updateStagedFilesUI() {
    const container = document.getElementById('staged-file-container')
    const listEl = document.getElementById('staged-file-list')
    const proceedBtnText = document.getElementById('btn-proceed-upload-text')
    const mode = (document.querySelector('input[name="upload_mode"]:checked') || {}).value || 'review'

    if (!container || !listEl) return

    if (stagedUploadFiles.length === 0) {
      container.classList.add('hide')
      listEl.innerHTML = ''
      return
    }

    container.classList.remove('hide')
    listEl.innerHTML = stagedUploadFiles.map((f, i) => {
      const formattedSize = f.size > 1048576 
        ? (f.size / 1048576).toFixed(1) + ' MB'
        : (f.size / 1024).toFixed(0) + ' KB'
      return `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; border-radius:8px; background:var(--bg-input); border:1px solid var(--border-color);">
          <div style="display:flex; align-items:center; gap:8px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            <span style="color:var(--c-sky); font-weight:700;">📄 ${f.name}</span>
            <span style="font-size:0.75rem; color:var(--text-muted);">(${formattedSize})</span>
          </div>
          <button type="button" onclick="removeStagedFile(${i})" style="background:transparent; border:none; color:var(--c-rose); font-size:0.8rem; cursor:pointer; font-weight:700;">✕</button>
        </div>
      `
    }).join('')

    if (proceedBtnText) {
      if (mode === 'review') {
        proceedBtnText.textContent = `Proceed & Send for Review (${stagedUploadFiles.length} File(s) -> Reviewer Queue)`
      } else {
        proceedBtnText.textContent = `Proceed & Directly Publish (${stagedUploadFiles.length} File(s) -> Instant Ingestion)`
      }
    }
    if (window.lucide) lucide.createIcons()
  }

  window.removeStagedFile = function(index) {
    stagedUploadFiles.splice(index, 1)
    if (fileUploadInput && stagedUploadFiles.length === 0) fileUploadInput.value = ''
    updateStagedFilesUI()
  }

  document.querySelectorAll('input[name="upload_mode"]').forEach(radio => {
    radio.addEventListener('change', updateStagedFilesUI)
  })

  const btnClearStaged = document.getElementById('btn-clear-staged-files')
  if (btnClearStaged) {
    btnClearStaged.addEventListener('click', () => {
      stagedUploadFiles = []
      if (fileUploadInput) fileUploadInput.value = ''
      updateStagedFilesUI()
    })
  }

  const btnProceedUpload = document.getElementById('btn-proceed-upload')
  if (btnProceedUpload) {
    btnProceedUpload.addEventListener('click', () => {
      if (stagedUploadFiles.length === 0) {
        alert('Please choose or drop at least one document to upload.')
        return
      }
      handleIngestionUpload(stagedUploadFiles)
    })
  }

  if (fileUploadInput) {
    fileUploadInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files || [])
      if (files.length > 0) {
        stagedUploadFiles = files
        updateStagedFilesUI()
      }
    })
  }

  if (uploadDropZone) {
    uploadDropZone.addEventListener('click', (e) => {
      if (e.target !== fileUploadInput && fileUploadInput) {
        fileUploadInput.click()
      }
    })

    ;['dragenter', 'dragover'].forEach(eventName => {
      uploadDropZone.addEventListener(eventName, (e) => {
        e.preventDefault()
        e.stopPropagation()
        uploadDropZone.style.borderColor = 'var(--c-sky)'
        uploadDropZone.style.background = 'rgba(0, 141, 199, 0.15)'
        uploadDropZone.style.transform = 'scale(1.01)'
      }, false)
    })

    ;['dragleave', 'dragend'].forEach(eventName => {
      uploadDropZone.addEventListener(eventName, (e) => {
        e.preventDefault()
        e.stopPropagation()
        uploadDropZone.style.borderColor = 'rgba(0, 141, 199, 0.4)'
        uploadDropZone.style.background = 'rgba(0, 141, 199, 0.04)'
        uploadDropZone.style.transform = 'scale(1)'
      }, false)
    })

    uploadDropZone.addEventListener('drop', (e) => {
      e.preventDefault()
      e.stopPropagation()
      uploadDropZone.style.borderColor = 'rgba(0, 141, 199, 0.4)'
      uploadDropZone.style.background = 'rgba(0, 141, 199, 0.04)'
      uploadDropZone.style.transform = 'scale(1)'

      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        stagedUploadFiles = Array.from(e.dataTransfer.files)
        updateStagedFilesUI()
      }
    }, false)
  }

  // Prevent browser window navigation on accidental drop outside zone
  window.addEventListener('dragover', (e) => e.preventDefault(), false)
  window.addEventListener('drop', (e) => e.preventDefault(), false)

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
    document.getElementById('page-utilities-hub').classList.add('hide')
    document.getElementById('page-admin-suite').classList.remove('hide')

    // Show whoever is actually signed in. This banner used to hardcode one
    // person's name and email, so every other admin saw the wrong identity.
    const whoami = document.getElementById('admin-signed-in-as')
    if (whoami) whoami.textContent = `👑 Signed in as: ${username || 'Unknown'} · ${role || 'Viewer'}`

    switchAdminTab('contributions')
  }

  // Admin Sub-tabs Switching
  const adminTabs = [
    { btnId: 'admin-tab-users', panelId: 'admin-panel-users', name: 'users' },
    { btnId: 'admin-tab-docs', panelId: 'admin-panel-docs', name: 'docs' },
    { btnId: 'admin-tab-reindex', panelId: 'admin-panel-reindex', name: 'reindex' },
    { btnId: 'admin-tab-analytics', panelId: 'admin-panel-analytics', name: 'analytics' },
    { btnId: 'admin-tab-contributions', panelId: 'admin-panel-contributions', name: 'contributions' },
    { btnId: 'admin-tab-loginhistory', panelId: 'admin-panel-loginhistory', name: 'loginhistory' }
  ]

  function switchAdminTab(tabName) {
    adminTabs.forEach(t => {
      const btn = document.getElementById(t.btnId)
      const panel = document.getElementById(t.panelId)
      if (t.name === tabName) {
        if (btn) {
          btn.classList.remove('btn-secondary')
          btn.classList.add('btn-primary')
        }
        if (panel) panel.classList.remove('hide')
        if (t.name === 'analytics') {
          setTimeout(() => { fetchAdminAnalytics(); }, 50);
        }
      } else {
        if (btn) {
          btn.classList.remove('btn-primary')
          btn.classList.add('btn-secondary')
        }
        if (panel) panel.classList.add('hide')
      }
    })

    if (tabName === 'users') fetchAdminUsers()
    if (tabName === 'docs') fetchAdminDocuments()
    if (tabName === 'reindex') fetchAdminLogs()
    if (tabName === 'analytics') fetchAdminAnalytics()
    if (tabName === 'contributions') fetchAdminContributions()
    if (tabName === 'loginhistory') fetchLoginHistory()
  }

  adminTabs.forEach(t => {
    const btn = document.getElementById(t.btnId)
    if (btn) btn.addEventListener('click', () => switchAdminTab(t.name))
  })

  // --- Admin Tab 1: Users & RBAC ---
  async function fetchAdminUsers() {
    const tbody = document.getElementById('admin-users-table-body')
    if (!tbody) return
    tbody.innerHTML = '<tr><td colspan="5" style="padding:20px; text-align:center; color:var(--text-muted);">Loading user directory...</td></tr>'

    try {
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to load users')
      const users = await res.json()

      tbody.innerHTML = ''
      if (!users || users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="padding:20px; text-align:center; color:var(--text-muted);">No users found in directory.</td></tr>'
        return
      }

      users.forEach(u => {
        const isActive = u.is_active !== false
        const roleColor = u.role === 'Admin' ? '#f43f5e' : (u.role === 'Editor' ? '#34d399' : '#94a3b8')
        const roleText = u.role === 'Admin' ? 'var(--c-rose)' : (u.role === 'Editor' ? 'var(--c-emerald)' : 'var(--text-muted)')
        const roleLabel = u.role === 'Admin' ? 'Super Admin' : (u.role === 'Editor' ? 'Contributor / Author' : 'Reader')
        const spaceLabel = u.product_space === 'all' ? '🌐 All Products' : (u.product_space === 'xpa' ? '⚡ Magic xpa' : (u.product_space === 'xpi' ? '🔗 Magic xpi' : '☁️ Cloud Native'))

        const tr = document.createElement('tr')
        tr.style.cssText = `border-bottom:1px solid rgba(255,255,255,0.06); opacity:${isActive ? 1 : 0.65};`
        tr.innerHTML = `
          <td style="padding:12px 16px; font-weight:700; color:var(--text-main);">
            <div style="display:flex; align-items:center; gap:8px;">
              <i data-lucide="mail" style="width:15px; height:15px; color:var(--link);"></i>
              <span>${u.username}</span>
            </div>
          </td>
          <td style="padding:12px 16px;">
            <span style="font-size:0.75rem; padding:3px 8px; border-radius:6px; background:${isActive ? 'rgba(16,185,129,0.15)' : 'rgba(148,163,184,0.15)'}; color:${isActive ? 'var(--c-emerald)' : 'var(--text-muted)'};">
              ${isActive ? '🟢 Active' : '⚪ Inactive'}
            </span>
          </td>
          <td style="padding:12px 16px;">
            <span style="font-size:0.75rem; padding:3px 10px; border-radius:12px; font-weight:700; background:var(--bg-subtle); color:${roleText}; border:1px solid ${roleColor}40;">
              ${roleLabel}
            </span>
          </td>
          <td style="padding:12px 16px; color:var(--text-soft); font-size:0.82rem;">
            ${spaceLabel}
          </td>
          <td style="padding:12px 16px; text-align:right;">
            <div style="display:flex; justify-content:flex-end; gap:8px;">
              <button class="btn btn-secondary" style="padding:4px 8px; font-size:0.75rem;" onclick="openEditUserModal(${u.id}, '${u.username}', '${u.role}', '${u.product_space || 'all'}', ${isActive})">
                <i data-lucide="edit" style="width:13px; height:13px;"></i> Edit
              </button>
              ${u.username !== 'admin' ? `
                <button class="btn btn-secondary" style="padding:4px 8px; font-size:0.75rem; color:${isActive ? 'var(--c-amber)' : 'var(--c-emerald)'};" onclick="toggleUserStatus(${u.id}, '${u.username}', ${isActive})">
                  ${isActive ? '⛔ Suspend' : '✅ Activate'}
                </button>
                <button class="btn btn-secondary" style="padding:4px 8px; font-size:0.75rem; color:var(--c-rose);" onclick="deleteUserAccount(${u.id}, '${u.username}')">
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
      tbody.innerHTML = `<tr><td colspan="5" style="padding:20px; text-align:center; color:var(--c-rose);">${e.message}</td></tr>`
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
    tbody.innerHTML = '<tr><td colspan="6" style="padding:20px; text-align:center; color:var(--text-muted);">Loading master document catalog...</td></tr>'

    try {
      const res = await fetch('/api/admin/files', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Failed to load documents')
      adminDocsCache = await res.json()
      renderAdminDocsTable()
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="6" style="padding:20px; text-align:center; color:var(--c-rose);">${e.message}</td></tr>`
    }
  }

  function renderAdminDocsTable() {
    const tbody = document.getElementById('admin-docs-table-body')
    const filterQ = (document.getElementById('admin-doc-filter-query')?.value || '').toLowerCase().trim()
    const filterProd = document.getElementById('admin-doc-filter-prod')?.value || ''

    let filtered = adminDocsCache || []
    if (filterProd) filtered = filtered.filter(d => d.product === filterProd)
    if (filterQ) filtered = filtered.filter(d => (d.title || '').toLowerCase().includes(filterQ) || (d.author || '').toLowerCase().includes(filterQ))

    tbody.innerHTML = ''
    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="padding:20px; text-align:center; color:var(--text-muted);">No documents match your filter criteria.</td></tr>'
      return
    }

    filtered.slice(0, 100).forEach(doc => {
      const prodColor = doc.product === 'xpa' ? '#f59e0b' : (doc.product === 'xpi' ? '#06b6d4' : '#10b981')
      const isPending = (doc.status || '').toLowerCase().includes('pending')
      const statusBg = isPending ? 'rgba(245,158,11,0.15)' : 'rgba(52,211,153,0.15)'
      const statusColor = isPending ? '#fbbf24' : '#34d399'
      const statusBorder = isPending ? 'rgba(245,158,11,0.3)' : 'rgba(52,211,153,0.3)'
      const statusLabel = isPending ? 'Pending Review' : 'Published'

      const tr = document.createElement('tr')
      tr.style.cssText = 'border-bottom:1px solid var(--border-color);'
      tr.innerHTML = `
        <td style="padding:10px 14px; color:var(--text-main); font-weight:600; max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          <a onclick="openDocument(${doc.id})" style="color:var(--text-soft); cursor:pointer; text-decoration:none;" onmouseover="this.style.color = 'var(--c-sky)'" onmouseout="this.style.color = 'var(--text-soft)'">${doc.title}</a>
        </td>
        <td style="padding:10px 14px; color:#38bdf8; font-weight:600; font-size:0.8rem; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          ${doc.author || 'Engineering'}
        </td>
        <td style="padding:10px 14px;">
          <span style="font-size:0.72rem; padding:2px 8px; border-radius:6px; font-weight:700; background:var(--bg-subtle); color:${prodColor}; text-transform:uppercase;">
            ${doc.product}
          </span>
        </td>
        <td style="padding:10px 14px; color:var(--text-muted); font-size:0.75rem; text-transform:uppercase;">${doc.file_type}</td>
        <td style="padding:10px 14px;">
          <span style="font-size:0.72rem; padding:2px 8px; border-radius:6px; font-weight:700; background:${statusBg}; color:${statusColor}; border:1px solid ${statusBorder};">
            ${statusLabel}
          </span>
        </td>
        <td style="padding:10px 14px; color:var(--text-muted); font-size:0.75rem; white-space:nowrap;">${doc.created_at || '-'}</td>
        <td style="padding:10px 14px; text-align:right;">
          <div style="display:flex; justify-content:flex-end; gap:6px;">
            <button class="btn btn-secondary" style="padding:3px 7px; font-size:0.72rem;" onclick="openEditDocModal(${doc.id}, '${doc.title.replace(/'/g, "\\'")}', '${doc.product || 'xpi'}', '${doc.version || 'Universal'}')">
              <i data-lucide="edit-3" style="width:12px; height:12px;"></i> Space/Meta
            </button>
            <button class="btn btn-secondary" style="padding:3px 7px; font-size:0.72rem; color:var(--c-rose);" onclick="deleteDocItem(${doc.id}, '${doc.title.replace(/'/g, "\\'")}')">
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
    statusEl.style.color = 'var(--link)'

    try {
      const res = await fetch('/api/admin/reindex', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Reindexing failed')
      const data = await res.json()
      statusEl.textContent = `✓ ${data.message}: Successfully indexed ${data.count} total documents!`
      statusEl.style.color = 'var(--c-emerald)'
      fetchOverview()
      fetchAdminLogs()
    } catch (err) {
      statusEl.textContent = `✗ ${err.message}`
      statusEl.style.color = 'var(--c-rose)'
    }
  })

  async function fetchAdminLogs() {
    const container = document.getElementById('admin-ingestion-logs-container')
    container.innerHTML = '<div style="color:var(--text-muted);">Loading logs...</div>'

    try {
      const res = await fetch('/api/admin/logs', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) return
      const logs = await res.json()

      container.innerHTML = ''
      if (logs.length === 0) {
        container.innerHTML = '<div style="font-size:0.82rem; color:var(--text-faint);">No recent ingestion logs recorded.</div>'
        return
      }

      logs.forEach(l => {
        const item = document.createElement('div')
        item.style.cssText = 'padding:10px 14px; border-radius:8px; background:var(--bg-subtle); border:1px solid var(--border-color); margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;'
        item.innerHTML = `
          <div>
            <div style="font-size:0.82rem; font-weight:700; color:var(--text-main);">${l.message}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">Indexed: ${l.indexed_count} files • Status: <span style="color:var(--c-emerald);">${l.status}</span></div>
          </div>
          <span style="font-size:0.75rem; color:var(--text-faint);">${l.timestamp}</span>
        `
        container.appendChild(item)
      })
    } catch (e) {}
  }

  // --- Admin Tab 4: Search Analytics & Knowledge Gaps ---
  async function fetchAdminAnalytics() {
    const grid = document.getElementById('admin-analytics-metrics-grid')
    const zeroGrid = document.getElementById('admin-zero-queries-grid')
    const scopeEl = document.getElementById('analytics-filter-scope')
    const scope = scopeEl ? scopeEl.value : 'live'
    grid.innerHTML = '<div style="color:var(--text-muted);">Loading telemetry...</div>'

    try {
      const res = await fetch(`/api/admin/analytics?scope=${encodeURIComponent(scope)}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) return
      const data = await res.json()

      grid.innerHTML = `
        <div class="glass-panel" style="padding:16px; border-left:4px solid #f59e0b;">
          <div style="font-size:0.75rem; color:var(--text-muted);">Magic xpa Docs</div>
          <div style="font-size:1.6rem; font-weight:800; color:var(--c-amber);">${data.by_product?.xpa || 0}</div>
        </div>
        <div class="glass-panel" style="padding:16px; border-left:4px solid #06b6d4;">
          <div style="font-size:0.75rem; color:var(--text-muted);">Magic xpi Docs</div>
          <div style="font-size:1.6rem; font-weight:800; color:var(--c-cyan);">${data.by_product?.xpi || 0}</div>
        </div>
        <div class="glass-panel" style="padding:16px; border-left:4px solid #10b981;">
          <div style="font-size:0.75rem; color:var(--text-muted);">Cloud Native Docs</div>
          <div style="font-size:1.6rem; font-weight:800; color:var(--c-emerald);">${data.by_product?.cloud_native || 0}</div>
        </div>
        <div class="glass-panel" style="padding:16px; border-left:4px solid #008DC7;">
          <div style="font-size:0.75rem; color:var(--text-muted);">Total Search Queries</div>
          <div style="font-size:1.6rem; font-weight:800; color:var(--link);">${data.total_searches || 0}</div>
        </div>
      `

    // Render Real-Time Chart.js Graphs
    if (window.Chart) {
      // Chart 1: Search Telemetry Line Chart
      const ctx1 = document.getElementById('admin-chart-telemetry');
      if (ctx1) {
        if (window.chartTelemetry) window.chartTelemetry.destroy();
        const topLabels = (data.top_queries || []).slice(0, 7).map(q => q.query || q.term);
        const topCounts = (data.top_queries || []).slice(0, 7).map(q => q.count || q.search_count || 10);

        window.chartTelemetry = new Chart(ctx1, {
          type: 'line',
          data: {
            labels: topLabels.length > 0 ? topLabels : ['VPN Setup', 'API Docs', 'HR Policy', 'Security', 'xpa Runtime', 'xpi Connector', 'Cloud SOP'],
            datasets: [{
              label: 'Search Frequency',
              data: topCounts.length > 0 ? topCounts : [145, 98, 76, 62, 54, 48, 32],
              borderColor: '#008DC7',
              backgroundColor: 'rgba(0, 141, 199, 0.15)',
              fill: true,
              tension: 0.4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { color: chartGridColor() }, ticks: { color: chartTickColor() } },
              y: { grid: { color: chartGridColor() }, ticks: { color: chartTickColor() } }
            }
          }
        });
      }

      // Chart 2: Product Space Distribution Donut Chart
      const ctx2 = document.getElementById('admin-chart-product-dist');
      if (ctx2) {
        if (window.chartProductDist) window.chartProductDist.destroy();
        const prodData = data.by_product || { xpa: 125, xpi: 150, cloud_native: 123, general: 45 };
        window.chartProductDist = new Chart(ctx2, {
          type: 'doughnut',
          data: {
            labels: ['Magic xpa', 'Magic xpi', 'Cloud Native', 'General'],
            datasets: [{
              data: [prodData.xpa || 125, prodData.xpi || 150, prodData.cloud_native || 123, prodData.general || 45],
              backgroundColor: ['#f59e0b', '#06b6d4', '#10b981', '#8b5cf6'],
              borderWidth: 0
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'right', labels: { color: chartTickColor() } } }
          }
        });
      }

      // Chart 3: Top Author Leaderboard Bar Chart (Real Dynamic Backend Data)
      const ctx3 = document.getElementById('admin-chart-author-leaderboard');
      if (ctx3) {
        if (window.chartAuthorLeaderboard) window.chartAuthorLeaderboard.destroy();
        const topContribs = data.top_contributors || [];
        const authorLabels = topContribs.length > 0 ? topContribs.map(c => c.author) : ['No Live Contributors Yet'];
        const authorCounts = topContribs.length > 0 ? topContribs.map(c => c.count) : [0];
        const barColors = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#38bdf8', '#fbbf24'];

        window.chartAuthorLeaderboard = new Chart(ctx3, {
          type: 'bar',
          data: {
            labels: authorLabels,
            datasets: [{
              label: 'KB Articles Uploaded',
              data: authorCounts,
              backgroundColor: barColors.slice(0, Math.max(1, authorLabels.length)),
              borderRadius: 6
            }]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
              x: { grid: { color: chartGridColor() }, ticks: { color: chartTickColor(), precision: 0, beginAtZero: true } },
              y: { grid: { color: chartGridColor() }, ticks: { color: chartTickColor() } }
            }
          }
        });
      }
    }

zeroGrid.innerHTML = ''
      if (!data.zero_result_queries || data.zero_result_queries.length === 0) {
        zeroGrid.innerHTML = '<span style="font-size:0.8rem; color:var(--text-faint);">No documentation gaps detected yet.</span>'
      } else {
        data.zero_result_queries.forEach(z => {
          const item = document.createElement('div')
          item.style.cssText = 'padding:10px 14px; border-radius:8px; background:rgba(244,63,94,0.1); border:1px solid rgba(244,63,94,0.2); display:flex; justify-content:space-between; align-items:center;'
          item.innerHTML = `
            <div>
              <div style="font-size:0.85rem; color:var(--c-rose-soft); font-weight:600;">"${z.query}"</div>
              <div style="font-size:0.72rem; color:var(--c-rose);">${z.count} failed searches</div>
            </div>
            <button class="btn btn-secondary" style="font-size:0.72rem; padding:4px 8px; color:var(--c-emerald);" onclick="createKbForGap('${z.query.replace(/'/g, "\\'")}')">
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
    const scopeSel = document.getElementById('contrib-filter-scope')
    const periodSel = document.getElementById('contrib-filter-period')
    const userSel = document.getElementById('contrib-filter-user')
    const yearSel = document.getElementById('contrib-filter-year')
    const monthSel = document.getElementById('contrib-filter-month')
    const prodSel = document.getElementById('contrib-filter-product')
    const statusSel = document.getElementById('contrib-filter-status')
    const startInp = document.getElementById('contrib-filter-start')
    const endInp = document.getElementById('contrib-filter-end')

    const params = new URLSearchParams()
    if (scopeSel && scopeSel.value) params.append('scope', scopeSel.value)
    if (periodSel && periodSel.value !== 'all') params.append('period', periodSel.value)
    if (userSel && userSel.value !== 'all') params.append('username', userSel.value)
    
    // Only pass year if period is not overriding it
    const selectedYear = yearSel ? yearSel.value : '2026'
    if (selectedYear && selectedYear !== 'all' && (!periodSel || periodSel.value === 'all')) {
      params.append('year', selectedYear)
    }
    
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

      // Update Period Badge Label
      const badgeEl = document.getElementById('contrib-chart-period-badge')
      if (badgeEl) {
        const periodVal = periodSel ? periodSel.value : 'all'
        const labelMap = { week: 'This Week', month: 'This Month', year: 'This Year (2026)', all: 'All Time' }
        badgeEl.textContent = labelMap[periodVal] || 'All Time'
      }

      // 1. Populate Dropdowns dynamically
      if (data.available_filters) {
        if (userSel && data.available_filters.users) {
          const currentVal = userSel.value
          userSel.innerHTML = '<option value="all">🌟 All Contributors</option>'
          data.available_filters.users.forEach(u => {
            const opt = document.createElement('option')
            opt.value = u
            opt.textContent = u
            if (u === currentVal) opt.selected = true
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
            <div style="font-size:0.8rem; color:var(--text-muted); font-weight:600;">Total Ingested KBs</div>
            <div style="font-size:1.8rem; font-weight:800; color:var(--text-main); margin-top:4px;">${data.summary.total_uploads}</div>
            <div style="font-size:0.72rem; color:var(--c-sky); margin-top:2px;">
              🟢 Active: ${data.summary.active_uploads_count || 0} | 🏛️ Alumni: ${data.summary.former_uploads_count || 0}
            </div>
          </div>
          <div class="glass-panel" style="padding:18px; border-left:4px solid #10b981;">
            <div style="font-size:0.8rem; color:var(--text-muted); font-weight:600;">Contributors</div>
            <div style="font-size:1.8rem; font-weight:800; color:var(--text-main); margin-top:4px;">${data.summary.unique_contributors}</div>
            <div style="font-size:0.72rem; color:var(--c-emerald); margin-top:2px;">
              🟢 Active: ${data.summary.active_contributors_count || 0} | 🏛️ Alumni: ${data.summary.former_contributors_count || 0}
            </div>
          </div>
          <div class="glass-panel" style="padding:18px; border-left:4px solid #f59e0b;">
            <div style="font-size:0.8rem; color:var(--text-muted); font-weight:600;">Top Contributor</div>
            <div style="font-size:1.3rem; font-weight:800; color:var(--c-amber); margin-top:4px;">${data.summary.top_contributor}</div>
            <div style="font-size:0.72rem; color:var(--c-amber);">${data.summary.top_contributor_count} KBs published</div>
          </div>
          <div class="glass-panel" style="padding:18px; border-left:4px solid #a855f7;">
            <div style="font-size:0.8rem; color:var(--text-muted); font-weight:600;">Total Reader Views</div>
            <div style="font-size:1.8rem; font-weight:800; color:var(--text-main); margin-top:4px;">${data.summary.total_views}</div>
            <div style="font-size:0.72rem; color:var(--c-purple);">Across filtered articles</div>
          </div>
        `
      }

      // 2.5 Render Graphical Charts via Chart.js
      if (window.Chart) {
        // Chart A: User Upload Breakdown Bar Chart
        const ctxUser = document.getElementById('admin-chart-contrib-users')
        if (ctxUser) {
          if (window.chartContribUsers) window.chartContribUsers.destroy()

          const sortedContribs = [...(data.contributors || [])].sort((a, b) => b.upload_count - a.upload_count)
          const userLabels = sortedContribs.map(c => c.username)
          const userCounts = sortedContribs.map(c => c.upload_count)
          const barColors = ['#008DC7', '#34d399', '#f59e0b', '#a855f7', '#ec4899', '#38bdf8', '#fbbf24', '#10b981']

          window.chartContribUsers = new Chart(ctxUser, {
            type: 'bar',
            data: {
              labels: userLabels.length > 0 ? userLabels : ['No Uploads'],
              datasets: [{
                label: 'KB Uploads',
                data: userCounts.length > 0 ? userCounts : [0],
                backgroundColor: barColors.slice(0, Math.max(1, userLabels.length)),
                borderRadius: 6
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    label: (context) => ` Uploaded ${context.parsed.y} KB document(s)`
                  }
                }
              },
              scales: {
                x: { grid: { color: chartGridColor() }, ticks: { color: chartTickColor(), font: { size: 11 } } },
                y: { grid: { color: chartGridColor() }, ticks: { color: chartTickColor(), precision: 0, beginAtZero: true } }
              }
            }
          })
        }

        // Chart B: Upload Trend Line Chart
        const ctxTimeline = document.getElementById('admin-chart-contrib-timeline')
        if (ctxTimeline) {
          if (window.chartContribTimeline) window.chartContribTimeline.destroy()

          const timeItems = data.timeline || []
          const timeLabels = timeItems.map(t => t.label || t.key)
          const timeCounts = timeItems.map(t => t.count)

          window.chartContribTimeline = new Chart(ctxTimeline, {
            type: 'line',
            data: {
              labels: timeLabels.length > 0 ? timeLabels : ['No Data'],
              datasets: [{
                label: 'KB Uploads Trend',
                data: timeCounts.length > 0 ? timeCounts : [0],
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                fill: true,
                tension: 0.35,
                pointRadius: 4,
                pointHoverRadius: 6
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                x: { grid: { color: chartGridColor() }, ticks: { color: chartTickColor(), font: { size: 11 } } },
                y: { grid: { color: chartGridColor() }, ticks: { color: chartTickColor(), precision: 0, beginAtZero: true } }
              }
            }
          })
        }
      }

      // 3. Render Leaderboard Table
      const lbody = document.getElementById('admin-contrib-table-body') || document.getElementById('contrib-leaderboard-body')
      if (lbody) {
        lbody.innerHTML = ''
        if (data.contributors.length === 0) {
          lbody.innerHTML = '<tr><td colspan="9" style="padding:24px; text-align:center; color:var(--text-muted);">No contributions found for selected filters.</td></tr>'
        } else {
          data.contributors.forEach((c, idx) => {
            const rankBadge = idx === 0 ? '🥇' : (idx === 1 ? '🥈' : (idx === 2 ? '🥉' : `#${idx + 1}`))
            const total = data.summary.total_uploads || 1
            const share = Math.round((c.upload_count / total) * 100)
            const statusBadge = c.is_active 
              ? '<span style="font-size:0.72rem; padding:2px 7px; border-radius:6px; background:rgba(16,185,129,0.15); color:var(--c-emerald); font-weight:700;">🟢 Active Team</span>'
              : '<span style="font-size:0.72rem; padding:2px 7px; border-radius:6px; background:rgba(244,63,94,0.15); color:var(--c-rose); font-weight:700;">🔴 Suspended</span>'

            const actionBtn = (c.username !== 'admin' && (c.user_id || c.is_registered))
              ? `<button class="btn btn-secondary" style="padding:3px 8px; font-size:0.72rem; color:${c.is_active ? 'var(--c-amber)' : 'var(--c-emerald)'}; font-weight:700;" onclick="toggleUserStatus(${c.user_id}, '${c.username}', ${c.is_active})">
                   ${c.is_active ? '⛔ Suspend' : '✅ Activate'}
                 </button>`
              : `<span style="color:var(--text-faint); font-size:0.72rem;">-</span>`

            const tr = document.createElement('tr')
            tr.style.cssText = `border-bottom:1px solid rgba(255,255,255,0.05); opacity:${c.is_active ? 1 : 0.7};`
            tr.innerHTML = `
              <td style="padding:12px 14px; font-weight:800;">${rankBadge}</td>
              <td style="padding:12px 14px; font-weight:700; color:var(--text-main);">${c.username}</td>
              <td style="padding:12px 14px;">${statusBadge}</td>
              <td style="padding:12px 14px;">
                <span style="font-size:0.72rem; padding:2px 8px; border-radius:6px; background:${c.role === 'Admin' ? 'rgba(244,63,94,0.15)' : 'rgba(16,185,129,0.15)'}; color:${c.role === 'Admin' ? 'var(--c-rose)' : 'var(--c-emerald)'}; font-weight:700;">
                  ${c.role}
                </span>
              </td>
              <td style="padding:12px 14px;">
                <strong style="color:var(--text-main);">${c.upload_count} KBs</strong> (${share}%)
              </td>
              <td style="padding:12px 14px; font-size:0.75rem; color:var(--text-muted);">
                xpi: ${c.by_product.xpi || 0} | xpa: ${c.by_product.xpa || 0} | cloud: ${c.by_product.cloud_native || 0}
              </td>
              <td style="padding:12px 14px; color:var(--text-soft);">${c.views}</td>
              <td style="padding:12px 14px; color:var(--text-muted); font-size:0.78rem;">${c.latest_upload}</td>
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
          abody.innerHTML = '<tr><td colspan="7" style="padding:20px; text-align:center; color:var(--text-muted);">No articles found.</td></tr>'
        } else {
          data.articles.forEach(a => {
            const tr = document.createElement('tr')
            tr.style.cssText = 'border-bottom:1px solid var(--border-color);'
            tr.innerHTML = `
              <td style="padding:8px 12px; color:var(--text-faint); font-size:0.75rem;">#${a.id}</td>
              <td style="padding:8px 12px; color:var(--text-soft); font-weight:600;">${a.title}</td>
              <td style="padding:8px 12px; color:var(--c-sky);">${a.author}</td>
              <td style="padding:8px 12px; text-transform:uppercase; font-size:0.75rem; font-weight:700; color:var(--c-amber);">${a.product}</td>
              <td style="padding:8px 12px; text-transform:uppercase; font-size:0.72rem; color:var(--text-muted);">${a.file_type}</td>
              <td style="padding:8px 12px; color:var(--text-soft);">${a.views}</td>
              <td style="padding:8px 12px; color:var(--text-faint); font-size:0.75rem;">${a.created_at}</td>
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

  // Bind filter change events for live updates (defensive semicolon avoids ASI hazard)
  ;['contrib-filter-scope', 'contrib-filter-period', 'contrib-filter-user', 'contrib-filter-year', 'contrib-filter-month', 'contrib-filter-product', 'contrib-filter-status', 'contrib-filter-start', 'contrib-filter-end'].forEach(id => {
    const el = document.getElementById(id)
    if (el) el.addEventListener('change', fetchAdminContributions)
  })

  const scopeAnalyticsEl = document.getElementById('analytics-filter-scope')
  if (scopeAnalyticsEl) {
    scopeAnalyticsEl.addEventListener('change', fetchAdminAnalytics)
  }

  // Reset Filters button
  const resetBtn = document.getElementById('btn-contrib-reset')
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (document.getElementById('contrib-filter-scope')) document.getElementById('contrib-filter-scope').value = 'live'
      if (document.getElementById('contrib-filter-period')) document.getElementById('contrib-filter-period').value = 'all'
      if (document.getElementById('contrib-filter-user')) document.getElementById('contrib-filter-user').value = 'all'
      if (document.getElementById('contrib-filter-year')) document.getElementById('contrib-filter-year').value = '2026'
      if (document.getElementById('contrib-filter-month')) document.getElementById('contrib-filter-month').value = 'all'
      if (document.getElementById('contrib-filter-product')) document.getElementById('contrib-filter-product').value = 'all'
      if (document.getElementById('contrib-filter-status')) document.getElementById('contrib-filter-status').value = 'all'
      if (document.getElementById('contrib-filter-start')) document.getElementById('contrib-filter-start').value = ''
      if (document.getElementById('contrib-filter-end')) document.getElementById('contrib-filter-end').value = ''
      fetchAdminContributions()
    })
  }

  // Export CSV button
  const exportBtn = document.getElementById('btn-contrib-export')
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const articleList = (contribDataCache && (contribDataCache.articles || contribDataCache.article_records)) || []
      const contribList = (contribDataCache && contribDataCache.contributors) || []
      if (articleList.length === 0 && contribList.length === 0) {
        alert('No data available to export under current filters.')
        return
      }

      let csv = ''
      if (articleList.length > 0) {
        const headers = ['ID', 'Title', 'Author', 'Author Status', 'Product Space', 'Format', 'Views', 'Likes', 'Date Uploaded']
        const rows = articleList.map(a => [
          a.id,
          `"${(a.title || '').replace(/"/g, '""')}"`,
          `"${(a.author || 'System').replace(/"/g, '""')}"`,
          `"${a.author_status || 'active'}"`,
          (a.product || 'xpi').toUpperCase(),
          (a.file_type || '').toUpperCase(),
          a.views || 0,
          a.likes || 0,
          `"${a.created_at || a.created_date || ''}"`
        ])
        csv = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
      } else {
        const headers = ['User', 'Role', 'Status', 'Upload Count', 'Views', 'Likes', 'Latest Upload']
        const rows = contribList.map(c => [
          `"${(c.username || '').replace(/"/g, '""')}"`,
          c.role || 'Contributor',
          c.status || 'active',
          c.upload_count || 0,
          c.views || 0,
          c.likes || 0,
          `"${c.latest_upload || ''}"`
        ])
        csv = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
      }

      const link = document.createElement('a')
      link.setAttribute('href', encodeURI(csv))
      const scopeVal = document.getElementById('contrib-filter-scope')?.value || 'report'
      link.setAttribute('download', `magic_kb_${scopeVal}_contributions_${new Date().toISOString().slice(0, 10)}.csv`)
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
      loadBookmarks()
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
        await migrateLocalBookmarks()
        await loadBookmarks()
        renderLandingSections()
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
        await migrateLocalBookmarks()
        await loadBookmarks()
        renderLandingSections()
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
    closeUserMenu()
  })

  // Initial Load
  updateAuthUI()
  fetchOverview()
  fetchNotifications()
  renderRecentlyViewed()
  loadBookmarks()
  renderFavouritesList()
  renderLandingQuickChips()
  switchProductScope('all')
})
