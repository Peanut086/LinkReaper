class BookmarkManager {
  constructor() {
    this.bookmarks = [];
    this.flattenedBookmarks = [];
    this.currentFilter = 'all';
    this.currentSort = { field: 'title', direction: 'asc' };
    this.searchQuery = '';
    this.selectedBookmarks = new Set();
    this.isChecking = false;
    this.checkQueue = [];
    this.checkResults = new Map();
    this.deletedBookmarks = [];
    this.currentFolderId = null;
    this.expandedFolders = new Set();
    this.currentPage = 1;
    this.pageSize = 20;
    
    this.init();
  }

  init() {
    this.bindEvents();
    this.loadTheme();
    this.loadBookmarks();
  }

  bindEvents() {
    document.getElementById('themeToggle').addEventListener('click', () => this.toggleTheme());
    document.getElementById('startCheck').addEventListener('click', () => this.startCheck());
    document.getElementById('stopCheck').addEventListener('click', () => this.stopCheck());
    document.getElementById('expandAll').addEventListener('click', () => this.expandAll());
    document.getElementById('collapseAll').addEventListener('click', () => this.collapseAll());
    document.getElementById('searchInput').addEventListener('input', (e) => this.handleSearch(e.target.value));
    document.getElementById('selectAll').addEventListener('change', (e) => this.toggleSelectAll(e.target.checked));
    document.getElementById('deleteSelected').addEventListener('click', () => this.showDeleteConfirm('selected'));
    document.getElementById('deleteAllInvalid').addEventListener('click', () => this.showDeleteConfirm('invalid'));
    document.getElementById('undoDelete').addEventListener('click', () => this.undoDelete());
    document.getElementById('prevPage').addEventListener('click', () => this.prevPage());
    document.getElementById('nextPage').addEventListener('click', () => this.nextPage());
    document.getElementById('pageSize').addEventListener('change', (e) => this.changePageSize(e.target.value));

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => this.setFilter(btn.dataset.filter));
    });

    document.querySelectorAll('.sortable').forEach(th => {
      th.addEventListener('click', () => this.handleSort(th.dataset.sort));
    });

    document.querySelector('.modal-close').addEventListener('click', () => this.hideModal());
    document.querySelector('.modal-cancel').addEventListener('click', () => this.hideModal());
    document.querySelector('.modal-confirm').addEventListener('click', () => this.confirmDelete());
  }

  loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
  }

  toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  }

  async loadBookmarks() {
    try {
      const tree = await chrome.bookmarks.getTree();
      this.bookmarks = tree;
      this.flattenBookmarks(tree);
      this.renderBookmarkTree();
      this.renderTable();
      this.updateStats();
    } catch (error) {
      this.showToast('加载书签失败: ' + error.message, 'error');
    }
  }

  flattenBookmarks(nodes, parentPath = []) {
    nodes.forEach(node => {
      const path = [...parentPath, node.title || 'Root'];
      
      if (node.url) {
        this.flattenedBookmarks.push({
          id: node.id,
          title: node.title,
          url: node.url,
          dateAdded: node.dateAdded,
          dateGroupModified: node.dateGroupModified,
          index: node.index,
          parentId: node.parentId,
          path: path.join(' > '),
          status: 'pending',
          checked: false
        });
      }
      
      if (node.children) {
        this.flattenBookmarks(node.children, path);
      }
    });
  }

  renderBookmarkTree() {
    const container = document.getElementById('bookmarkTree');
    container.innerHTML = '';
    
    const treeHtml = this.buildTreeHtml(this.bookmarks);
    container.innerHTML = treeHtml;

    container.querySelectorAll('.tree-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleTreeItemClick(item);
      });
    });

    container.querySelectorAll('.tree-toggle').forEach(toggle => {
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleFolder(toggle);
      });
    });
  }

  buildTreeHtml(nodes, level = 0) {
    let html = '';
    
    nodes.forEach(node => {
      const hasChildren = node.children && node.children.length > 0;
      const isExpanded = this.expandedFolders.has(node.id);
      
      html += `
        <div class="tree-item ${this.currentFolderId === node.id ? 'active' : ''}" data-id="${node.id}" data-level="${level}">
          ${hasChildren ? `
            <span class="tree-toggle ${isExpanded ? 'expanded' : ''}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </span>
          ` : '<span class="tree-toggle"></span>'}
          <span class="tree-icon">
            ${node.url ? `
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
              </svg>
            ` : `
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
            `}
          </span>
          <span class="tree-label">${node.title || 'Root'}</span>
        </div>
      `;
      
      if (hasChildren) {
        html += `<div class="tree-children ${isExpanded ? 'expanded' : ''}" data-parent="${node.id}">`;
        html += this.buildTreeHtml(node.children, level + 1);
        html += '</div>';
      }
    });
    
    return html;
  }

  handleTreeItemClick(item) {
    const id = item.dataset.id;
    
    document.querySelectorAll('.tree-item').forEach(el => el.classList.remove('active'));
    item.classList.add('active');
    
    this.currentFolderId = id;
    this.currentPage = 1;
    this.renderTable();
  }

  toggleFolder(toggle) {
    const treeItem = toggle.closest('.tree-item');
    const id = treeItem.dataset.id;
    const children = document.querySelector(`.tree-children[data-parent="${id}"]`);
    
    if (children) {
      children.classList.toggle('expanded');
      toggle.classList.toggle('expanded');
      
      if (this.expandedFolders.has(id)) {
        this.expandedFolders.delete(id);
      } else {
        this.expandedFolders.add(id);
      }
    }
  }

  expandAll() {
    document.querySelectorAll('.tree-children').forEach(el => el.classList.add('expanded'));
    document.querySelectorAll('.tree-toggle').forEach(el => el.classList.add('expanded'));
    this.bookmarks.forEach(node => this.collectFolderIds(node));
  }

  collapseAll() {
    document.querySelectorAll('.tree-children').forEach(el => el.classList.remove('expanded'));
    document.querySelectorAll('.tree-toggle').forEach(el => el.classList.remove('expanded'));
    this.expandedFolders.clear();
  }

  collectFolderIds(node) {
    if (node.children) {
      this.expandedFolders.add(node.id);
      node.children.forEach(child => this.collectFolderIds(child));
    }
  }

  renderTable() {
    const tbody = document.getElementById('bookmarkTableBody');
    const emptyState = document.getElementById('emptyState');
    const pagination = document.getElementById('pagination');
    
    let filteredBookmarks = this.getFilteredBookmarks();
    
    if (filteredBookmarks.length === 0) {
      tbody.innerHTML = '';
      emptyState.style.display = 'flex';
      pagination.style.display = 'none';
      return;
    }
    
    emptyState.style.display = 'none';
    
    filteredBookmarks = this.sortBookmarks(filteredBookmarks);
    
    const totalPages = Math.ceil(filteredBookmarks.length / this.pageSize);
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    const pageBookmarks = filteredBookmarks.slice(startIndex, endIndex);
    
    tbody.innerHTML = pageBookmarks.map(bookmark => `
      <tr data-id="${bookmark.id}">
        <td>
          <input type="checkbox" class="bookmark-checkbox" 
                 data-id="${bookmark.id}" 
                 ${this.selectedBookmarks.has(bookmark.id) ? 'checked' : ''} />
        </td>
        <td>${this.renderStatusBadge(bookmark.status)}</td>
        <td>
          <div class="title-cell">
            <svg class="bookmark-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
            </svg>
            <span>${this.escapeHtml(bookmark.title || 'Untitled')}</span>
          </div>
        </td>
        <td>
          <div class="url-cell">
            <a href="${bookmark.url}" target="_blank" title="${bookmark.url}">${this.escapeHtml(bookmark.url)}</a>
          </div>
        </td>
        <td>${this.formatDate(bookmark.dateAdded)}</td>
        <td>
          <button class="action-btn" onclick="bookmarkManager.openBookmark('${bookmark.url}')">打开</button>
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.bookmark-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        this.toggleBookmarkSelection(e.target.dataset.id, e.target.checked);
      });
    });

    this.updatePagination(totalPages, filteredBookmarks.length);
    this.updateActionButtons();
  }

  renderStatusBadge(status) {
    const statusMap = {
      'pending': { class: 'status-pending', text: '待检测' },
      'checking': { class: 'status-checking', text: '检测中' },
      'valid': { class: 'status-valid', text: '有效' },
      'invalid': { class: 'status-invalid', text: '失效' },
      'timeout': { class: 'status-timeout', text: '超时' }
    };
    
    const config = statusMap[status] || statusMap['pending'];
    return `<span class="status-badge ${config.class}">${config.text}</span>`;
  }

  getFilteredBookmarks() {
    let bookmarks = [...this.flattenedBookmarks];
    
    if (this.currentFolderId) {
      bookmarks = bookmarks.filter(b => b.parentId === this.currentFolderId);
    }
    
    if (this.currentFilter !== 'all') {
      bookmarks = bookmarks.filter(b => b.status === this.currentFilter);
    }
    
    if (this.searchQuery) {
      const query = this.searchQuery.toLowerCase();
      bookmarks = bookmarks.filter(b => 
        b.title.toLowerCase().includes(query) || 
        b.url.toLowerCase().includes(query)
      );
    }
    
    return bookmarks;
  }

  updatePagination(totalPages, totalItems) {
    const pagination = document.getElementById('pagination');
    const prevBtn = document.getElementById('prevPage');
    const nextBtn = document.getElementById('nextPage');
    const pageInfo = document.getElementById('pageInfo');
    
    if (totalPages <= 1) {
      pagination.style.display = 'none';
      return;
    }
    
    pagination.style.display = 'flex';
    pageInfo.textContent = `第 ${this.currentPage} / ${totalPages} 页`;
    
    prevBtn.disabled = this.currentPage === 1;
    nextBtn.disabled = this.currentPage === totalPages;
  }

  prevPage() {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.renderTable();
    }
  }

  nextPage() {
    const filteredBookmarks = this.getFilteredBookmarks();
    const totalPages = Math.ceil(filteredBookmarks.length / this.pageSize);
    
    if (this.currentPage < totalPages) {
      this.currentPage++;
      this.renderTable();
    }
  }

  changePageSize(size) {
    this.pageSize = parseInt(size);
    this.currentPage = 1;
    this.renderTable();
  }

  sortBookmarks(bookmarks) {
    const { field, direction } = this.currentSort;
    
    return bookmarks.sort((a, b) => {
      let valueA, valueB;
      
      switch (field) {
        case 'title':
          valueA = (a.title || '').toLowerCase();
          valueB = (b.title || '').toLowerCase();
          break;
        case 'url':
          valueA = a.url.toLowerCase();
          valueB = b.url.toLowerCase();
          break;
        case 'dateAdded':
          valueA = a.dateAdded || 0;
          valueB = b.dateAdded || 0;
          break;
        default:
          return 0;
      }
      
      if (valueA < valueB) return direction === 'asc' ? -1 : 1;
      if (valueA > valueB) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  }

  handleSort(field) {
    if (this.currentSort.field === field) {
      this.currentSort.direction = this.currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
      this.currentSort.field = field;
      this.currentSort.direction = 'asc';
    }
    
    this.currentPage = 1;
    
    document.querySelectorAll('.sortable').forEach(th => {
      th.classList.remove('asc', 'desc');
      if (th.dataset.sort === field) {
        th.classList.add(this.currentSort.direction);
      }
    });
    
    this.renderTable();
  }

  handleSearch(query) {
    this.searchQuery = query;
    this.currentPage = 1;
    this.renderTable();
  }

  setFilter(filter) {
    this.currentFilter = filter;
    this.currentPage = 1;
    
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    
    this.renderTable();
  }

  toggleBookmarkSelection(id, selected) {
    if (selected) {
      this.selectedBookmarks.add(id);
    } else {
      this.selectedBookmarks.delete(id);
    }
    
    this.updateSelectedCount();
    this.updateActionButtons();
  }

  toggleSelectAll(checked) {
    const filteredBookmarks = this.getFilteredBookmarks();
    const totalPages = Math.ceil(filteredBookmarks.length / this.pageSize);
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    const pageBookmarks = filteredBookmarks.slice(startIndex, endIndex);
    
    if (checked) {
      pageBookmarks.forEach(b => this.selectedBookmarks.add(b.id));
    } else {
      pageBookmarks.forEach(b => this.selectedBookmarks.delete(b.id));
    }
    
    document.querySelectorAll('.bookmark-checkbox').forEach(checkbox => {
      checkbox.checked = checked;
    });
    
    this.updateSelectedCount();
    this.updateActionButtons();
  }

  updateSelectedCount() {
    const count = this.selectedBookmarks.size;
    document.getElementById('selectedCount').textContent = `已选择 ${count} 项`;
  }

  updateActionButtons() {
    const hasSelected = this.selectedBookmarks.size > 0;
    const hasInvalid = this.flattenedBookmarks.some(b => b.status === 'invalid');
    const canUndo = this.deletedBookmarks.length > 0;
    
    document.getElementById('deleteSelected').disabled = !hasSelected;
    document.getElementById('deleteAllInvalid').disabled = !hasInvalid;
    document.getElementById('undoDelete').disabled = !canUndo;
  }

  async startCheck() {
    if (this.isChecking) return;
    
    this.isChecking = true;
    this.checkQueue = [...this.flattenedBookmarks];
    this.checkResults.clear();
    
    document.getElementById('startCheck').disabled = true;
    document.getElementById('stopCheck').disabled = false;
    
    this.showToast('开始检测书签链接...', 'info');
    
    await this.processCheckQueue();
  }

  isLocalOrIntranetUrl(url) {
    try {
      const urlObj = new URL(url);
      
      const hostname = urlObj.hostname.toLowerCase();
      
      if (urlObj.protocol === 'file:') {
        return true;
      }
      
      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return true;
      }
      
      if (hostname.endsWith('.local')) {
        return true;
      }
      
      const ipPattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
      const match = hostname.match(ipPattern);
      
      if (match) {
        const [, a, b, c, d] = match.map(Number);
        
        if (a === 10) {
          return true;
        }
        
        if (a === 172 && b >= 16 && b <= 31) {
          return true;
        }
        
        if (a === 192 && b === 168) {
          return true;
        }
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }

  async processCheckQueue() {
    const batchSize = 5;
    const delayBetweenBatches = 500;
    
    while (this.isChecking && this.checkQueue.length > 0) {
      const batch = this.checkQueue.splice(0, batchSize);
      
      await Promise.all(batch.map(bookmark => this.checkBookmark(bookmark)));
      
      this.updateProgress();
      this.renderTable();
      this.updateStats();
      
      if (this.isChecking) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
      }
    }
    
    if (this.isChecking) {
      this.showToast('检测完成！', 'success');
    }
    
    this.stopCheck();
  }

  async checkBookmark(bookmark) {
    if (this.isLocalOrIntranetUrl(bookmark.url)) {
      bookmark.status = 'valid';
      this.checkResults.set(bookmark.id, { status: 'valid', url: bookmark.url, skipped: true });
      return;
    }
    
    bookmark.status = 'checking';
    this.renderTable();
    
    try {
      const result = await this.checkLinkStatus(bookmark.url);
      
      if (result.status === 'valid') {
        bookmark.status = 'valid';
      } else if (result.status === 'timeout') {
        bookmark.status = 'timeout';
      } else {
        bookmark.status = 'invalid';
      }
      
      this.checkResults.set(bookmark.id, result);
    } catch (error) {
      bookmark.status = 'invalid';
      this.checkResults.set(bookmark.id, { status: 'error', error: error.message });
    }
  }

  async checkLinkStatus(url) {
    const maxRetries = 2;
    const delays = [0, 1000, 2000];
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        await new Promise(resolve => setTimeout(resolve, delays[attempt]));
      }
      
      try {
        const result = await this.tryCheckLink(url, attempt);
        if (result.status !== 'timeout') {
          return result;
        }
      } catch (error) {
        console.log(`Attempt ${attempt + 1} failed for ${url}:`, error.message);
      }
    }
    
    return {
      status: 'timeout',
      url: url
    };
  }

  async tryCheckLink(url, attempt) {
    const timeout = 15000 + (attempt * 5000);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const methods = attempt === 0 ? ['HEAD', 'GET'] : ['GET'];
      
      for (const method of methods) {
        try {
          const response = await fetch(url, {
            method: method,
            mode: 'no-cors',
            cache: 'no-cache',
            redirect: 'follow',
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });
          
          clearTimeout(timeoutId);
          
          return {
            status: 'valid',
            url: url
          };
        } catch (fetchError) {
          if (fetchError.name !== 'TypeError' && fetchError.name !== 'AbortError') {
            throw fetchError;
          }
        }
      }
      
      throw new Error('All methods failed');
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        return {
          status: 'timeout',
          url: url
        };
      }
      
      if (error.message && (
        error.message.includes('Failed to fetch') ||
        error.message.includes('NetworkError') ||
        error.message.includes('All methods failed')
      )) {
        return {
          status: 'timeout',
          url: url
        };
      }
      
      if (error.message && (
        error.message.includes('ERR_NAME_NOT_RESOLVED') ||
        error.message.includes('ERR_CONNECTION_REFUSED') ||
        error.message.includes('ERR_CONNECTION_TIMED_OUT') ||
        error.message.includes('DNS_PROBE')
      )) {
        return {
          status: 'invalid',
          url: url,
          error: error.message
        };
      }
      
      return {
        status: 'timeout',
        url: url
      };
    }
  }

  stopCheck() {
    this.isChecking = false;
    document.getElementById('startCheck').disabled = false;
    document.getElementById('stopCheck').disabled = true;
  }

  updateProgress() {
    const total = this.flattenedBookmarks.length;
    const checked = Array.from(this.checkResults.values()).length;
    const percentage = total > 0 ? (checked / total) * 100 : 0;
    
    document.getElementById('progressBar').style.width = `${percentage}%`;
    document.getElementById('progressText').textContent = `${checked}/${total}`;
  }

  updateStats() {
    const total = this.flattenedBookmarks.length;
    const valid = this.flattenedBookmarks.filter(b => b.status === 'valid').length;
    const invalid = this.flattenedBookmarks.filter(b => b.status === 'invalid').length;
    const timeout = this.flattenedBookmarks.filter(b => b.status === 'timeout').length;
    const skipped = Array.from(this.checkResults.values()).filter(r => r.skipped).length;
    
    document.getElementById('totalCount').textContent = total;
    document.getElementById('validCount').textContent = valid;
    document.getElementById('invalidCount').textContent = invalid;
    document.getElementById('timeoutCount').textContent = timeout;
  }

  showDeleteConfirm(type) {
    this.deleteType = type;
    const message = type === 'selected' 
      ? `确定要删除选中的 ${this.selectedBookmarks.size} 个书签吗？`
      : '确定要删除所有失效的书签吗？';
    
    document.getElementById('confirmMessage').textContent = message;
    document.getElementById('confirmDialog').style.display = 'flex';
  }

  hideModal() {
    document.getElementById('confirmDialog').style.display = 'none';
  }

  async confirmDelete() {
    this.hideModal();
    
    try {
      let bookmarksToDelete = [];
      
      if (this.deleteType === 'selected') {
        bookmarksToDelete = this.flattenedBookmarks.filter(b => this.selectedBookmarks.has(b.id));
      } else {
        bookmarksToDelete = this.flattenedBookmarks.filter(b => b.status === 'invalid');
      }
      
      this.deletedBookmarks = [...bookmarksToDelete];
      
      for (const bookmark of bookmarksToDelete) {
        await chrome.bookmarks.remove(bookmark.id);
      }
      
      this.flattenedBookmarks = this.flattenedBookmarks.filter(b => 
        !bookmarksToDelete.some(del => del.id === b.id)
      );
      
      this.selectedBookmarks.clear();
      
      await this.loadBookmarks();
      
      this.showToast(`成功删除 ${bookmarksToDelete.length} 个书签`, 'success');
    } catch (error) {
      this.showToast('删除失败: ' + error.message, 'error');
    }
  }

  async undoDelete() {
    if (this.deletedBookmarks.length === 0) return;
    
    try {
      for (const bookmark of this.deletedBookmarks) {
        await chrome.bookmarks.create({
          parentId: bookmark.parentId,
          title: bookmark.title,
          url: bookmark.url
        });
      }
      
      this.deletedBookmarks = [];
      
      await this.loadBookmarks();
      
      this.showToast('撤销删除成功', 'success');
    } catch (error) {
      this.showToast('撤销失败: ' + error.message, 'error');
    }
  }

  openBookmark(url) {
    chrome.tabs.create({ url: url });
  }

  formatDate(timestamp) {
    if (!timestamp) return '-';
    const date = new Date(timestamp);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    
    toastMessage.textContent = message;
    toast.className = `toast ${type}`;
    toast.style.display = 'flex';
    
    setTimeout(() => {
      toast.style.display = 'none';
    }, 3000);
  }
}

const bookmarkManager = new BookmarkManager();
