// Magic Software Enterprise - Knowledge Base Client

// App State Variables
let token = localStorage.getItem('token') || '';
let username = localStorage.getItem('username') || '';
let role = localStorage.getItem('role') || '';
let activeTab = 'search';
let activeSubTab = 'upload'; // upload vs write
let activeAdminSubTab = 'users'; // users vs files vs indexer

// Search State
let searchDebounceTimeout = null;

// Space and Tree State
let spaces = [];
let activeSpace = '';
let treeNodes = [];
let treeExpandedNodes = new Set(); // Set of node IDs that are expanded
let favorites = [];
let currentDocId = null;
let currentDocData = null;

// Drag & drop file queue
let selectedFilesList = [];

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  checkAuth();
  
  // Initial loading of metrics, spaces and favorites
  loadGlobalMetrics();
  loadSpaces();
  loadFavorites();
});

// Setup event listeners for elements
function setupEventListeners() {
  // Login Form & Auth
  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('logout-btn').addEventListener('click', handleLogout);
  
  document.getElementById('signin-btn').addEventListener('click', () => {
    document.getElementById('login-modal').classList.remove('hide');
    document.getElementById('login-username').focus();
  });

  document.getElementById('close-login-btn').addEventListener('click', () => {
    document.getElementById('login-modal').classList.add('hide');
  });

  // Tab Navigation Buttons
  document.getElementById('tab-search-btn').addEventListener('click', () => {
    switchTab('search');
    showTrendingAndDashboard();
  });
  document.getElementById('tab-upload-btn').addEventListener('click', () => switchTab('upload'));
  document.getElementById('tab-copilot-btn').addEventListener('click', () => switchTab('copilot'));
  document.getElementById('tab-admin-btn').addEventListener('click', () => switchTab('admin'));

  // Global Keypress '/' to focus search input
  window.addEventListener('keydown', (e) => {
    const searchInput = document.getElementById('search-input');
    if (e.key === '/' && document.activeElement !== searchInput && activeTab === 'search') {
      e.preventDefault();
      searchInput.focus();
    }
  });

  // Search Input Handlers
  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounceTimeout);
    searchDebounceTimeout = setTimeout(performSearch, 250);
  });
  
  document.getElementById('filter-type').addEventListener('change', performSearch);
  document.getElementById('filter-category').addEventListener('input', () => {
    clearTimeout(searchDebounceTimeout);
    searchDebounceTimeout = setTimeout(performSearch, 250);
  });
  document.getElementById('filter-author').addEventListener('input', () => {
    clearTimeout(searchDebounceTimeout);
    searchDebounceTimeout = setTimeout(performSearch, 250);
  });
  document.getElementById('match-all-checkbox').addEventListener('change', performSearch);

  // Space switcher removed (single unified space tree is active)

  // Left Tree Filter
  document.getElementById('left-tree-filter').addEventListener('input', (e) => {
    filterPageTree(e.target.value);
  });

  // Document view buttons (favorite, like, edit, pin)
  document.getElementById('doc-fav-btn').addEventListener('click', toggleFavoriteDocument);
  document.getElementById('doc-pin-btn').addEventListener('click', togglePinDocument);
  document.getElementById('doc-like-btn').addEventListener('click', handleLikeDocument);
  document.getElementById('doc-edit-btn').addEventListener('click', openEditorModal);

  // Comments submit form
  document.getElementById('comment-post-form').addEventListener('submit', handleCommentSubmit);

  // Editor Modal Save & Discard Buttons
  document.getElementById('close-editor-btn').addEventListener('click', closeEditorModal);
  document.getElementById('cancel-edit-btn').addEventListener('click', closeEditorModal);
  document.getElementById('save-edit-btn').addEventListener('click', handleSaveDocumentEdit);

  // Upload Portal Toggle Tabs
  document.getElementById('subtab-upload-btn').addEventListener('click', () => switchSubTab('upload'));
  document.getElementById('subtab-write-btn').addEventListener('click', () => switchSubTab('write'));

  // Batch Upload Drag & Drop handlers
  const dropZone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.add('drag-active');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropZone.classList.remove('drag-active');
    }, false);
  });

  dropZone.addEventListener('drop', handleFileDrop, false);
  dropZone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleFileSelectChange);
  
  document.getElementById('clear-queue-btn').addEventListener('click', clearUploadQueue);
  document.getElementById('start-upload-btn').addEventListener('click', handleFileUploadSubmit);

  // Write Article Compose Form
  document.getElementById('write-article-form').addEventListener('submit', handleWriteArticleSubmit);

  // Admin Nav Buttons
  document.getElementById('admin-subtab-users-btn').addEventListener('click', () => switchAdminSubTab('users'));
  document.getElementById('admin-subtab-files-btn').addEventListener('click', () => switchAdminSubTab('files'));
  document.getElementById('admin-subtab-indexer-btn').addEventListener('click', () => switchAdminSubTab('indexer'));

  // Admin CRUD Triggers
  document.getElementById('create-user-form').addEventListener('submit', handleCreateUserSubmit);
  document.getElementById('trigger-reindex-btn').addEventListener('click', handleTriggerReindex);

  // Integrated SOP Action Buttons (Checklist Runner and Export)
  document.getElementById('doc-run-btn').addEventListener('click', openSopRunner);
  document.getElementById('doc-export-btn').addEventListener('click', exportDocument);
  document.getElementById('close-sop-runner-btn').addEventListener('click', closeSopRunner);

  // AI Copilot Ask Query Form Submission
  document.getElementById('copilot-ask-form').addEventListener('submit', handleCopilotAskSubmit);
}

// ================= AUTHENTICATION HANDLERS =================

async function checkAuth() {
  if (!token) {
    setGuestMode();
    return;
  }

  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.status === 401) {
      handleLogout();
      return;
    }

    const data = await res.json();
    if (data && data.username) {
      username = data.username;
      role = data.role;
      localStorage.setItem('username', username);
      localStorage.setItem('role', role);
      
      updateAppLayout();
    }
  } catch (err) {
    // offline backup
    updateAppLayout();
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const userIn = document.getElementById('login-username').value;
  const passIn = document.getElementById('login-password').value;
  const errorBox = document.getElementById('login-error-box');

  errorBox.classList.add('hide');

  const formData = new FormData();
  formData.append('username', userIn);
  formData.append('password', passIn);

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Access denied');
    }

    const data = await res.json();
    token = data.access_token;
    username = data.username;
    role = data.role;

    localStorage.setItem('token', token);
    localStorage.setItem('username', username);
    localStorage.setItem('role', role);

    document.getElementById('login-modal').classList.add('hide');
    document.getElementById('login-form').reset();
    
    updateAppLayout();
    loadFavorites(); // Reload favorites associated with account
    
    // Refresh doc buttons if viewing one
    if (currentDocId) {
      loadDocumentReader(currentDocId);
    }
  } catch (err) {
    errorBox.classList.remove('hide');
    document.getElementById('login-error-text').textContent = err.message;
  }
}

function handleLogout() {
  token = '';
  username = '';
  role = '';
  localStorage.clear();
  setGuestMode();
  loadFavorites(); // Clear favorites
  
  if (currentDocId) {
    loadDocumentReader(currentDocId);
  }
}

function setGuestMode() {
  document.getElementById('logout-btn').classList.add('hide');
  document.getElementById('signin-btn').classList.remove('hide');
  document.getElementById('tab-upload-btn').classList.add('hide');
  document.getElementById('tab-admin-btn').classList.add('hide');
  document.getElementById('doc-edit-btn').classList.add('hide');
  updateAppLayout();
}

function updateAppLayout() {
  if (!token) return;
  
  document.getElementById('signin-btn').classList.add('hide');
  document.getElementById('logout-btn').classList.remove('hide');
  
  // Show tabs based on permissions
  document.getElementById('tab-upload-btn').classList.remove('hide');
  if (role === 'Admin') {
    document.getElementById('tab-admin-btn').classList.remove('hide');
  } else {
    document.getElementById('tab-admin-btn').classList.add('hide');
  }

  // Show inline edit & pin buttons if Editor/Admin and document is loaded
  const editBtn = document.getElementById('doc-edit-btn');
  const pinBtn = document.getElementById('doc-pin-btn');
  const isEditorOrAdmin = (role === 'Admin' || role === 'Editor');
  if (editBtn) {
    if (currentDocId && isEditorOrAdmin) editBtn.classList.remove('hide');
    else editBtn.classList.add('hide');
  }
  if (pinBtn) {
    if (currentDocId && isEditorOrAdmin) pinBtn.classList.remove('hide');
    else pinBtn.classList.add('hide');
  }
  
  lucide.createIcons();
}

// ================= PORTAL SWITCHER & STATS =================

function switchTab(tab) {
  activeTab = tab;
  
  // Update header buttons
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  const activeTabBtn = document.getElementById(`tab-${tab}-btn`);
  if (activeTabBtn) {
    activeTabBtn.classList.add('active');
  }
  
  // Update panes
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.remove('active-pane');
    pane.classList.add('hide');
  });
  const activePane = document.getElementById(`pane-${tab}`);
  if (activePane) {
    activePane.classList.add('active-pane');
    activePane.classList.remove('hide');
  }

  // Table of Contents visibility logic
  const workspace = document.getElementById('workspace-layout');
  const tocPane = document.getElementById('right-toc-pane');
  
  if (tab === 'document') {
    workspace.classList.remove('no-toc');
    tocPane.style.display = 'block';
  } else {
    workspace.classList.add('no-toc');
    tocPane.style.display = 'none';
  }

  if (tab === 'search') {
    document.getElementById('dashboard-metrics-hub').classList.remove('hide');
    document.getElementById('trending-section').classList.remove('hide');
  } else {
    document.getElementById('dashboard-metrics-hub').classList.add('hide');
    document.getElementById('trending-section').classList.add('hide');
  }

  // Load contextual tables
  if (tab === 'admin') {
    loadUsersTable();
    loadFilesTable();
    loadIndexerLogs();
  }
  
  lucide.createIcons();
}

async function loadGlobalMetrics() {
  try {
    const res = await fetch('/api/stats');
    if (res.ok) {
      const stats = await res.json();
      document.getElementById('stat-total-pages').textContent = stats.total_documents || 0;
      document.getElementById('stat-total-views').textContent = stats.total_views || 0;
      document.getElementById('stat-total-likes').textContent = stats.total_likes || 0;
      document.getElementById('stat-total-comments').textContent = stats.total_comments || 0;
      
      // Render trending list here directly
      renderTrendingList(stats.trending);
    }
  } catch (err) {
    console.error('Error loading global stats:', err);
  }
}

function renderTrendingList(trendingDocs) {
  const container = document.getElementById('trending-list');
  if (!trendingDocs || trendingDocs.length === 0) {
    container.innerHTML = '<div class="text-muted" style="padding: 10px 0;">No articles indexed yet. Check Admin panel.</div>';
    return;
  }
  
  container.innerHTML = trendingDocs.map(doc => `
    <div class="glass-panel result-card" onclick="loadDocumentReader(${doc.id})">
      <div class="card-header">
        <span class="card-title">${escapeHTML(doc.title)}</span>
        <span class="badge badge-html" style="background: rgba(6, 182, 212, 0.15); color: #22d3ee;">
          ${escapeHTML(doc.file_type.toUpperCase())}
        </span>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.75rem; color:var(--text-muted); margin-top:8px;">
        <span>👁 ${doc.views || 0} views • 👍 ${doc.likes || 0} likes</span>
      </div>
    </div>
  `).join('');
}

function showTrendingAndDashboard() {
  // Clear search input and show welcome list
  document.getElementById('search-input').value = '';
  document.getElementById('search-stats').classList.add('hide');
  document.getElementById('results-list').innerHTML = '';
  document.getElementById('empty-state').classList.add('hide');
  
  document.getElementById('search-welcome').classList.remove('hide');
  document.getElementById('trending-section').classList.remove('hide');
  document.getElementById('dashboard-metrics-hub').classList.remove('hide');
  
  loadGlobalMetrics();
}

// ================= SEARCH PORTAL HANDLERS =================

async function performSearch() {
  const query = document.getElementById('search-input').value.trim();
  const format = document.getElementById('filter-type').value;
  const category = document.getElementById('filter-category').value.trim();
  const author = document.getElementById('filter-author').value.trim();
  const matchAll = document.getElementById('match-all-checkbox').checked;

  const welcomeSec = document.getElementById('search-welcome');
  const trendingSec = document.getElementById('trending-section');
  const metricsSec = document.getElementById('dashboard-metrics-hub');
  
  const statsBox = document.getElementById('search-stats');
  const loadingBox = document.getElementById('search-loading');
  const errorBox = document.getElementById('search-error');
  const resultsContainer = document.getElementById('results-list');
  const emptyState = document.getElementById('empty-state');

  // If search query is empty, revert to default dashboard
  if (!query) {
    showTrendingAndDashboard();
    return;
  }

  // Hide welcome boards
  welcomeSec.classList.add('hide');
  trendingSec.classList.add('hide');
  metricsSec.classList.add('hide');

  // Show loading
  loadingBox.classList.remove('hide');
  errorBox.classList.add('hide');
  statsBox.classList.add('hide');
  resultsContainer.innerHTML = '';
  emptyState.classList.add('hide');

  try {
    let url = `/api/search?q=${encodeURIComponent(query)}&match_all=${matchAll}`;
    if (format) url += `&type=${encodeURIComponent(format)}`;
    if (category) url += `&category=${encodeURIComponent(category)}`;
    if (author) url += `&author=${encodeURIComponent(author)}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error('Search failed');
    
    const data = await res.json();
    loadingBox.classList.add('hide');
    
    statsBox.classList.remove('hide');
    document.getElementById('search-stats-text').textContent = `Found ${data.length} accurate result(s)`;

    if (data.length === 0) {
      emptyState.classList.remove('hide');
      return;
    }

    resultsContainer.innerHTML = data.map(doc => {
      // Setup badge color styling
      let bg = 'rgba(255,255,255,0.08)';
      let text = '#9ca3af';
      const ft = doc.file_type.toLowerCase();
      if (ft === 'html') { bg = 'rgba(99, 102, 241, 0.15)'; text = '#818cf8'; }
      else if (ft === 'pdf') { bg = 'rgba(244, 63, 94, 0.15)'; text = '#f43f5e'; }
      else if (ft === 'docx') { bg = 'rgba(16, 185, 129, 0.15)'; text = '#34d399'; }
      else if (ft === 'md') { bg = 'rgba(6, 182, 212, 0.15)'; text = '#22d3ee'; }
      else if (ft === 'txt') { bg = 'rgba(245, 158, 11, 0.15)'; text = '#fbbf24'; }

      // Setup tag list elements
      let tagHtml = '';
      if (doc.tags) {
        tagHtml = `
          <div style="display: flex; gap: 6px; flex-wrap: wrap; margin: 6px 0;">
            ${doc.tags.split(',').map(t => `
              <span class="tag-badge" style="font-size: 0.68rem; padding: 2px 8px; cursor: default;">
                #${escapeHTML(t.trim())}
              </span>
            `).join('')}
          </div>
        `;
      }

      return `
        <div class="glass-panel result-card" onclick="loadDocumentReader(${doc.id})">
          <div class="card-header">
            <span class="card-title">${escapeHTML(doc.title)}</span>
            <span class="badge" style="background: ${bg}; color: ${text}; border: 1px solid ${text}20">
              ${escapeHTML(doc.file_type.toUpperCase())}
            </span>
          </div>
          
          <p class="snippet-text">${doc.snippet}</p>
          
          ${tagHtml}
          
          <div class="card-metadata-row" style="display:flex; align-items:center; gap:16px; font-size:0.75rem; color:var(--text-muted); border-top:1px solid rgba(255,255,255,0.03); padding-top:8px; margin-top:4px;">
            <span>By ${escapeHTML(doc.author)}</span>
            <span style="margin-left: auto;">👁 ${doc.views || 0} views</span>
            <span>👍 ${doc.likes || 0} likes</span>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    loadingBox.classList.add('hide');
    errorBox.classList.remove('hide');
  }
}

// ================= LEFT SIDEBAR SPACE EXPLORER PAGE TREE =================

async function loadSpaces() {
  activeSpace = 'all';
  loadSpaceTree('all');
  // Load all new explorer sections in parallel
  loadPinnedPages();
  loadTagCloud();
  loadRecentlyViewed();
}

async function loadSpaceTree(spaceName) {
  const container = document.getElementById('left-tree-container');
  container.innerHTML = '<div class="text-muted" style="font-size:0.8rem;">Loading space tree...</div>';
  
  try {
    const res = await fetch(`/api/space/${encodeURIComponent(spaceName)}/tree`);
    if (res.ok) {
      treeNodes = await res.json();
      renderSpaceTree();
    } else {
      container.innerHTML = '<div class="text-muted" style="font-size:0.8rem;">No folders inside space.</div>';
    }
  } catch (err) {
    container.innerHTML = '<div class="error-box" style="font-size:0.8rem;">Failed to fetch tree.</div>';
  }
}

// ---- Pinned Pages ----
async function loadPinnedPages() {
  const container = document.getElementById('left-pinned-list');
  if (!container) return;
  try {
    const res = await fetch('/api/pinned');
    if (!res.ok) throw new Error();
    const docs = await res.json();
    if (!docs || docs.length === 0) {
      container.innerHTML = '<span class="explorer-empty">No pinned articles yet.</span>';
      return;
    }
    const canManagePin = token && (role === 'Admin' || role === 'Editor');
    container.innerHTML = docs.map(doc => `
      <div class="explorer-item pinned" title="${escapeHTML(doc.title)}">
        <i data-lucide="pin" class="explorer-item-icon" style="color:#f59e0b;"></i>
        <span class="explorer-item-label" onclick="loadDocumentReader(${doc.id})">${escapeHTML(doc.title)}</span>
        ${canManagePin ? `
          <button class="explorer-item-remove" onclick="unpinItem(${doc.id}, event)" title="Unpin page">
            <i data-lucide="x" style="width:10px; height:10px;"></i>
          </button>
        ` : ''}
      </div>
    `).join('');
    lucide.createIcons();
  } catch (err) {
    if (container) container.innerHTML = '<span class="explorer-empty">Could not load pinned.</span>';
  }
}

function updatePinButtonState(isPinned) {
  const btn = document.getElementById('doc-pin-btn');
  if (btn) {
    if (isPinned) {
      btn.style.background = 'rgba(245, 158, 11, 0.18)';
      btn.style.borderColor = '#f59e0b';
      btn.style.color = '#f59e0b';
      btn.title = "Unpin page from sidebar";
    } else {
      btn.style.background = '';
      btn.style.borderColor = '';
      btn.style.color = '';
      btn.title = "Pin page to sidebar (Admin/Editor)";
    }
  }
}

async function togglePinDocument() {
  if (!token || (role !== 'Admin' && role !== 'Editor')) {
    alert('Only Admins and Editors can pin or unpin pages.');
    return;
  }

  if (!currentDocId) return;

  try {
    const res = await fetch(`/api/document/${currentDocId}/pin`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to toggle pin state');
    }

    const data = await res.json();
    if (currentDocData) currentDocData.is_pinned = data.is_pinned;
    updatePinButtonState(data.is_pinned);
    loadPinnedPages();
  } catch (err) {
    alert(err.message);
  }
}

async function unpinItem(docId, event) {
  event.stopPropagation();
  if (!token || (role !== 'Admin' && role !== 'Editor')) return;
  try {
    const res = await fetch(`/api/document/${docId}/pin`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      if (currentDocId === docId && currentDocData) {
        currentDocData.is_pinned = false;
        updatePinButtonState(false);
      }
      loadPinnedPages();
    }
  } catch (err) {
    console.error('Error unpinning:', err);
  }
}

// ---- Recently Viewed (localStorage-based) ----
function trackRecentlyViewed(docId, docTitle) {
  try {
    let recent = JSON.parse(localStorage.getItem('recentDocs') || '[]');
    // Remove existing entry if present (dedup)
    recent = recent.filter(item => item.id !== docId);
    // Prepend new entry
    recent.unshift({ id: docId, title: docTitle });
    // Keep max 5
    recent = recent.slice(0, 5);
    localStorage.setItem('recentDocs', JSON.stringify(recent));
    loadRecentlyViewed();
  } catch (e) {}
}

async function loadRecentlyViewed() {
  const container = document.getElementById('left-recent-list');
  if (!container) return;
  try {
    const recent = JSON.parse(localStorage.getItem('recentDocs') || '[]');
    if (!recent || recent.length === 0) {
      container.innerHTML = '<span class="explorer-empty">Open any article to track it here.</span>';
      return;
    }
    // Use cached titles from localStorage for instant render
    container.innerHTML = recent.map(item => `
      <div class="explorer-item recent" onclick="loadDocumentReader(${item.id})" title="${escapeHTML(item.title)}">
        <i data-lucide="clock" class="explorer-item-icon" style="color:#22d3ee;"></i>
        <span class="explorer-item-label">${escapeHTML(item.title)}</span>
      </div>
    `).join('');
    lucide.createIcons();
  } catch (e) {
    if (container) container.innerHTML = '<span class="explorer-empty">Could not load history.</span>';
  }
}

// ---- Tag Cloud ----
async function loadTagCloud() {
  const container = document.getElementById('left-tags-cloud');
  if (!container) return;
  try {
    const res = await fetch('/api/tags');
    if (!res.ok) throw new Error();
    const tags = await res.json();
    if (!tags || tags.length === 0) {
      container.innerHTML = '<span class="explorer-empty">No tags in knowledge base yet.</span>';
      return;
    }
    container.innerHTML = tags.map(t => `
      <span class="explorer-tag-pill" onclick="triggerTagSearch('${escapeHTML(t.tag)}')" title="${t.count} article(s)">
        #${escapeHTML(t.tag)}
      </span>
    `).join('');
  } catch (err) {
    if (container) container.innerHTML = '<span class="explorer-empty">Could not load tags.</span>';
  }
}


// Filters tree nodes by title query matching
function filterPageTree(queryText) {
  const lower = queryText.toLowerCase().trim();
  const rows = document.querySelectorAll('#left-tree-container .tree-row');
  
  rows.forEach(row => {
    const title = row.getAttribute('data-title').toLowerCase();
    const isNode = row.closest('.tree-node');
    
    if (!lower || title.includes(lower)) {
      row.style.display = 'flex';
      // Automatically expand parents if filtering
      if (lower && isNode) {
        const children = isNode.querySelector('.tree-children');
        if (children) {
          children.style.display = 'flex';
          const chevron = isNode.querySelector('.tree-chevron');
          if (chevron) chevron.classList.add('open');
        }
      }
    } else {
      row.style.display = 'none';
    }
  });
}

function renderSpaceTree() {
  const container = document.getElementById('left-tree-container');
  if (treeNodes.length === 0) {
    container.innerHTML = '<div class="text-muted" style="font-size:0.8rem;">This space is empty.</div>';
    return;
  }

  container.innerHTML = '';
  treeNodes.forEach(node => {
    container.appendChild(createTreeNodeElement(node));
  });
  
  lucide.createIcons();
}

function createTreeNodeElement(node) {
  const nodeEl = document.createElement('div');
  nodeEl.className = 'tree-node';
  nodeEl.id = `tree-node-${node.id}`;

  const row = document.createElement('div');
  row.className = `tree-row ${currentDocId === node.id ? 'active' : ''}`;
  row.setAttribute('data-title', node.title);

  // Chevron for folder items
  const hasChildren = node.children && node.children.length > 0;
  let chevron = null;
  
  if (hasChildren) {
    chevron = document.createElement('i');
    chevron.className = 'tree-chevron';
    chevron.setAttribute('data-lucide', 'chevron-right');
    chevron.style.width = '14px';
    chevron.style.height = '14px';
    
    // Check if previously expanded
    if (treeExpandedNodes.has(node.id)) {
      chevron.classList.add('open');
    }
    
    row.appendChild(chevron);
  } else {
    // spacing spacer
    const spacer = document.createElement('span');
    spacer.style.width = '14px';
    spacer.style.display = 'inline-block';
    row.appendChild(spacer);
  }

  // Document Format Icon
  const icon = document.createElement('i');
  icon.className = 'tree-icon';
  const fileType = node.file_type ? node.file_type.toLowerCase() : 'folder';
  if (fileType === 'pdf') {
    icon.setAttribute('data-lucide', 'file-text');
    icon.style.color = '#f43f5e';
  } else if (fileType === 'docx') {
    icon.setAttribute('data-lucide', 'file-text');
    icon.style.color = '#34d399';
  } else if (hasChildren) {
    icon.setAttribute('data-lucide', 'folder');
    icon.style.color = '#6366f1';
  } else {
    icon.setAttribute('data-lucide', 'file');
    icon.style.color = '#22d3ee';
  }
  icon.style.width = '14px';
  icon.style.height = '14px';
  row.appendChild(icon);

  // Title text
  const titleSpan = document.createElement('span');
  titleSpan.className = 'tree-title';
  titleSpan.textContent = node.title;
  row.appendChild(titleSpan);

  // Row click triggers document reader or toggles folder expansion
  row.addEventListener('click', (e) => {
    if (fileType === 'folder' || hasChildren) {
      const childrenDiv = nodeEl.querySelector('.tree-children');
      if (childrenDiv) {
        const isVisible = childrenDiv.style.display !== 'none';
        childrenDiv.style.display = isVisible ? 'none' : 'flex';
        
        const chevronIcon = row.querySelector('.tree-chevron');
        if (chevronIcon) {
          chevronIcon.classList.toggle('open', !isVisible);
        }
        
        if (isVisible) {
          treeExpandedNodes.delete(node.id);
        } else {
          treeExpandedNodes.add(node.id);
        }
      }
    } else {
      document.querySelectorAll('.tree-row').forEach(r => r.classList.remove('active'));
      row.classList.add('active');
      loadDocumentReader(node.id);
    }
  });

  nodeEl.appendChild(row);

  // Recursively render children
  if (hasChildren) {
    const childrenDiv = document.createElement('div');
    childrenDiv.className = 'tree-children';
    
    // Set display matching the expanded set
    childrenDiv.style.display = treeExpandedNodes.has(node.id) ? 'flex' : 'none';
    
    node.children.forEach(child => {
      childrenDiv.appendChild(createTreeNodeElement(child));
    });
    nodeEl.appendChild(childrenDiv);
  }

  return nodeEl;
}

// ================= INTEGRATED DOCUMENT READER PANEL =================

async function loadDocumentReader(id) {
  currentDocId = id;
  switchTab('document');

  const loading = document.getElementById('document-reader-loading');
  const container = document.getElementById('document-reader-content');
  
  loading.classList.remove('hide');
  container.classList.add('hide');

  try {
    // 1. Fetch document metadata
    const res = await fetch(`/api/document/${id}`);
    if (!res.ok) throw new Error('Document details request failed');
    
    const doc = await res.json();
    currentDocData = doc;

    // Track this document in localStorage recently-viewed history
    trackRecentlyViewed(doc.id, doc.title);

    // views count is automatically incremented in DB by GET /api/document/{id} in main.py,
    // so we can display it directly.
    const v = document.getElementById('doc-view-views');
    if (v) v.textContent = doc.views || 0;

    // 3. Render Title & Breadcrumbs
    document.getElementById('doc-view-title').textContent = doc.title;
    document.getElementById('doc-view-author').textContent = doc.author;
    document.getElementById('doc-view-date').textContent = doc.created_at;
    document.getElementById('doc-view-format').textContent = doc.file_type.toUpperCase();
    document.getElementById('doc-view-likes').textContent = doc.likes || 0;

    const bcRow = document.getElementById('doc-view-breadcrumbs');
    if (doc.breadcrumbs && doc.breadcrumbs.length > 0) {
      bcRow.innerHTML = doc.breadcrumbs.map((bc, index) => `
        <span style="color: ${index === doc.breadcrumbs.length - 1 ? 'var(--text-main)' : 'var(--text-muted)'}">${escapeHTML(bc)}</span>
        ${index < doc.breadcrumbs.length - 1 ? '<i data-lucide="chevron-right" style="width:10px; height:10px;"></i>' : ''}
      `).join('');
    } else {
      bcRow.innerHTML = `<span style="color:var(--text-muted);">Spaces</span> <i data-lucide="chevron-right" style="width:10px; height:10px;"></i> <span style="color:var(--text-main);">${escapeHTML(doc.category)}</span>`;
    }

    // 4. Star Bookmark & Pin highlight toggle check
    updateFavoriteButtonState(doc.id);
    updatePinButtonState(doc.is_pinned);

    // 5. Check Edit & Pin permission availability (Admin/Editor only)
    const editBtn = document.getElementById('doc-edit-btn');
    const pinBtn = document.getElementById('doc-pin-btn');
    const canManagePinEdit = token && (role === 'Admin' || role === 'Editor');
    
    if (canManagePinEdit) {
      if (editBtn) editBtn.classList.remove('hide');
      if (pinBtn) pinBtn.classList.remove('hide');
    } else {
      if (editBtn) editBtn.classList.add('hide');
      if (pinBtn) pinBtn.classList.add('hide');
    }

    // 6. Tags rendering
    const tagsWrapper = document.getElementById('doc-view-tags-wrapper');
    const tagsContainer = document.getElementById('doc-view-tags');
    if (doc.tags) {
      tagsWrapper.classList.remove('hide');
      tagsContainer.innerHTML = doc.tags.split(',').map(tag => `
        <span class="tag-badge" onclick="triggerTagSearch('${escapeHTML(tag.trim())}')">#${escapeHTML(tag.trim())}</span>
      `).join('');
    } else {
      tagsWrapper.classList.add('hide');
      tagsContainer.innerHTML = '';
    }

    // 7. Inject Main body content (Confluence styled macro cards parsed)
    // 7. Inject Main body content (Confluence styled macro cards parsed)
    const bodyContainer = document.getElementById('doc-view-body');
    
    // Inject HTML content, PDF dual tabs, or plain-text formatted tag
    if (doc.file_type === 'html' && doc.html_content) {
      bodyContainer.innerHTML = doc.html_content;
    } else if (doc.file_type === 'pdf') {
      bodyContainer.innerHTML = `
        <div class="doc-view-tabs-row" style="margin-bottom: 20px; display: flex; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 12px;">
          <button id="pdf-tab-article" class="btn btn-primary pdf-tab active" onclick="switchDocViewMode('article')" style="font-size:0.8rem; padding: 6px 12px; border-radius: 6px;">
            <i data-lucide="file-text" style="width:12px; height:12px; display:inline-block; vertical-align:middle; margin-top:-2px; margin-right:4px;"></i> Article Reader View
          </button>
          <button id="pdf-tab-file" class="btn btn-secondary pdf-tab" onclick="switchDocViewMode('file')" style="font-size:0.8rem; padding: 6px 12px; border-radius: 6px;">
            <i data-lucide="file" style="width:12px; height:12px; display:inline-block; vertical-align:middle; margin-top:-2px; margin-right:4px;"></i> Original PDF Document
          </button>
        </div>
        <div id="doc-view-body-text" class="wiki-content-rendered" style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); padding: 28px 32px; border-radius: 12px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);">
          ${doc.html_content || `<pre style="white-space:pre-wrap; font-family:inherit; color:#e5e7eb; line-height:1.8; font-size:0.95rem;">${escapeHTML(doc.content)}</pre>`}
        </div>
        <div id="doc-view-body-file" class="hide" style="height: calc(100vh - 280px); border-radius: 12px; overflow: hidden; border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
          <iframe src="/api/document/raw/${doc.id}" style="width:100%; height:100%; border:none; background:#2f3542;"></iframe>
        </div>
      `;
      docViewMode = 'article';
    } else {
      bodyContainer.innerHTML = `
        <div class="wiki-content-rendered" style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); padding: 28px 32px; border-radius: 12px; box-shadow: inset 0 2px 4px rgba(0,0,0,0.2);">
          ${doc.html_content || `<pre style="white-space:pre-wrap; font-family:inherit; color:#e5e7eb; line-height:1.8; font-size:0.95rem;">${escapeHTML(doc.content)}</pre>`}
        </div>
      `;
    }

    // 8. Re-evaluate heading classes, unique IDs, and build Table of Contents
    rebuildTableOfContents(bodyContainer);

    // 9. Load discussion comments thread
    loadDocumentComments(doc.id);

    // Fade UI in
    loading.classList.add('hide');
    container.classList.remove('hide');
    
    // Smooth scroll page body container up
    window.scrollTo({ top: 0, behavior: 'smooth' });

  } catch (err) {
    loading.innerHTML = `<div class="error-box">Failed to load article details. ${err.message}</div>`;
  }
  
  lucide.createIcons();
}

function triggerTagSearch(tagName) {
  switchTab('search');
  document.getElementById('search-input').value = tagName;
  performSearch();
}

// Table of Contents dynamic builder
function rebuildTableOfContents(contentDiv) {
  const tocList = document.getElementById('doc-view-toc-list');
  tocList.innerHTML = '';

  const headings = contentDiv.querySelectorAll('h1, h2, h3');
  if (headings.length === 0) {
    tocList.innerHTML = '<span class="text-muted" style="font-size:0.8rem; font-style:italic;">No sections found.</span>';
    return;
  }

  headings.forEach((heading, idx) => {
    let slugId = heading.id;
    if (!slugId) {
      slugId = 'heading-' + idx + '-' + heading.textContent.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      heading.id = slugId;
    }

    const item = document.createElement('a');
    item.href = '#' + slugId;
    item.className = `toc-item ${heading.tagName.toLowerCase()}-level`;
    item.textContent = heading.textContent;
    
    item.addEventListener('click', (e) => {
      e.preventDefault();
      heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    tocList.appendChild(item);
  });
}

// ================= BOOKMARKS / FAVORITES SYSTEM =================

async function loadFavorites() {
  const container = document.getElementById('left-favorites-list');
  if (!token) {
    container.innerHTML = '<span class="explorer-empty">Sign in to view favorites.</span>';
    favorites = [];
    return;
  }

  try {
    const res = await fetch('/api/favorites', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      favorites = await res.json();
      if (favorites.length === 0) {
        container.innerHTML = '<span class="explorer-empty">No starred articles yet.</span>';
        return;
      }

      container.innerHTML = favorites.map(fav => `
        <div class="explorer-item" title="${escapeHTML(fav.title)}">
          <i data-lucide="star" class="explorer-item-icon" style="color:#fbbf24;"></i>
          <span class="explorer-item-label" onclick="loadDocumentReader(${fav.id})">${escapeHTML(fav.title)}</span>
          <button class="explorer-item-remove" onclick="removeFavoriteItem(${fav.id}, event)" title="Remove">
            <i data-lucide="x" style="width:10px; height:10px;"></i>
          </button>
        </div>
      `).join('');
    }
  } catch (err) {
    container.innerHTML = '<span class="explorer-empty">Failed to load.</span>';
  }
  
  lucide.createIcons();
}

function updateFavoriteButtonState(docId) {
  const isFav = favorites.some(fav => fav.id === docId);
  const btn = document.getElementById('doc-fav-btn');
  if (btn) {
    if (isFav) {
      btn.style.background = 'rgba(251, 191, 36, 0.15)';
      btn.style.borderColor = '#fbbf24';
      btn.style.color = '#fbbf24';
    } else {
      btn.style.background = '';
      btn.style.borderColor = '';
      btn.style.color = '';
    }
  }
}

async function toggleFavoriteDocument() {
  if (!token) {
    document.getElementById('login-modal').classList.remove('hide');
    return;
  }

  const docId = currentDocId;
  const isFav = favorites.some(fav => fav.id === docId);

  try {
    if (isFav) {
      // Remove
      const res = await fetch(`/api/favorite/${docId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        favorites = favorites.filter(fav => fav.id !== docId);
      }
    } else {
      // Add
      const res = await fetch(`/api/document/${docId}/favorite`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const item = await res.json();
        favorites.push(item);
      }
    }
    
    updateFavoriteButtonState(docId);
    loadFavorites();

  } catch (err) {
    console.error('Error toggling favorite:', err);
  }
}

async function removeFavoriteItem(docId, event) {
  event.stopPropagation();
  try {
    const res = await fetch(`/api/favorite/${docId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      favorites = favorites.filter(fav => fav.id !== docId);
      loadFavorites();
      if (currentDocId === docId) {
        updateFavoriteButtonState(docId);
      }
    }
  } catch (err) {
    console.error('Error removing favorite:', err);
  }
}

// ================= COLLABORATION COMMENTS THREADS =================

async function loadDocumentComments(docId) {
  const container = document.getElementById('doc-comments-feed');
  const counter = document.getElementById('doc-comments-count');

  container.innerHTML = '<div class="text-muted" style="font-size:0.85rem;">Loading discussion thread...</div>';
  counter.textContent = '0';

  try {
    const res = await fetch(`/api/document/${docId}/comments`);
    if (res.ok) {
      const list = await res.json();
      counter.textContent = list.length;

      if (list.length === 0) {
        container.innerHTML = '<div class="text-muted" style="font-size:0.85rem; padding: 12px 0;">No comments yet. Start the conversation!</div>';
        return;
      }

      container.innerHTML = list.map(c => {
        // Show delete button if role is Admin or user is creator
        const canDelete = role === 'Admin' || (username && username.toLowerCase() === c.author.toLowerCase());
        const delBtn = canDelete ? `
          <button class="comment-delete-btn" onclick="handleDeleteComment(${c.id}, event)">
            <i data-lucide="trash-2" style="width: 12px; height: 12px;"></i> Delete
          </button>
        ` : '';

        return `
          <div class="comment-bubble" id="comment-card-${c.id}">
            <div class="comment-bubble-header">
              <div class="comment-author-info">
                <span class="comment-author-avatar">${c.author.substring(0, 2).toUpperCase()}</span>
                <strong style="color:#fff;">${escapeHTML(c.author)}</strong>
                <span class="comment-meta-time">${c.created_at}</span>
              </div>
              ${delBtn}
            </div>
            <div class="comment-bubble-body">${escapeHTML(c.content)}</div>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    container.innerHTML = '<div class="error-box">Failed to load comments.</div>';
  }
  
  lucide.createIcons();
}

async function handleCommentSubmit(e) {
  e.preventDefault();
  if (!token) {
    document.getElementById('login-modal').classList.remove('hide');
    return;
  }

  const textarea = document.getElementById('comment-textarea');
  const commentText = textarea.value.trim();
  if (!commentText || !currentDocId) return;

  const formData = new FormData();
  formData.append('content', commentText);

  try {
    const res = await fetch(`/api/document/${currentDocId}/comments`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    if (res.ok) {
      textarea.value = '';
      loadDocumentComments(currentDocId);
    } else {
      alert('Failed to post comment. Ensure you are signed in.');
    }
  } catch (err) {
    console.error('Comment error:', err);
  }
}

async function handleDeleteComment(commentId, event) {
  event.stopPropagation();
  if (!confirm('Are you sure you want to delete this comment?')) return;

  try {
    const res = await fetch(`/api/comment/${commentId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.ok) {
      loadDocumentComments(currentDocId);
    } else {
      alert('Failed to delete comment.');
    }
  } catch (err) {
    console.error('Error deleting comment:', err);
  }
}

// ================= UPVOTE LIKES SYSTEM =================

async function handleLikeDocument() {
  if (!currentDocId) return;
  
  try {
    const res = await fetch(`/api/document/${currentDocId}/like`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      document.getElementById('doc-view-likes').textContent = data.likes || 0;
      loadTrendingDocs(); // Refresh trending count
    }
  } catch (err) {
    console.error('Upvote failed:', err);
  }
}

// ================= IN-PLACE SOP DOCUMENT EDITOR =================

function openEditorModal() {
  if (!currentDocData) return;
  
  document.getElementById('edit-doc-title').value = currentDocData.title;
  document.getElementById('edit-doc-tags').value = currentDocData.tags || '';
  
  document.getElementById('edit-doc-content').value = currentDocData.html_content || currentDocData.content;
  document.getElementById('edit-result-alert').classList.add('hide');

  document.getElementById('editor-modal').classList.remove('hide');
}

function closeEditorModal() {
  document.getElementById('editor-modal').classList.add('hide');
}

async function handleSaveDocumentEdit() {
  const newTitle = document.getElementById('edit-doc-title').value.trim();
  const newTags = document.getElementById('edit-doc-tags').value.trim();
  const newContent = document.getElementById('edit-doc-content').value.trim();
  const alertBox = document.getElementById('edit-result-alert');

  if (!newTitle || !newContent || !currentDocId) return;

  alertBox.classList.add('hide');
  document.getElementById('save-edit-btn').disabled = true;

  const formData = new FormData();
  formData.append('title', newTitle);
  formData.append('content', newContent);
  formData.append('tags', newTags);

  try {
    const res = await fetch(`/api/document/${currentDocId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Save failed');
    }

    closeEditorModal();
    // Reload document reader
    loadDocumentReader(currentDocId);
    
    // Reload tree hierarchy to update title if changed
    loadSpaceTree(activeSpace);

  } catch (err) {
    alertBox.classList.remove('hide');
    alertBox.className = 'alert-box alert-error';
    alertBox.textContent = err.message;
  } finally {
    document.getElementById('save-edit-btn').disabled = false;
  }
}

// ================= UPLOAD PORTAL ACTIONS =================

function switchSubTab(sub) {
  activeSubTab = sub;
  
  document.querySelectorAll('.subtab-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`subtab-${sub}-btn`).classList.add('active');
  
  const filesFrame = document.getElementById('upload-frame-files');
  const writeFrame = document.getElementById('upload-frame-write');
  
  if (sub === 'upload') {
    filesFrame.classList.add('active-subframe');
    filesFrame.classList.remove('hide');
    writeFrame.classList.remove('active-subframe');
    writeFrame.classList.add('hide');
  } else {
    filesFrame.classList.remove('active-subframe');
    filesFrame.classList.add('hide');
    writeFrame.classList.add('active-subframe');
    writeFrame.classList.remove('hide');
  }
  lucide.createIcons();
}

function handleFileDrop(e) {
  const dt = e.dataTransfer;
  const files = dt.files;
  addFilesToQueue(files);
}

function handleFileSelectChange(e) {
  const files = e.target.files;
  addFilesToQueue(files);
}

function addFilesToQueue(files) {
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    // Check duplicates
    if (!selectedFilesList.some(f => f.name === file.name && f.size === file.size)) {
      selectedFilesList.push(file);
    }
  }
  updateUploadQueueUI();
}

function removeFileFromQueue(idx) {
  selectedFilesList.splice(idx, 1);
  updateUploadQueueUI();
}

function clearUploadQueue() {
  selectedFilesList = [];
  updateUploadQueueUI();
}

function updateUploadQueueUI() {
  const listContainer = document.getElementById('queue-list');
  const countSpan = document.getElementById('queue-count');
  const uploadBtn = document.getElementById('start-upload-btn');
  const clearBtn = document.getElementById('clear-queue-btn');
  const overallAlert = document.getElementById('upload-overall-alert');

  overallAlert.classList.add('hide');
  countSpan.textContent = selectedFilesList.length;

  if (selectedFilesList.length === 0) {
    listContainer.innerHTML = '<div class="text-muted text-center py-10" style="font-size:0.9rem;">Queue is empty. Drop files above to load.</div>';
    uploadBtn.disabled = true;
    uploadBtn.classList.add('disabled');
    clearBtn.classList.add('hide');
    return;
  }

  uploadBtn.disabled = false;
  uploadBtn.classList.remove('disabled');
  clearBtn.classList.remove('hide');

  listContainer.innerHTML = selectedFilesList.map((file, index) => {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    return `
      <div style="display:flex; justify-content:space-between; align-items:center; padding: 10px 14px; background:rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; margin-bottom: 8px;">
        <div style="display:flex; align-items:center; gap:10px;">
          <i data-lucide="file" style="color:var(--primary); width:16px; height:16px;"></i>
          <div style="display:flex; flex-direction:column;">
            <span style="font-size:0.85rem; color:#fff; font-weight:500;">${escapeHTML(file.name)}</span>
            <span style="font-size:0.7rem; color:var(--text-muted);">${sizeMB} MB</span>
          </div>
        </div>
        <button type="button" class="btn btn-secondary circle" style="padding:6px; min-width:28px;" onclick="removeFileFromQueue(${index})">
          <i data-lucide="x" style="width:12px; height:12px;"></i>
        </button>
      </div>
    `;
  }).join('');
  
  lucide.createIcons();
}

async function handleFileUploadSubmit(e) {
  e.preventDefault();
  if (selectedFilesList.length === 0) return;

  const btn = document.getElementById('start-upload-btn');
  const alertBox = document.getElementById('upload-overall-alert');

  btn.disabled = true;
  btn.classList.add('disabled');
  btn.innerHTML = '<i data-lucide="refresh-cw" class="animate-spin"></i> Processing & Indexing Documents...';
  lucide.createIcons();

  alertBox.classList.add('hide');

  const formData = new FormData();
  selectedFilesList.forEach(file => {
    formData.append('files', file);
  });

  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Upload pipeline failure');
    }

    const report = await res.json();
    alertBox.classList.remove('hide');
    alertBox.className = 'alert-box alert-success';
    alertBox.innerHTML = `<strong>Success!</strong> ${report.indexed_count || report.uploaded.length} file(s) uploaded and instantly indexed into Knowledge Hub.`;
    
    // Reset button state
    btn.disabled = false;
    btn.classList.remove('disabled');
    btn.innerHTML = '<i data-lucide="send"></i> Upload and Index All Files';
    
    // Clear queue & instantly refresh sidebar tree, tags & metrics
    clearUploadQueue();
    loadSpaces(); 
    loadTagCloud();
    loadGlobalMetrics();
    lucide.createIcons();

  } catch (err) {
    alertBox.classList.remove('hide');
    alertBox.className = 'alert-box alert-error';
    alertBox.textContent = err.message;
    
    btn.disabled = false;
    btn.classList.remove('disabled');
    btn.innerHTML = '<i data-lucide="send"></i> Upload and Index All Files';
    lucide.createIcons();
  }
}

async function handleWriteArticleSubmit(e) {
  e.preventDefault();
  const title = document.getElementById('article-title').value.trim();
  const category = document.getElementById('article-category').value.trim();
  const content = document.getElementById('article-body').value.trim();
  const alertBox = document.getElementById('write-result-alert');

  alertBox.classList.add('hide');

  const formData = new FormData();
  formData.append('title', title);
  formData.append('category', category);
  formData.append('content', content);

  try {
    const res = await fetch('/api/create-article', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to publish article');
    }

    const data = await res.json();
    alertBox.classList.remove('hide');
    alertBox.className = 'alert-box alert-success';
    alertBox.innerHTML = `<strong>Published!</strong> "${escapeHTML(title)}" has been created and instantly indexed into Knowledge Hub.`;
    
    document.getElementById('write-article-form').reset();
    
    // Refresh sidebar tree, tags, and metrics instantly
    loadSpaces();
    loadTagCloud();
    loadGlobalMetrics();

    // If doc_id returned, open it immediately!
    if (data.doc_id) {
      setTimeout(() => {
        loadDocumentReader(data.doc_id);
      }, 500);
    }
  } catch (err) {
    alertBox.classList.remove('hide');
    alertBox.className = 'alert-box alert-error';
    alertBox.textContent = err.message;
  }
}

// ================= ADMIN CONTROLLER SHIFT HANDLERS =================

function switchAdminSubTab(sub) {
  activeAdminSubTab = sub;
  
  document.querySelectorAll('.admin-nav-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById(`admin-subtab-${sub}-btn`).classList.add('active');
  
  document.querySelectorAll('.admin-frame').forEach(f => {
    f.classList.remove('active-frame');
    f.classList.add('hide');
  });
  const targetFrame = document.getElementById(`admin-frame-${sub}`);
  if (targetFrame) {
    targetFrame.classList.add('active-frame');
    targetFrame.classList.remove('hide');
  }
  
  lucide.createIcons();
}

async function loadUsersTable() {
  const container = document.getElementById('users-list');
  const counter = document.getElementById('user-count');
  
  container.innerHTML = '<div class="text-muted" style="padding:10px 0;">Loading users list...</div>';

  try {
    const res = await fetch('/api/admin/users', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.ok) {
      const users = await res.json();
      counter.textContent = users.length;

      if (users.length === 0) {
        container.innerHTML = '<div class="text-muted">No user profiles found.</div>';
        return;
      }

      container.innerHTML = `
        <table class="admin-table">
          <thead>
            <tr>
              <th>USERNAME</th>
              <th>ROLE</th>
              <th class="text-right">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            ${users.map(u => `
              <tr>
                <td><strong style="color:#fff;">${escapeHTML(u.username)}</strong></td>
                <td><span class="badge" style="background:rgba(99,102,241,0.1); color:#818cf8;">${escapeHTML(u.role)}</span></td>
                <td class="text-right">
                  <button class="btn btn-secondary btn-small" onclick="deleteUserAccount(${u.id}, '${escapeHTML(u.username)}')" ${username === u.username ? 'disabled style="opacity:0.4;"' : ''}>
                    Delete
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }
  } catch (err) {
    container.innerHTML = '<div class="error-box">Failed to load users database.</div>';
  }
}

async function handleCreateUserSubmit(e) {
  e.preventDefault();
  const userIn = document.getElementById('new-username').value.trim();
  const passIn = document.getElementById('new-password').value.trim();
  const alertBox = document.getElementById('create-user-alert');

  alertBox.classList.add('hide');

  const roleIn = document.getElementById('new-user-role').value;

  const formData = new FormData();
  formData.append('username', userIn);
  formData.append('password', passIn);
  formData.append('role', roleIn);

  try {
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Failed to create user account');
    }

    alertBox.classList.remove('hide');
    alertBox.className = 'alert-box alert-success';
    alertBox.textContent = `User "${userIn}" created successfully!`;
    
    document.getElementById('create-user-form').reset();
    loadUsersTable();

  } catch (err) {
    alertBox.classList.remove('hide');
    alertBox.className = 'alert-box alert-error';
    alertBox.textContent = err.message;
  }
}

async function deleteUserAccount(userId, usernameVal) {
  if (!confirm(`Are you sure you want to delete user "${usernameVal}"?`)) return;

  try {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.ok) {
      loadUsersTable();
    } else {
      alert('Failed to delete user.');
    }
  } catch (err) {
    console.error('Delete user error:', err);
  }
}

async function loadFilesTable() {
  const container = document.getElementById('files-list-table');
  const counter = document.getElementById('file-count');

  container.innerHTML = '<div class="text-muted" style="padding:10px 0;">Loading documents registry...</div>';

  try {
    const res = await fetch('/api/admin/files', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.ok) {
      const files = await res.json();
      counter.textContent = files.length;

      if (files.length === 0) {
        container.innerHTML = '<div class="text-muted">No custom uploaded files registered in database.</div>';
        return;
      }

      container.innerHTML = `
        <table class="admin-table">
          <thead>
            <tr>
              <th>FILE NAME</th>
              <th>SIZE</th>
              <th>MODIFIED DATE</th>
              <th class="text-right">ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            ${files.map(f => {
              const sizeMB = (f.size / (1024 * 1024)).toFixed(2);
              return `
                <tr>
                  <td>
                    <div style="display:flex; flex-direction:column;">
                      <span style="color:#fff; font-weight:500;">${escapeHTML(f.name)}</span>
                    </div>
                  </td>
                  <td>${sizeMB} MB</td>
                  <td style="color:var(--text-muted); font-size:0.8rem;">${escapeHTML(f.modified)}</td>
                  <td class="text-right">
                    <button class="btn btn-secondary btn-small" onclick="deleteIndexedFile('${escapeHTML(f.name)}')">
                      Strip & Delete
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      `;
    }
  } catch (err) {
    container.innerHTML = '<div class="error-box">Failed to load files table.</div>';
  }
}

async function deleteIndexedFile(filename) {
  if (!confirm(`This deletes the file "${filename}" from system storage disk and indexes. Proceed?`)) return;

  try {
    const res = await fetch(`/api/admin/files/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.ok) {
      loadFilesTable();
      loadSpaces();
      loadGlobalMetrics();
      if (currentDocData && currentDocData.title === filename) {
        switchTab('search');
        showTrendingAndDashboard();
      }
    } else {
      alert('Failed to delete file.');
    }
  } catch (err) {
    console.error('Delete file error:', err);
  }
}

async function handleTriggerReindex() {
  const btn = document.getElementById('trigger-reindex-btn');
  const alertBox = document.getElementById('indexer-alert');

  btn.disabled = true;
  btn.innerHTML = '<i data-lucide="refresh-cw" class="animate-spin"></i> Crawling and Reindexing...';
  lucide.createIcons();

  alertBox.classList.add('hide');

  try {
    const res = await fetch('/api/admin/reindex', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.detail || 'Re-indexing failed');
    }

    const data = await res.json();
    alertBox.classList.remove('hide');
    alertBox.className = 'alert-box alert-success';
    alertBox.textContent = `Success! Relevance database rebuilt. Registered documents count: ${data.total_indexed}.`;
    
    loadIndexerLogs();
    loadSpaces();
    loadGlobalMetrics();

  } catch (err) {
    alertBox.classList.remove('hide');
    alertBox.className = 'alert-box alert-error';
    alertBox.textContent = err.message;
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-lucide="refresh-cw"></i> Run Indexer Now';
    lucide.createIcons();
  }
}

async function loadIndexerLogs() {
  const container = document.getElementById('indexer-logs-container');
  try {
    const res = await fetch('/api/admin/logs', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.ok) {
      const logs = await res.json();
      if (logs.length === 0) {
        container.innerHTML = '<div class="text-muted" style="padding: 10px 0;">No indexing logs yet.</div>';
        return;
      }

      container.innerHTML = logs.map(l => {
        let alertClass = 'alert-success';
        if (l.status.toLowerCase().includes('fail') || l.status.toLowerCase().includes('error')) {
          alertClass = 'alert-error';
        }
        return `
          <div class="log-item" style="border-left: 3px solid ${alertClass === 'alert-success' ? 'var(--accent-emerald)' : 'var(--accent-rose)'}; padding: 10px 14px; background:rgba(255,255,255,0.01); border-radius: 4px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
            <div>
              <span style="font-size:0.8rem; font-weight:600; color:#fff;">Run ID #${l.id}</span>
              <span style="font-size:0.75rem; color:var(--text-muted); margin-left:12px;">Triggered by: ${escapeHTML(l.triggered_by)}</span>
              <p style="font-size:0.78rem; margin-top:4px; color:#d1d5db;">Status: ${escapeHTML(l.status)}</p>
            </div>
            <span style="font-size:0.7rem; color:var(--text-muted);">${escapeHTML(l.run_date)}</span>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    container.innerHTML = '<div class="text-muted">Failed to load run logs.</div>';
  }
}

// ================= UTILITIES =================

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// Global View mode switcher for PDFs
window.switchDocViewMode = function(mode) {
  document.querySelectorAll('.pdf-tab').forEach(btn => {
    btn.classList.remove('btn-primary', 'active');
    btn.classList.add('btn-secondary');
  });
  
  const activeBtn = document.getElementById(`pdf-tab-${mode}`);
  if (activeBtn) {
    activeBtn.classList.remove('btn-secondary');
    activeBtn.classList.add('btn-primary', 'active');
  }
  
  const textBody = document.getElementById('doc-view-body-text');
  const iframeBody = document.getElementById('doc-view-body-file');
  
  if (mode === 'article') {
    if (textBody) textBody.classList.remove('hide');
    if (iframeBody) iframeBody.classList.add('hide');
  } else {
    if (textBody) textBody.classList.add('hide');
    if (iframeBody) iframeBody.classList.remove('hide');
  }
};

// ================= INTERACTIVE SOP RUNNER CHECKLIST =================

function openSopRunner() {
  const runnerModal = document.getElementById('sop-runner-modal');
  const stepsList = document.getElementById('sop-runner-steps-list');
  stepsList.innerHTML = '';
  
  // Find all headings inside active wiki document body
  const docBody = document.getElementById('doc-view-body');
  const headings = docBody.querySelectorAll('h1, h2, h3, h4');
  
  if (headings.length === 0) {
    stepsList.innerHTML = `
      <div style="text-align:center; padding:32px 0; color:var(--text-muted);">
        <i data-lucide="info" style="width:24px; height:24px; margin-bottom:8px; opacity:0.5;"></i>
        <p style="font-size:0.8rem; margin:0;">No setup steps found on this document page.</p>
      </div>
    `;
    lucide.createIcons();
    runnerModal.classList.remove('hide');
    updateSopRunnerProgress();
    return;
  }
  
  headings.forEach((heading, idx) => {
    const text = heading.textContent.trim();
    if (!text) return;
    
    const stepCard = document.createElement('div');
    stepCard.className = 'glass-panel';
    stepCard.style.padding = '12px 14px';
    stepCard.style.borderRadius = '8px';
    stepCard.style.border = '1px solid rgba(255,255,255,0.05)';
    stepCard.style.background = 'rgba(255,255,255,0.01)';
    stepCard.style.display = 'flex';
    stepCard.style.alignItems = 'flex-start';
    stepCard.style.gap = '10px';
    stepCard.style.cursor = 'pointer';
    stepCard.style.transition = 'all 0.2s';
    
    // Add checkbox
    stepCard.innerHTML = `
      <input type="checkbox" id="sop-step-chk-${idx}" class="sop-step-checkbox" style="width:16px; height:16px; margin-top:2px; cursor:pointer;" onclick="event.stopPropagation(); updateSopRunnerProgress();" />
      <div style="display:flex; flex-direction:column; gap:4px; cursor:pointer; flex:1;" onclick="document.getElementById('sop-step-chk-${idx}').click();">
        <span style="font-size:0.78rem; font-weight:600; color:#fff; line-height:1.4;">Step ${idx + 1}: ${escapeHTML(text)}</span>
      </div>
    `;
    stepsList.appendChild(stepCard);
  });
  
  runnerModal.classList.remove('hide');
  updateSopRunnerProgress();
}

function closeSopRunner() {
  document.getElementById('sop-runner-modal').classList.add('hide');
}

function updateSopRunnerProgress() {
  const checkboxes = document.querySelectorAll('.sop-step-checkbox');
  if (checkboxes.length === 0) {
    document.getElementById('sop-runner-progress-text').textContent = '0% Done';
    document.getElementById('sop-runner-progress-bar').style.width = '0%';
    return;
  }
  
  let checkedCount = 0;
  checkboxes.forEach(chk => {
    if (chk.checked) checkedCount++;
  });
  
  const percentage = Math.round((checkedCount / checkboxes.length) * 100);
  document.getElementById('sop-runner-progress-text').textContent = `${percentage}% Done`;
  document.getElementById('sop-runner-progress-bar').style.width = `${percentage}%`;
}

// ================= OFFLINE SOP EXPORTER =================

function exportDocument() {
  const docTitle = document.getElementById('doc-view-title').textContent.trim();
  const docBodyHtml = document.getElementById('doc-view-body').innerHTML;
  
  const printWindow = window.open('', '_blank');
  printWindow.document.open();
  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>SOP Export: ${escapeHTML(docTitle)}</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #333;
            line-height: 1.6;
            padding: 40px;
            max-width: 800px;
            margin: 0 auto;
          }
          h1, h2, h3, h4 {
            color: #111;
            font-family: inherit;
          }
          h1 { border-bottom: 2px solid #eaecef; padding-bottom: 10px; font-size: 2.2rem; }
          h2 { border-bottom: 1px solid #eaecef; padding-bottom: 8px; margin-top: 24px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { border: 1px solid #dfe2e5; padding: 10px 12px; text-align: left; }
          th { background: #f6f8fa; font-weight: 600; }
          pre { background: #f6f8fa; padding: 16px; border-radius: 6px; overflow-x: auto; font-family: monospace; font-size: 0.9rem; }
          code { font-family: monospace; font-size: 0.9rem; background: rgba(27,31,35,0.05); padding: 2px 4px; border-radius: 3px; }
          img { max-width: 100%; height: auto; border: 1px solid #eaecef; border-radius: 6px; margin: 16px 0; }
          .footer { margin-top: 40px; border-top: 1px solid #eaecef; padding-top: 20px; font-size: 0.8rem; color: #6a737d; text-align: center; }
        </style>
      </head>
      <body>
        <h1>${escapeHTML(docTitle)}</h1>
        <div style="font-size:0.85rem; color:#6a737d; margin-bottom:24px;">
          Generated from Magic Software Unified Knowledge Hub on ${new Date().toLocaleDateString()}
        </div>
        <div class="content">
          ${docBodyHtml}
        </div>
        <div class="footer">
          Magic Software Enterprise © ${new Date().getFullYear()} — All Rights Reserved.
        </div>
        <script>
          window.onload = function() {
            window.print();
          }
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}

// ================= AI COPILOT CHAT SUBMIT =================

async function handleCopilotAskSubmit(e) {
  e.preventDefault();
  const queryInput = document.getElementById('copilot-query-input');
  const chatHistory = document.getElementById('copilot-chat-history');
  const submitBtn = document.getElementById('copilot-submit-btn');
  const userText = queryInput.value.trim();
  if (!userText) return;
  
  queryInput.value = '';
  
  const userMsgEl = document.createElement('div');
  userMsgEl.style.display = 'flex';
  userMsgEl.style.gap = '10px';
  userMsgEl.style.alignItems = 'flex-start';
  userMsgEl.style.justifyContent = 'flex-end';
  userMsgEl.innerHTML = `
    <div class="glass-panel" style="padding:10px 14px; border-radius:12px 0 12px 12px; background: rgba(99,102,241,0.15); border-color: rgba(99,102,241,0.2); max-width:85%;">
      <p style="font-size:0.8rem; color:#fff; margin:0; line-height:1.6;">${escapeHTML(userText)}</p>
    </div>
    <div style="width:24px; height:24px; border-radius:6px; background:rgba(255,255,255,0.06); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
      <i data-lucide="user" style="width:12px; height:12px; color:var(--text-muted);"></i>
    </div>
  `;
  chatHistory.appendChild(userMsgEl);
  lucide.createIcons();
  chatHistory.scrollTop = chatHistory.scrollHeight;
  
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<i data-lucide="loader" class="spin" style="width:14px; height:14px;"></i> Thinking...`;
  lucide.createIcons();
  
  const loadBubble = document.createElement('div');
  loadBubble.style.display = 'flex';
  loadBubble.style.gap = '10px';
  loadBubble.style.alignItems = 'flex-start';
  loadBubble.id = 'copilot-typing-indicator';
  loadBubble.innerHTML = `
    <div style="width:24px; height:24px; border-radius:6px; background:linear-gradient(135deg, var(--primary), var(--accent-purple)); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
      <i data-lucide="bot" style="width:12px; height:12px; color:#fff;"></i>
    </div>
    <div class="glass-panel" style="padding:10px 14px; border-radius:0 12px 12px 12px; background: rgba(255,255,255,0.03); max-width:85%;">
      <p style="font-size:0.8rem; color:var(--text-muted); margin:0;">Synthesizing insights...</p>
    </div>
  `;
  chatHistory.appendChild(loadBubble);
  lucide.createIcons();
  chatHistory.scrollTop = chatHistory.scrollHeight;
  
  try {
    const formData = new FormData();
    formData.append('question', userText);
    
    const res = await fetch('/api/copilot/ask', {
      method: 'POST',
      body: formData
    });
    
    const indicator = document.getElementById('copilot-typing-indicator');
    if (indicator) indicator.remove();
    
    if (res.ok) {
      const data = await res.json();
      
      let citationHtml = '';
      if (data.citations && data.citations.length > 0) {
        citationHtml = `
          <div style="margin-top:12px; border-top:1px solid rgba(255,255,255,0.05); padding-top:8px; display:flex; flex-direction:column; gap:4px;">
            <span style="font-size:0.68rem; color:var(--text-muted); font-weight:600; text-transform:uppercase;">Source Citations:</span>
            <div style="display:flex; flex-wrap:wrap; gap:6px;">
              ${data.citations.map(c => `
                <a href="#" onclick="event.preventDefault(); loadDocumentReader(${c.id});" style="font-size:0.7rem; color:var(--primary); text-decoration:none; padding:2px 8px; border-radius:4px; background:rgba(99,102,241,0.06); border:1px solid rgba(99,102,241,0.15); transition:all 0.2s;" onmouseover="this.style.background='rgba(99,102,241,0.12)';" onmouseout="this.style.background='rgba(99,102,241,0.06)';">
                  <i data-lucide="link" style="width:10px; height:10px; display:inline-block; vertical-align:middle; margin-right:3px;"></i> ${escapeHTML(c.title)}
                </a>
              `).join('')}
            </div>
          </div>
        `;
      }
      
      const botMsgEl = document.createElement('div');
      botMsgEl.style.display = 'flex';
      botMsgEl.style.gap = '10px';
      botMsgEl.style.alignItems = 'flex-start';
      botMsgEl.innerHTML = `
        <div style="width:24px; height:24px; border-radius:6px; background:linear-gradient(135deg, var(--primary), var(--accent-purple)); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
          <i data-lucide="bot" style="width:12px; height:12px; color:#fff;"></i>
        </div>
        <div class="glass-panel" style="padding:10px 14px; border-radius:0 12px 12px 12px; background: rgba(255,255,255,0.03); max-width:85%;">
          <p style="font-size:0.8rem; color:#e5e7eb; margin:0; line-height:1.6; white-space:pre-wrap;">${escapeHTML(data.answer)}</p>
          ${citationHtml}
        </div>
      `;
      chatHistory.appendChild(botMsgEl);
    } else {
      throw new Error("Request failed");
    }
  } catch (err) {
    const indicator = document.getElementById('copilot-typing-indicator');
    if (indicator) indicator.remove();
    
    const errEl = document.createElement('div');
    errEl.style.display = 'flex';
    errEl.style.gap = '10px';
    errEl.style.alignItems = 'flex-start';
    errEl.innerHTML = `
      <div style="width:24px; height:24px; border-radius:6px; background:var(--accent-rose); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
        <i data-lucide="alert-circle" style="width:12px; height:12px; color:#fff;"></i>
      </div>
      <div class="glass-panel" style="padding:10px 14px; border-radius:0 12px 12px 12px; background:rgba(244,63,94,0.05); border-color:rgba(244,63,94,0.1); max-width:85%;">
        <p style="font-size:0.8rem; color:var(--accent-rose); margin:0;">Failed to contact Copilot service. Please try again.</p>
      </div>
    `;
    chatHistory.appendChild(errEl);
  }
  
  submitBtn.disabled = false;
  submitBtn.innerHTML = `<i data-lucide="send" style="width:14px; height:14px;"></i> Ask`;
  lucide.createIcons();
  chatHistory.scrollTop = chatHistory.scrollHeight;
}
