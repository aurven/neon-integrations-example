// Mobile Client Editor JavaScript

let headlineEditor, summaryEditor, contentEditor, bylineEditor;
let currentArticleId = null;

// Initialize the editor
document.addEventListener('DOMContentLoaded', function() {
    console.log('Mobile Client Editor initialized');
    initializeEditors();
    loadArticleData();
});

// Initialize Quill editors
function initializeEditors() {
    console.log('Initializing Quill editors...');
    
    // Configure Quill toolbar
    const toolbarOptions = [
        ['bold', 'italic', 'underline', 'strike'],
        ['blockquote', 'code-block'],
        [{ 'header': 1 }, { 'header': 2 }],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        [{ 'script': 'sub'}, { 'script': 'super' }],
        [{ 'indent': '-1'}, { 'indent': '+1' }],
        [{ 'direction': 'rtl' }],
        [{ 'color': [] }, { 'background': [] }],
        [{ 'font': [] }],
        [{ 'align': [] }],
        ['link'],
        ['clean']
    ];

    const simpleToolbarOptions = [
        ['bold', 'italic', 'underline'],
        ['link'],
        ['clean']
    ];

    // Initialize editors with different configurations
    headlineEditor = new Quill('#headlineEditor', {
        theme: 'snow',
        modules: {
            toolbar: simpleToolbarOptions
        },
        placeholder: 'Enter article headline...'
    });

    summaryEditor = new Quill('#summaryEditor', {
        theme: 'snow',
        modules: {
            toolbar: simpleToolbarOptions
        },
        placeholder: 'Enter article summary...'
    });

    contentEditor = new Quill('#contentEditor', {
        theme: 'snow',
        modules: {
            toolbar: toolbarOptions
        },
        placeholder: 'Write your article content here...'
    });

    bylineEditor = new Quill('#bylineEditor', {
        theme: 'snow',
        modules: {
            toolbar: simpleToolbarOptions
        },
        placeholder: 'Enter byline (e.g., "John Doe, Staff Writer")...'
    });

    console.log('Quill editors initialized successfully');
}

// Load article data if editing
function loadArticleData() {
    const urlParams = new URLSearchParams(window.location.search);
    const articleId = urlParams.get('id');
    
    if (articleId) {
        currentArticleId = articleId;
        console.log('Loading article for editing:', articleId);
        loadArticleForEditing(articleId);
    } else {
        console.log('Creating new article');
    }
}

async function loadArticleForEditing(articleId) {
    try {
        showSaveStatus('Loading article...', 'loading');
        
        const response = await fetch(`/mobileclient/api/articles/${encodeURIComponent(articleId)}`);
        const data = await response.json();
        
        if (data.success && data.article) {
            const article = data.article;
            
            // Populate editors with article data
            if (article.title) {
                headlineEditor.root.innerHTML = article.title;
            }
            if (article.summary) {
                summaryEditor.root.innerHTML = article.summary;
            }
            if (article.content) {
                contentEditor.root.innerHTML = article.content;
            }
            if (article.byline) {
                bylineEditor.root.innerHTML = article.byline;
            }
            
            // Update hidden field
            document.getElementById('articleId').value = article.uuid;
            
            hideSaveStatus();
            console.log('Article loaded successfully');
            
        } else {
            console.error('Failed to load article:', data.error);
            showNotification('Failed to load article for editing', 'error');
            hideSaveStatus();
        }
        
    } catch (error) {
        console.error('Error loading article:', error);
        showNotification('Error loading article', 'error');
        hideSaveStatus();
    }
}

// Navigation functions
function goBack() {
    if (hasUnsavedChanges()) {
        if (confirm('You have unsaved changes. Are you sure you want to go back?')) {
            window.location.href = '/mobileclient';
        }
    } else {
        window.location.href = '/mobileclient';
    }
}

// Save article
async function saveArticle() {
    console.log('Saving article...');
    
    try {
        // Get content from editors
        const headline = headlineEditor.root.innerHTML.trim();
        const summary = summaryEditor.root.innerHTML.trim();
        const content = contentEditor.root.innerHTML.trim();
        const byline = bylineEditor.root.innerHTML.trim();
        const articleId = document.getElementById('articleId').value;
        
        // Validate required fields
        if (!headline || headline === '<p><br></p>') {
            showNotification('Headline is required', 'error');
            return;
        }
        
        if (!content || content === '<p><br></p>') {
            showNotification('Content is required', 'error');
            return;
        }
        
        showSaveStatus('Saving article...', 'loading');
        
        // Prepare data for saving
        const saveData = {
            headline: cleanHtml(headline),
            summary: cleanHtml(summary),
            content: cleanHtml(content),
            byline: cleanHtml(byline),
            articleId: articleId || null
        };
        
        console.log('Saving data:', saveData);
        
        // Send to server
        const response = await fetch('/mobileclient/save', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(saveData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showSaveStatus('Article saved successfully!', 'success');
            
            // Update article ID if it was a new article
            if (result.articleId && !currentArticleId) {
                currentArticleId = result.articleId;
                document.getElementById('articleId').value = result.articleId;
                
                // Update URL to reflect the article ID
                const newUrl = `/mobileclient/editor?id=${encodeURIComponent(result.articleId)}`;
                window.history.replaceState({ articleId: result.articleId }, '', newUrl);
            }
            
            // Auto-hide success message after 2 seconds
            setTimeout(() => {
                hideSaveStatus();
            }, 2000);
            
            console.log('Article saved successfully:', result);
            
        } else {
            console.error('Failed to save article:', result.error);
            showSaveStatus('Failed to save article', 'error');
            showNotification(`Save failed: ${result.error}`, 'error');
        }
        
    } catch (error) {
        console.error('Error saving article:', error);
        showSaveStatus('Error saving article', 'error');
        showNotification('Error saving article', 'error');
    }
}

// Preview article
function previewArticle() {
    console.log('Generating article preview...');
    
    const headline = cleanHtml(headlineEditor.root.innerHTML);
    const summary = cleanHtml(summaryEditor.root.innerHTML);
    const content = cleanHtml(contentEditor.root.innerHTML);
    const byline = cleanHtml(bylineEditor.root.innerHTML);
    
    const previewHtml = generatePreviewHtml(headline, summary, content, byline);
    
    // Show preview modal
    const modal = document.getElementById('previewModal');
    const previewContent = document.getElementById('previewContent');
    
    previewContent.innerHTML = previewHtml;
    modal.style.display = 'flex';
}

function closePreview() {
    const modal = document.getElementById('previewModal');
    modal.style.display = 'none';
}

// Generate XML
function generateXML() {
    console.log('Generating XML...');
    
    const headline = cleanHtml(headlineEditor.root.innerHTML);
    const summary = cleanHtml(summaryEditor.root.innerHTML);
    const content = cleanHtml(contentEditor.root.innerHTML);
    const byline = cleanHtml(bylineEditor.root.innerHTML);
    
    const xmlContent = generateArticleXML(headline, summary, content, byline);
    
    // Show XML modal
    const modal = document.getElementById('xmlModal');
    const xmlElement = document.getElementById('xmlContent');
    
    xmlElement.textContent = xmlContent;
    modal.style.display = 'flex';
}

function closeXMLModal() {
    const modal = document.getElementById('xmlModal');
    modal.style.display = 'none';
}

function copyXML() {
    const xmlContent = document.getElementById('xmlContent');
    const text = xmlContent.textContent;
    
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(() => {
            showNotification('XML copied to clipboard!', 'success');
        }).catch(err => {
            console.error('Failed to copy XML:', err);
            fallbackCopyXML(text);
        });
    } else {
        fallbackCopyXML(text);
    }
}

function fallbackCopyXML(text) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            showNotification('XML copied to clipboard!', 'success');
        } else {
            showNotification('Failed to copy XML', 'error');
        }
    } catch (err) {
        console.error('Fallback copy failed:', err);
        showNotification('Failed to copy XML', 'error');
    }
    
    document.body.removeChild(textArea);
}

// Utility functions
function cleanHtml(html) {
    // Remove empty paragraphs and clean up HTML
    return html
        .replace(/<p><br><\/p>/g, '')
        .replace(/<p>\s*<\/p>/g, '')
        .trim();
}

function generatePreviewHtml(headline, summary, content, byline) {
    return `
        <h1>${headline || 'Untitled Article'}</h1>
        ${summary ? `<div class="summary">${summary}</div>` : ''}
        <div class="content">${content || '<p>No content</p>'}</div>
        ${byline ? `<div class="byline">${byline}</div>` : ''}
    `;
}

function generateArticleXML(headline, summary, content, byline) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<doc>
    <story>
        <grouphead>
            <headline>
                ${headline ? `<p>${escapeXml(stripHtml(headline))}</p>` : '<p></p>'}
            </headline>
        </grouphead>
        <summary>
            ${summary ? `<p>${escapeXml(stripHtml(summary))}</p>` : '<p></p>'}
        </summary>
        <content>
            ${content || '<p></p>'}
        </content>
        <byline>
            ${byline ? `<p>${escapeXml(stripHtml(byline))}</p>` : '<p></p>'}
        </byline>
    </story>
</doc>`.trim();
}

function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
}

function escapeXml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function hasUnsavedChanges() {
    // Simple check - in a real app, you'd track changes more sophisticated
    const headline = headlineEditor.root.innerHTML.trim();
    const summary = summaryEditor.root.innerHTML.trim();
    const content = contentEditor.root.innerHTML.trim();
    const byline = bylineEditor.root.innerHTML.trim();
    
    return (headline && headline !== '<p><br></p>') ||
           (summary && summary !== '<p><br></p>') ||
           (content && content !== '<p><br></p>') ||
           (byline && byline !== '<p><br></p>');
}

// Save status functions
function showSaveStatus(message, type) {
    const saveStatus = document.getElementById('saveStatus');
    const statusIcon = document.getElementById('statusIcon');
    const statusMessage = document.getElementById('statusMessage');
    
    // Remove existing status classes
    saveStatus.className = 'save-status';
    
    // Add new status class
    if (type) {
        saveStatus.classList.add(`status-${type}`);
    }
    
    // Update icon based on type
    statusIcon.className = 'fas';
    switch (type) {
        case 'loading':
            statusIcon.classList.add('fa-spinner', 'fa-spin');
            break;
        case 'success':
            statusIcon.classList.add('fa-check-circle');
            break;
        case 'error':
            statusIcon.classList.add('fa-exclamation-circle');
            break;
        default:
            statusIcon.classList.add('fa-info-circle');
    }
    
    statusMessage.textContent = message;
    saveStatus.style.display = 'block';
}

function hideSaveStatus() {
    const saveStatus = document.getElementById('saveStatus');
    saveStatus.style.display = 'none';
}

// Notification system (same as main page)
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas fa-${getNotificationIcon(type)}"></i>
            <span>${message}</span>
        </div>
    `;
    
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
        max-width: 300px;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease-out';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 4000);
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

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    // Ctrl/Cmd + S to save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveArticle();
    }
    
    // Escape to close modals
    if (e.key === 'Escape') {
        closePreview();
        closeXMLModal();
    }
});

// Auto-save functionality (optional)
let autoSaveTimer;
function startAutoSave() {
    // Auto-save every 30 seconds if there are changes
    autoSaveTimer = setInterval(() => {
        if (hasUnsavedChanges()) {
            console.log('Auto-saving...');
            saveArticle();
        }
    }, 30000);
}

function stopAutoSave() {
    if (autoSaveTimer) {
        clearInterval(autoSaveTimer);
        autoSaveTimer = null;
    }
}

// Uncomment to enable auto-save
// startAutoSave();

// Clean up on page unload
window.addEventListener('beforeunload', function(e) {
    stopAutoSave();
    
    if (hasUnsavedChanges()) {
        const message = 'You have unsaved changes. Are you sure you want to leave?';
        e.returnValue = message;
        return message;
    }
});