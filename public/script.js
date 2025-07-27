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

    reader.onload = function (e) {
        const content = e.target.result;

        // Switch to plain text tab and populate
        switchInputTab('plain');
        emailTextarea.value = content;
        updateCharacterCount();

        // Visual feedback
        showSuccess(`File "${file.name}" loaded successfully!`);
    };

    reader.onerror = function () {
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

// Get user's timezone for better context
function getUserTimezone() {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (error) {
        return 'Unknown';
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function () {
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
    clearBtn.addEventListener('click', function () {
        if (confirm('Are you sure you want to clear all content? This action cannot be undone.')) {
            clearAll();
        }
    });

    // Initial setup
    updateCharacterCount();
    richContentDiv.focus();

    // Display user's timezone and current time
    const timezoneDisplay = document.getElementById('timezoneDisplay');
    if (timezoneDisplay) {
        const timezone = getUserTimezone();
        const now = new Date();
        const timeString = now.toLocaleString('en-US', {
            timeZone: timezone,
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
        });
        timezoneDisplay.textContent = `🌍 Your current time: ${timeString}`;

        // Update time every minute
        setInterval(() => {
            const currentTime = new Date();
            const updatedTimeString = currentTime.toLocaleString('en-US', {
                timeZone: timezone,
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                timeZoneName: 'short'
            });
            timezoneDisplay.textContent = `🌍 Your current time: ${updatedTimeString}`;
        }, 60000); // Update every minute
    }
});

// Legacy character count functionality (keeping for compatibility)
emailTextarea.addEventListener('input', updateCharacterCount);

// Extract button functionality
extractBtn.addEventListener('click', async function () {
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
        const now = new Date();
        const response = await fetch('/api/extract-event', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                emailContent: emailContent,
                htmlContent: content.html,
                inputType: activeInputType,
                userTimezone: getUserTimezone(),
                userCurrentTime: {
                    iso: now.toISOString(),
                    local: now.toLocaleString('en-US', {
                        timeZone: getUserTimezone(),
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        timeZoneName: 'short'
                    }),
                    timestamp: now.getTime(),
                    timezoneOffset: now.getTimezoneOffset()
                }
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to extract calendar event');
        }

        // Store ICS content for download
        currentIcsContent = data.icsContent;

        // Display results
        displayEventDetails(data.eventData, data.eventData.warnings || data.warnings);
        showResults();

    } catch (error) {
        console.error('Error:', error);
        showError(error.message || 'An unexpected error occurred. Please try again.');
    } finally {
        setLoadingState(false);
    }
});

// Download button functionality
downloadBtn.addEventListener('click', function () {
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
        { label: 'End Date', value: formatDate(eventData.endDate), icon: '📅' }
    ];

    // Add attendees if available
    if (eventData.attendees && eventData.attendees.length > 0) {
        const attendeesList = eventData.attendees.map(attendee => {
            if (typeof attendee === 'object' && attendee.email) {
                return `${attendee.name || attendee.email} <${attendee.email}>`;
            }
            return attendee;
        }).join(', ');
        
        fields.push({ 
            label: 'Attendees', 
            value: attendeesList, 
            icon: '👥',
            isAttendees: true
        });
    }

    // Add enhanced location information
    if (eventData.locationDetails && (eventData.locationDetails.name || eventData.locationDetails.address)) {
        const locationParts = [];

        if (eventData.locationDetails.name) {
            locationParts.push(eventData.locationDetails.name);
        }

        if (eventData.locationDetails.address) {
            locationParts.push(eventData.locationDetails.address);
        } else {
            // Build address from components
            const addressParts = [];
            if (eventData.locationDetails.city) addressParts.push(eventData.locationDetails.city);
            if (eventData.locationDetails.state) addressParts.push(eventData.locationDetails.state);
            if (eventData.locationDetails.country) addressParts.push(eventData.locationDetails.country);
            if (addressParts.length > 0) {
                locationParts.push(addressParts.join(', '));
            }
        }

        const locationValue = locationParts.join(' • ');
        const locationIcon = eventData.locationDetails.isWellKnownPlace ? '🏢' : '📍';

        fields.push({
            label: 'Location',
            value: locationValue,
            icon: locationIcon,
            isLocation: true,
            locationDetails: eventData.locationDetails
        });
    } else if (eventData.location) {
        // Fallback to simple location
        fields.push({ label: 'Location', value: eventData.location, icon: '📍' });
    }

    // Add other fields
    fields.push(
        { label: 'Meeting Link', value: eventData.meetingLink, icon: '🔗', isLink: true },
        { label: 'Description', value: eventData.description, icon: '📋' }
    );

    // Add timezone info if available
    if (eventData.timezone) {
        fields.splice(-2, 0, { label: 'Timezone', value: eventData.timezone, icon: '🌍' });
    }

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
            } else if (field.isAttendees) {
                // Handle attendees display with email links
                const attendees = eventData.attendees || [];
                let attendeesHtml = `<strong>${field.icon} ${field.label}:</strong><div class="attendees-list">`;
                
                attendees.forEach((attendee, index) => {
                    if (typeof attendee === 'object' && attendee.email) {
                        attendeesHtml += `
                            <div class="attendee-item">
                                <span class="attendee-name">${escapeHtml(attendee.name || attendee.email)}</span>
                                <a href="mailto:${escapeHtml(attendee.email)}" class="attendee-email">${escapeHtml(attendee.email)}</a>
                            </div>
                        `;
                    } else {
                        attendeesHtml += `<div class="attendee-item"><span class="attendee-name">${escapeHtml(attendee)}</span></div>`;
                    }
                });
                
                attendeesHtml += `
                    <div class="attendees-note">
                        💡 Attendees will receive calendar invites when you import this .ics file
                    </div>
                </div>`;
                fieldDiv.innerHTML = attendeesHtml;
            } else if (field.isLocation && field.locationDetails) {
                // Handle enhanced location display
                let locationHtml = `<strong>${field.icon} ${field.label}:</strong><div class="location-details">`;

                if (field.locationDetails.name) {
                    locationHtml += `<div class="location-name">${escapeHtml(field.locationDetails.name)}</div>`;
                }

                if (field.locationDetails.address) {
                    locationHtml += `<div class="location-address">📍 ${escapeHtml(field.locationDetails.address)}</div>`;
                }

                if (field.locationDetails.isWellKnownPlace) {
                    locationHtml += `<div class="location-note">✨ Well-known location</div>`;
                }

                // Add Google Maps link if we have address info
                const addressForMaps = field.locationDetails.address ||
                    [field.locationDetails.name, field.locationDetails.city, field.locationDetails.state]
                        .filter(Boolean).join(', ');

                if (addressForMaps) {
                    const mapsUrl = `https://maps.google.com/maps?q=${encodeURIComponent(addressForMaps)}`;
                    locationHtml += `<div class="location-actions">
                        <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" class="maps-link">🗺️ View on Maps</a>
                    </div>`;
                }

                locationHtml += '</div>';
                fieldDiv.innerHTML = locationHtml;
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

        // Check if the date string ends with 'Z' (UTC) or has timezone info
        const isUTC = dateString.endsWith('Z');
        const hasTimezone = dateString.includes('+') || dateString.includes('-') || dateString.endsWith('Z');

        let formatOptions = {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short'
        };

        // If the original date was in UTC, show it in user's local timezone
        // If it has no timezone info, assume it's already in the correct timezone
        if (isUTC) {
            // Don't specify timeZone, let it use user's local timezone
            return date.toLocaleString('en-US', formatOptions);
        } else if (hasTimezone) {
            // Has timezone info, let the browser handle it
            return date.toLocaleString('en-US', formatOptions);
        } else {
            // No timezone info, treat as local time
            formatOptions.timeZone = undefined;
            return date.toLocaleString('en-US', formatOptions);
        }
    } catch (error) {
        console.error('Date formatting error:', error);
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
    const handleKeyDown = function (event) {
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
window.addEventListener('online', function () {
    hideError();
});

window.addEventListener('offline', function () {
    showError('You appear to be offline. Please check your internet connection.');
});

// Enhanced functionality for new features
let currentEventData = null;

// Modal functionality
function setupModal() {
    const editBtn = document.getElementById('editBtn');
    const editModal = document.getElementById('editModal');
    const closeModal = document.getElementById('closeModal');
    const cancelEdit = document.getElementById('cancelEdit');
    const saveChanges = document.getElementById('saveChanges');

    if (editBtn) {
        editBtn.addEventListener('click', openEditModal);
    }

    if (closeModal) {
        closeModal.addEventListener('click', closeEditModal);
    }

    if (cancelEdit) {
        cancelEdit.addEventListener('click', closeEditModal);
    }

    if (saveChanges) {
        saveChanges.addEventListener('click', saveEventChanges);
    }

    // Close modal when clicking outside
    if (editModal) {
        editModal.addEventListener('click', (e) => {
            if (e.target === editModal) {
                closeEditModal();
            }
        });
    }
}

function openEditModal() {
    if (!currentEventData) return;

    const modal = document.getElementById('editModal');
    const event = currentEventData.events ? currentEventData.events[0] : currentEventData;

    // Populate form fields
    document.getElementById('editTitle').value = event.title || '';
    document.getElementById('editLocation').value = event.location || '';
    document.getElementById('editDescription').value = event.description || '';
    
    // Handle attendees
    if (event.attendees && event.attendees.length > 0) {
        const attendeeEmails = event.attendees.map(attendee => 
            typeof attendee === 'object' ? attendee.email : attendee
        ).filter(Boolean).join(', ');
        document.getElementById('editAttendees').value = attendeeEmails;
    }

    // Convert dates to local datetime format for input
    if (event.startDate) {
        const startDate = new Date(event.startDate);
        document.getElementById('editStartDate').value = formatDateForInput(startDate);
    }

    if (event.endDate) {
        const endDate = new Date(event.endDate);
        document.getElementById('editEndDate').value = formatDateForInput(endDate);
    }

    modal.style.display = 'flex';
}

function closeEditModal() {
    const modal = document.getElementById('editModal');
    modal.style.display = 'none';
}

function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function saveEventChanges() {
    // Parse attendees from textarea
    const attendeesText = document.getElementById('editAttendees').value;
    const attendees = attendeesText.split(',').map(email => {
        const trimmedEmail = email.trim();
        if (trimmedEmail && trimmedEmail.includes('@')) {
            return { email: trimmedEmail, name: trimmedEmail.split('@')[0] };
        }
        return null;
    }).filter(Boolean);

    const updatedEvent = {
        title: document.getElementById('editTitle').value,
        location: document.getElementById('editLocation').value,
        description: document.getElementById('editDescription').value,
        startDate: new Date(document.getElementById('editStartDate').value).toISOString(),
        endDate: new Date(document.getElementById('editEndDate').value).toISOString(),
        attendees: attendees
    };

    // Update current event data
    if (currentEventData.events) {
        currentEventData.events[0] = { ...currentEventData.events[0], ...updatedEvent };
    } else {
        currentEventData = { ...currentEventData, ...updatedEvent };
    }

    // Regenerate ICS content
    currentIcsContent = generateIcsFromEventData(currentEventData);

    // Refresh display
    displayEventDetails(currentEventData);

    closeEditModal();

    // Show success message
    showSuccess('✅ Event details updated successfully!');
}

function generateIcsFromEventData(eventData) {
    const event = eventData.events ? eventData.events[0] : eventData;
    const formatDate = (dateStr) => new Date(dateStr).toISOString().replace(/[-:.]/g, '').slice(0, -4) + 'Z';
    const now = new Date().toISOString().replace(/[-:.]/g, '').slice(0, -4) + 'Z';

    const icsParts = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//AiCal//Event Extractor//EN',
        'CALSCALE:GREGORIAN',
        'BEGIN:VEVENT',
        `UID:${generateUID()}@aical.com`,
        `DTSTAMP:${now}`,
        `DTSTART:${formatDate(event.startDate)}`,
        `DTEND:${formatDate(event.endDate)}`,
        `SUMMARY:${event.title || 'No Title'}`,
        `DESCRIPTION:${(event.description || '').replace(/\n/g, '\\n')}`,
        `LOCATION:${event.location || ''}`,
        'STATUS:CONFIRMED',
        'END:VEVENT',
        'END:VCALENDAR'
    ];

    return icsParts.join('\r\n');
}

function generateUID() {
    return 'xxxx-xxxx-4xxx-yxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Smart suggestions functionality
function showSmartSuggestions(eventData) {
    const suggestionsContainer = document.getElementById('smartSuggestions');
    const suggestionsList = document.getElementById('suggestionsList');

    if (!suggestionsContainer || !suggestionsList) return;

    const suggestions = generateSmartSuggestions(eventData);

    if (suggestions.length === 0) {
        suggestionsContainer.style.display = 'none';
        return;
    }

    suggestionsList.innerHTML = suggestions.map(suggestion =>
        `<div class="suggestion-item">${suggestion}</div>`
    ).join('');

    suggestionsContainer.style.display = 'block';
}

function generateSmartSuggestions(eventData) {
    const suggestions = [];
    const event = eventData.events ? eventData.events[0] : eventData;

    // Duration suggestions
    const duration = new Date(event.endDate) - new Date(event.startDate);
    const hours = duration / (1000 * 60 * 60);

    if (hours > 4) {
        suggestions.push('💡 This is a long meeting. Consider adding breaks or splitting into multiple sessions.');
    }

    if (hours < 0.25) {
        suggestions.push('⏰ This is a very short meeting. Consider if 15 minutes is enough time.');
    }

    // Time suggestions
    const startHour = new Date(event.startDate).getHours();
    if (startHour < 8 || startHour > 18) {
        suggestions.push('🕐 This meeting is outside typical business hours. Double-check the time zone.');
    }

    // Location suggestions
    if (event.location && event.location.toLowerCase().includes('zoom')) {
        suggestions.push('💻 This appears to be a video call. Consider adding the meeting link to the description.');
    }

    if (!event.location) {
        suggestions.push('📍 No location specified. Consider adding whether this is in-person or virtual.');
    }

    // Multiple events suggestion
    if (eventData.events && eventData.events.length > 1) {
        suggestions.push(`📅 Found ${eventData.events.length} events in this email. Each will be created as a separate calendar entry.`);
    }

    return suggestions;
}

// Enhanced event display for multiple events
function displayMultipleEvents(eventData) {
    if (!eventData.events || eventData.events.length <= 1) {
        return displayEventDetails(eventData);
    }

    eventDetailsDiv.innerHTML = '';

    const multipleEventsContainer = document.createElement('div');
    multipleEventsContainer.className = 'multiple-events';

    eventData.events.forEach((event, index) => {
        const eventCard = document.createElement('div');
        eventCard.className = `event-card ${index === 0 ? 'primary' : ''}`;

        const eventNumber = document.createElement('div');
        eventNumber.className = 'event-number';
        eventNumber.textContent = `Event ${index + 1}`;
        eventCard.appendChild(eventNumber);

        const eventContent = document.createElement('div');
        eventContent.innerHTML = generateEventHTML(event);
        eventCard.appendChild(eventContent);

        multipleEventsContainer.appendChild(eventCard);
    });

    eventDetailsDiv.appendChild(multipleEventsContainer);

    // Show add another button for multiple events
    const addAnotherBtn = document.getElementById('addAnotherBtn');
    if (addAnotherBtn) {
        addAnotherBtn.style.display = 'inline-block';
    }
}

function generateEventHTML(event) {
    const fields = [
        { label: 'Title', value: event.title, icon: '📝' },
        { label: 'Start Date', value: formatDate(event.startDate), icon: '📅' },
        { label: 'End Date', value: formatDate(event.endDate), icon: '📅' },
        { label: 'Location', value: event.location, icon: '📍' },
        { label: 'Description', value: event.description, icon: '📋' }
    ];

    return fields.filter(field => field.value && field.value.trim())
        .map(field => `
            <div class="event-field">
                <strong>${field.icon} ${field.label}:</strong>
                <span>${escapeHtml(field.value)}</span>
            </div>
        `).join('');
}

// Initialize new features when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    setupModal();

    // Store original displayEventDetails function
    const originalDisplayEventDetails = displayEventDetails;

    // Override displayEventDetails to handle new features
    displayEventDetails = function (eventData, warnings) {
        currentEventData = eventData;

        // Show smart suggestions
        showSmartSuggestions(eventData);

        // Handle new events array format
        if (eventData.events && eventData.events.length > 0) {
            if (eventData.events.length > 1) {
                displayMultipleEvents(eventData);
            } else {
                // Single event in new format - convert back to old format for display
                const singleEvent = eventData.events[0];
                originalDisplayEventDetails(singleEvent, warnings);
            }
        } else {
            // Old format
            originalDisplayEventDetails(eventData, warnings);
        }
    };
});