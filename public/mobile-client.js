// Mobile Client JavaScript

let currentAction = null;
let currentArticleId = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    console.log('Mobile Client initialized');
    loadArticles();
    
    // Register handlebars helper if needed
    if (typeof Handlebars !== 'undefined') {
        Handlebars.registerHelper('formatDate', function(dateString) {
            if (!dateString) return 'Unknown';
            const date = new Date(dateString);
            return date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
        });
    }
});

// Navigation functions
function createNewArticle() {
    console.log('Creating new article');
    window.location.href = '/mobileclient/editor';
}

function editArticle(articleId) {
    console.log('Editing article:', articleId);
    window.location.href = `/mobileclient/editor?id=${encodeURIComponent(articleId)}`;
}

function viewArticle(articleId) {
    console.log('Viewing article:', articleId);
    // TODO: Implement article view functionality
    showNotification('Article view functionality coming soon!', 'info');
}

function deleteArticle(articleId) {
    console.log('Delete article requested:', articleId);
    currentArticleId = articleId;
    currentAction = 'delete';
    
    const article = findArticleById(articleId);
    const articleTitle = article ? article.title : 'this article';
    
    showConfirmModal(
        `Are you sure you want to delete "${articleTitle}"? This action cannot be undone.`,
        'Delete Article'
    );
}

// Article management
async function loadArticles() {
    console.log('Loading articles...');
    showLoading(true);
    
    try {
        const response = await fetch('/mobileclient/api/articles');
        const data = await response.json();
        
        if (data.success) {
            displayArticles(data.articles);
        } else {
            console.error('Failed to load articles:', data.error);
            showNotification('Failed to load articles', 'error');
            showEmptyState();
        }
    } catch (error) {
        console.error('Error loading articles:', error);
        showNotification('Error loading articles', 'error');
        showEmptyState();
    } finally {
        showLoading(false);
    }
}

function displayArticles(articles) {
    const container = document.getElementById('articlesContainer');
    const emptyState = document.getElementById('emptyState');
    
    if (!articles || articles.length === 0) {
        container.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }
    
    container.style.display = 'flex';
    emptyState.style.display = 'none';
    
    // Clear existing articles
    container.innerHTML = '';
    
    // Add each article
    articles.forEach(article => {
        const articleCard = createArticleCard(article);
        container.appendChild(articleCard);
    });
}

function createArticleCard(article) {
    const card = document.createElement('div');
    card.className = 'article-card';
    card.setAttribute('data-uuid', article.uuid);
    
    const formattedDate = formatDate(article.lastModified);
    const statusClass = `status-${article.status}`;
    
    card.innerHTML = `
        <div class="article-header">
            <h3 class="article-title">${escapeHtml(article.title)}</h3>
            <span class="article-status ${statusClass}">${article.status}</span>
        </div>
        
        <p class="article-summary">${escapeHtml(article.summary)}</p>
        
        <div class="article-meta">
            <span class="article-date">
                <i class="fas fa-clock"></i>
                ${formattedDate}
            </span>
            <span class="article-uuid">
                <i class="fas fa-fingerprint"></i>
                ${article.uuid}
            </span>
        </div>
        
        <div class="article-actions">
            <button class="btn btn-secondary" onclick="editArticle('${article.uuid}')">
                <i class="fas fa-edit"></i> Edit
            </button>
            <button class="btn btn-info" onclick="viewArticle('${article.uuid}')">
                <i class="fas fa-eye"></i> View
            </button>
            <button class="btn btn-danger" onclick="deleteArticle('${article.uuid}')">
                <i class="fas fa-trash"></i> Delete
            </button>
        </div>
    `;
    
    return card;
}

async function performDeleteArticle(articleId) {
    console.log('Deleting article:', articleId);
    
    try {
        // TODO: Implement actual delete API call
        await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
        
        // Remove article from DOM
        const articleCard = document.querySelector(`[data-uuid="${articleId}"]`);
        if (articleCard) {
            articleCard.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => {
                articleCard.remove();
                checkIfEmpty();
            }, 300);
        }
        
        showNotification('Article deleted successfully', 'success');
        
    } catch (error) {
        console.error('Error deleting article:', error);
        showNotification('Failed to delete article', 'error');
    }
}

// Utility functions
function findArticleById(articleId) {
    const articleCard = document.querySelector(`[data-uuid="${articleId}"]`);
    if (articleCard) {
        const titleElement = articleCard.querySelector('.article-title');
        return {
            uuid: articleId,
            title: titleElement ? titleElement.textContent : 'Unknown'
        };
    }
    return null;
}

function checkIfEmpty() {
    const container = document.getElementById('articlesContainer');
    const emptyState = document.getElementById('emptyState');
    
    if (container.children.length === 0) {
        container.style.display = 'none';
        emptyState.style.display = 'block';
    }
}

function showLoading(show) {
    const loadingState = document.getElementById('loadingState');
    const articlesContainer = document.getElementById('articlesContainer');
    const emptyState = document.getElementById('emptyState');
    
    if (show) {
        loadingState.style.display = 'block';
        articlesContainer.style.display = 'none';
        emptyState.style.display = 'none';
    } else {
        loadingState.style.display = 'none';
    }
}

function showEmptyState() {
    const loadingState = document.getElementById('loadingState');
    const articlesContainer = document.getElementById('articlesContainer');
    const emptyState = document.getElementById('emptyState');
    
    loadingState.style.display = 'none';
    articlesContainer.style.display = 'none';
    emptyState.style.display = 'block';
}

function formatDate(dateString) {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Modal functions
function showConfirmModal(message, title = 'Confirm Action') {
    const modal = document.getElementById('confirmModal');
    const messageElement = document.getElementById('confirmMessage');
    
    messageElement.textContent = message;
    modal.style.display = 'flex';
}

function closeModal() {
    const modal = document.getElementById('confirmModal');
    modal.style.display = 'none';
    currentAction = null;
    currentArticleId = null;
}

function confirmAction() {
    if (currentAction === 'delete' && currentArticleId) {
        performDeleteArticle(currentArticleId);
    }
    closeModal();
}

// Notification system
function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas fa-${getNotificationIcon(type)}"></i>
            <span>${message}</span>
        </div>
    `;
    
    // Add styles
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${getNotificationColor(type)};
        color: white;
        padding: 1rem;
        border-radius: 6px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 1001;
        animation: slideInRight 0.3s ease-out;
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

function getNotificationIcon(type) {
    switch (type) {
        case 'success': return 'check-circle';
        case 'error': return 'exclamation-circle';
        case 'warning': return 'exclamation-triangle';
        default: return 'info-circle';
    }
}

function getNotificationColor(type) {
    switch (type) {
        case 'success': return '#28a745';
        case 'error': return '#dc3545';
        case 'warning': return '#ffc107';
        default: return '#17a2b8';
    }
}

// Add CSS for notifications
const notificationStyles = document.createElement('style');
notificationStyles.textContent = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    @keyframes slideOut {
        from {
            opacity: 1;
            transform: translateY(0);
        }
        to {
            opacity: 0;
            transform: translateY(-20px);
        }
    }
    
    .notification-content {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
`;
document.head.appendChild(notificationStyles);