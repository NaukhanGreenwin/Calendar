// DOM elements
const emailTextarea = document.getElementById('emailContent');
const richContentDiv = document.getElementById('richContent');
const charCountSpan = document.getElementById('charCount');
const extractBtn = document.getElementById('extractBtn');
const clearBtn = document.getElementById('clearBtn');
const btnText = document.querySelector('.btn-text');
const btnLoading = document.querySelector('.btn-loading');
const resultsSection = document.getElementById('results');
const eventDetailsDiv = document.getElementById('eventDetails');
const downloadBtn = document.getElementById('downloadBtn');
const errorSection = document.getElementById('error');
const errorMessage = document.getElementById('errorMessage');
const fileUpload = document.getElementById('fileUpload');
const fileUploadArea = document.getElementById('fileUploadArea');

// Global variables
let currentIcsContent = '';
let activeInputType = 'rich'; // 'rich', 'plain', or 'file'

// Tab switching functionality
function switchInputTab(tabType) {
    // Update active tab
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabType}"]`).classList.add('active');
    
    // Show/hide input containers
    document.querySelectorAll('.input-container').forEach(container => {
        container.classList.remove('active');
    });
    document.getElementById(`${tabType}Input`).classList.add('active');
    
    activeInputType = tabType;
    updateCharacterCount();
    
    // Focus on the active input
    if (tabType === 'rich') {
        richContentDiv.focus();
    } else if (tabType === 'plain') {
        emailTextarea.focus();
    }
}

// Get content from active input
function getActiveInputContent() {
    switch (activeInputType) {
        case 'rich':
            return {
                html: richContentDiv.innerHTML,
                text: richContentDiv.innerText || richContentDiv.textContent
            };
        case 'plain':
            return {
                html: null,
                text: emailTextarea.value
            };
        case 'file':
            // File content will be handled separately
            return {
                html: null,
                text: ''
            };
        default:
            return { html: null, text: '' };
    }
}

// Update character count based on active input
function updateCharacterCount() {
    const content = getActiveInputContent();
    const count = content.text ? content.text.length : 0;
    charCountSpan.textContent = count;
    
    // Update button state and warnings
    extractBtn.disabled = count < 10 || count > 50000;
    
    // Update color and show warnings based on character count
    if (count > 45000) {
        charCountSpan.style.color = '#dc3545';
        showContentWarning('Content is very large. Consider using Plain Text mode or shortening the content.');
    } else if (count > 40000) {
        charCountSpan.style.color = '#fd7e14';
        showContentWarning('Large content detected. Processing may take longer.');
    } else if (count > 25000 && activeInputType === 'rich') {
        charCountSpan.style.color = '#fd7e14';
        showContentWarning('Large rich content. Consider switching to Plain Text mode for faster processing.');
    } else {
        charCountSpan.style.color = '#6c757d';
        hideContentWarning();
    }
}

// Show content warning
function showContentWarning(message) {
    let warningDiv = document.getElementById('contentWarning');
    if (!warningDiv) {
        warningDiv = document.createElement('div');
        warningDiv.id = 'contentWarning';
        warningDiv.className = 'content-warning';
        document.querySelector('.character-count').appendChild(warningDiv);
    }
    warningDiv.innerHTML = `⚠️ ${message}`;
    warningDiv.style.display = 'block';
}

// Hide content warning
function hideContentWarning() {
    const warningDiv = document.getElementById('contentWarning');
    if (warningDiv) {
        warningDiv.style.display = 'none';
    }
}

// File upload functionality
function setupFileUpload() {
    // Click to browse
    fileUploadArea.addEventListener('click', () => {
        fileUpload.click();
    });
    
    // File selection
    fileUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            handleFileUpload(file);
        }
    });
    
    // Drag and drop
    fileUploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        fileUploadArea.classList.add('dragover');
    });
    
    fileUploadArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        fileUploadArea.classList.remove('dragover');
    });
    
    fileUploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        fileUploadArea.classList.remove('dragover');
        const file = e.dataTransfer.files[0];
        if (file) {
            handleFileUpload(file);
        }
    });
}

// Handle file upload
function handleFileUpload(file) {
    const fileExt = file.name.toLowerCase().split('.').pop();
    
    // For PDF files, use the API endpoint
    if (fileExt === 'pdf') {
        handlePdfUpload(file);
        return;
    }
    
    // For other files, use FileReader as before
    const reader = new FileReader();
    
    reader.onload = function(e) {
        const content = e.target.result;
        
        // Switch to plain text tab and populate
        switchInputTab('plain');
        emailTextarea.value = content;
        updateCharacterCount();
        
        // Visual feedback
        showSuccess(`File "${file.name}" loaded successfully!`);
    };
    
    reader.onerror = function() {
        showError('Failed to read the file. Please try again.');
    };
    
    reader.readAsText(file);
}

// Handle PDF file upload via API
async function handlePdfUpload(file) {
    try {
        // Show loading state
        const uploadArea = document.getElementById('fileUploadArea');
        const originalContent = uploadArea.innerHTML;
        uploadArea.classList.add('processing');
        uploadArea.innerHTML = `
            <div class="upload-content">
                <div class="upload-icon">📄</div>
                <div class="upload-text">
                    <strong class="pdf-processing">Processing PDF...</strong>
                    <div class="upload-formats">Extracting text from ${file.name}</div>
                </div>
            </div>
        `;

        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/upload-file', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || data.error || 'Failed to process PDF');
        }

        // Switch to plain text tab and populate with extracted text
        switchInputTab('plain');
        emailTextarea.value = data.extractedText;
        updateCharacterCount();

        // Visual feedback
        showSuccess(`PDF "${data.filename}" processed successfully! Extracted ${data.textLength} characters.`);

        // Reset upload area
        uploadArea.classList.remove('processing');
        uploadArea.innerHTML = originalContent;

    } catch (error) {
        console.error('PDF upload error:', error);
        showError(`Failed to process PDF: ${error.message}`);
        
        // Reset upload area
        const uploadArea = document.getElementById('fileUploadArea');
        uploadArea.classList.remove('processing');
        uploadArea.innerHTML = `
            <div class="upload-content">
                <div class="upload-icon">📎</div>
                <div class="upload-text">
                    <strong>Drop email file here or click to browse</strong>
                    <div class="upload-formats">Supports: .eml, .msg, .txt, .html, .pdf files</div>
                </div>
            </div>
        `;
    }
}

// Show success message
function showSuccess(message) {
    // Create temporary success notification
    const successDiv = document.createElement('div');
    successDiv.className = 'success-notification';
    successDiv.innerHTML = `✅ ${message}`;
    successDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #d4edda;
        color: #155724;
        padding: 12px 20px;
        border-radius: 6px;
        border: 1px solid #c3e6cb;
        z-index: 1000;
        font-weight: 500;
    `;
    
    document.body.appendChild(successDiv);
    
    setTimeout(() => {
        successDiv.remove();
    }, 3000);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Setup tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tabType = e.target.getAttribute('data-tab');
            switchInputTab(tabType);
        });
    });
    
    // Setup file upload
    setupFileUpload();
    
    // Setup content change listeners
    richContentDiv.addEventListener('input', updateCharacterCount);
    richContentDiv.addEventListener('paste', (e) => {
        // Allow rich content pasting
        setTimeout(updateCharacterCount, 100);
    });
    
    emailTextarea.addEventListener('input', updateCharacterCount);
    
    // Setup keyboard shortcuts
    setupKeyboardShortcuts();
    
    // Setup clear button
    clearBtn.addEventListener('click', function() {
        if (confirm('Are you sure you want to clear all content? This action cannot be undone.')) {
            clearAll();
        }
    });
    
    // Initial setup
    updateCharacterCount();
    richContentDiv.focus();
});

// Legacy character count functionality (keeping for compatibility)
emailTextarea.addEventListener('input', updateCharacterCount);

// Extract button functionality
extractBtn.addEventListener('click', async function() {
    const content = getActiveInputContent();
    const emailContent = content.text.trim();
    
    if (!emailContent || emailContent.length < 10) {
        showError('Please enter at least 10 characters of email content.');
        return;
    }
    
    if (emailContent.length > 50000) {
        showError('Email content is too long. Please limit to 50,000 characters.');
        return;
    }
    
    // Show loading state
    setLoadingState(true);
    hideResults();
    hideError();
    
    try {
        const response = await fetch('/api/extract-event', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                emailContent: emailContent,
                htmlContent: content.html,
                inputType: activeInputType
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to extract calendar event');
        }
        
        // Store ICS content for download
        currentIcsContent = data.icsContent;
        
        // Display results
        displayEventDetails(data.eventData, data.warnings);
        showResults();
        
    } catch (error) {
        console.error('Error:', error);
        showError(error.message || 'An unexpected error occurred. Please try again.');
    } finally {
        setLoadingState(false);
    }
});

// Download button functionality
downloadBtn.addEventListener('click', function() {
    if (!currentIcsContent) {
        showError('No calendar event data available for download.');
        return;
    }
    
    try {
        // Create blob and download
        const blob = new Blob([currentIcsContent], { type: 'text/calendar' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'event.ics';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        // Show success feedback
        const originalText = downloadBtn.textContent;
        downloadBtn.textContent = '✅ Downloaded!';
        downloadBtn.style.backgroundColor = '#218838';
        
        setTimeout(() => {
            downloadBtn.textContent = originalText;
            downloadBtn.style.backgroundColor = '#28a745';
        }, 2000);
        
    } catch (error) {
        console.error('Download error:', error);
        showError('Failed to download the calendar file. Please try again.');
    }
});

// Utility functions
function setLoadingState(isLoading) {
    extractBtn.disabled = isLoading;
    if (isLoading) {
        btnText.style.display = 'none';
        btnLoading.style.display = 'inline';
    } else {
        btnText.style.display = 'inline';
        btnLoading.style.display = 'none';
    }
}

function showResults() {
    resultsSection.style.display = 'block';
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideResults() {
    resultsSection.style.display = 'none';
}

function showError(message) {
    errorMessage.textContent = message;
    errorSection.style.display = 'block';
    errorSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideError() {
    errorSection.style.display = 'none';
}

function displayEventDetails(eventData, warnings) {
    // Clear previous content
    eventDetailsDiv.innerHTML = '';
    
    // Show warnings if any
    if (warnings && warnings.length > 0) {
        const warningDiv = document.createElement('div');
        warningDiv.className = 'validation-warnings';
        warningDiv.innerHTML = `
            <h4>⚠️ Please Verify These Details:</h4>
            <ul>
                ${warnings.map(warning => `<li>${escapeHtml(warning)}</li>`).join('')}
            </ul>
        `;
        eventDetailsDiv.appendChild(warningDiv);
    }
    
    // Create event fields
    const fields = [
        { label: 'Title', value: eventData.title, icon: '📝' },
        { label: 'Start Date', value: formatDate(eventData.startDate), icon: '📅' },
        { label: 'End Date', value: formatDate(eventData.endDate), icon: '📅' },
        { label: 'Location', value: eventData.location, icon: '📍' },
        { label: 'Meeting Link', value: eventData.meetingLink, icon: '🔗', isLink: true },
        { label: 'Description', value: eventData.description, icon: '📋' }
    ];
    
    fields.forEach(field => {
        if (field.value && field.value.trim()) {
            const fieldDiv = document.createElement('div');
            fieldDiv.className = 'event-field';
            
            if (field.isLink) {
                // Handle meeting links specially
                if (field.value === 'MEETING_LINK_PRESENT_BUT_NOT_EXTRACTED') {
                    fieldDiv.innerHTML = `
                        <strong>${field.icon} ${field.label}:</strong>
                        <span class="missing-link">⚠️ Meeting link detected but not extracted. Check original email for "Click Here to Join" link.</span>
                    `;
                } else {
                    fieldDiv.innerHTML = `
                        <strong>${field.icon} ${field.label}:</strong>
                        <span><a href="${escapeHtml(field.value)}" target="_blank" rel="noopener noreferrer" class="meeting-link">${escapeHtml(field.value)}</a></span>
                    `;
                }
            } else {
                fieldDiv.innerHTML = `
                    <strong>${field.icon} ${field.label}:</strong>
                    <span>${escapeHtml(field.value)}</span>
                `;
            }
            
            eventDetailsDiv.appendChild(fieldDiv);
        }
    });
    
    // If no fields were added, show a generic message
    if (eventDetailsDiv.children.length === 0) {
        eventDetailsDiv.innerHTML = '<div class="event-field"><span>Event details extracted successfully!</span></div>';
    }
}

function formatDate(dateString) {
    if (!dateString) return 'Not specified';
    
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'Invalid date';
        
        return date.toLocaleString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
        });
    } catch (error) {
        return 'Invalid date';
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Clear all functionality
function clearAll() {
    // Clear all input fields
    emailTextarea.value = '';
    richContentDiv.innerHTML = '';
    
    // Reset file upload area
    const fileUploadArea = document.getElementById('fileUploadArea');
    fileUploadArea.innerHTML = `
        <div class="upload-content">
            <div class="upload-icon">📎</div>
            <div class="upload-text">
                <strong>Drop email file here or click to browse</strong>
                <div class="upload-formats">Supports: .eml, .msg, .txt, .html, .pdf files</div>
            </div>
        </div>
    `;
    fileUploadArea.classList.remove('processing');
    
    // Reset file input
    const fileInput = document.getElementById('fileUpload');
    fileInput.value = '';
    
    // Hide results and errors
    hideResults();
    hideError();
    
    // Reset character count
    updateCharacterCount();
    
    // Reset to rich content tab
    switchInputTab('rich');
    
    // Focus on rich content input
    richContentDiv.focus();
    
    // Show success message briefly
    showSuccess('✨ All content cleared!');
}



// Handle Enter key in inputs (Ctrl/Cmd + Enter to submit)
function setupKeyboardShortcuts() {
    const handleKeyDown = function(event) {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            if (!extractBtn.disabled) {
                extractBtn.click();
            }
        }
    };
    
    emailTextarea.addEventListener('keydown', handleKeyDown);
    richContentDiv.addEventListener('keydown', handleKeyDown);
}

// Error handling for network issues
window.addEventListener('online', function() {
    hideError();
});

window.addEventListener('offline', function() {
    showError('You appear to be offline. Please check your internet connection.');
}); 