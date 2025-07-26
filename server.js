require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const pdfParse = require('pdf-parse');

const app = express();
const PORT = process.env.PORT || 3443;

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 100 : 10, // Higher limit for development
  message: 'Too many requests from this IP, please try again later.',
});

app.use(limiter);

// CORS configuration
app.use(cors({
  origin: process.env.FRONTEND_URL || 'https://localhost:3443',
  credentials: true,
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Multer configuration for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.eml', '.msg', '.txt', '.html'];
    const fileExt = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(fileExt)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, EML, MSG, TXT, and HTML files are allowed.'));
    }
  }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint for monitoring
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Input validation middleware
const validateEmailInput = [
  body('emailContent')
    .isLength({ min: 10, max: 50000 })
    .withMessage('Email content must be between 10 and 50000 characters')
    .escape()
    .trim(),
  body('htmlContent')
    .optional()
    .isLength({ max: 100000 })
    .withMessage('HTML content too large'),
  body('inputType')
    .optional()
    .isIn(['rich', 'plain', 'file'])
    .withMessage('Invalid input type'),
];

// Function to extract meeting links as fallback
function extractMeetingLinks(emailContent) {
  const linkPatterns = [
    /https?:\/\/[\w-]+\.zoom\.us\/[^\s<>"']*/gi,
    /https?:\/\/[\w-]+\.zoom\.com\/[^\s<>"']*/gi,
    /https?:\/\/teams\.microsoft\.com\/[^\s<>"']*/gi,
    /https?:\/\/teams\.live\.com\/[^\s<>"']*/gi,
    /https?:\/\/[\w-]+\.webex\.com\/[^\s<>"']*/gi,
    /https?:\/\/meet\.google\.com\/[^\s<>"']*/gi,
    /https?:\/\/[\w-]+\.gotomeeting\.com\/[^\s<>"']*/gi,
    /https?:\/\/[\w-]+\.bluejeans\.com\/[^\s<>"']*/gi,
    // More general patterns for meeting links
    /https?:\/\/[^\s<>"']*(?:meeting|join|conference|call|hearing)[^\s<>"']*/gi,
    /https?:\/\/[^\s<>"']*teams[^\s<>"']*/gi
  ];
  
  const foundLinks = [];
  
  // First try specific patterns
  linkPatterns.forEach(pattern => {
    const matches = emailContent.match(pattern);
    if (matches) {
      foundLinks.push(...matches);
    }
  });
  
  // If no links found, try to extract from HTML href attributes
  if (foundLinks.length === 0) {
    const hrefPattern = /href\s*=\s*["']([^"']*(?:teams|zoom|webex|meet|meeting|join|conference|call|hearing)[^"']*)["']/gi;
    let match;
    while ((match = hrefPattern.exec(emailContent)) !== null) {
      foundLinks.push(match[1]);
    }
  }
  
  // If still no links but we see "Click Here to Join" or similar, indicate there should be a link
  if (foundLinks.length === 0) {
    const joinTextPattern = /(click\s+here\s+to\s+join|join\s+the\s+hearing|join\s+meeting)/gi;
    if (joinTextPattern.test(emailContent)) {
      return "MEETING_LINK_PRESENT_BUT_NOT_EXTRACTED";
    }
  }
  
  // Return the first found link, or null if none
  return foundLinks.length > 0 ? foundLinks[0] : null;
}

// Function to ensure dates are 2025 or later
function correctEventYear(eventData, originalEmail) {
  const warnings = [];
  const currentYear = new Date().getFullYear();
  const minimumYear = Math.max(2025, currentYear);
  
  try {
    const startDate = new Date(eventData.startDate);
    const endDate = new Date(eventData.endDate);
    
    // Check if year needs correction
    if (startDate.getFullYear() < minimumYear) {
      console.log(`🔧 YEAR CORRECTION: Event year ${startDate.getFullYear()} -> ${minimumYear}`);
      
      // Correct start date year
      startDate.setFullYear(minimumYear);
      eventData.startDate = startDate.toISOString();
      
      // Correct end date year to match
      endDate.setFullYear(minimumYear);
      eventData.endDate = endDate.toISOString();
      
      warnings.push(`✅ Year automatically corrected to ${minimumYear} (ensuring future dates).`);
      return { corrected: true, warnings };
    }
    
    return { corrected: false, warnings: [] };
  } catch (error) {
    console.error('Year correction error:', error);
    return { corrected: false, warnings: [] };
  }
}

// Function to validate extracted date logic
function validateEventData(eventData, originalEmail) {
  const warnings = [];
  
  try {
    const startDate = new Date(eventData.startDate);
    const endDate = new Date(eventData.endDate);
    const now = new Date();
    const currentYear = new Date().getFullYear();
    const minimumYear = Math.max(2025, currentYear);
    
    // Check if date is before minimum year (should be caught by correction, but double-check)
    if (startDate.getFullYear() < minimumYear) {
      warnings.push(`⚠️ Event year (${startDate.getFullYear()}) is before ${minimumYear}. Please verify the year.`);
    }
    
    // Check if date is in the past (but be more lenient for current year events)
    if (startDate < now && startDate.getFullYear() <= currentYear) {
      const daysDiff = Math.ceil((now - startDate) / (1000 * 60 * 60 * 24));
      if (daysDiff > 7) {
        warnings.push(`Event date appears to be ${daysDiff} days in the past. Please verify the date.`);
      }
    }
    
    // Check if date is too far in the future (more than 2 years)
    const twoYearsFromNow = new Date();
    twoYearsFromNow.setFullYear(now.getFullYear() + 2);
    if (startDate > twoYearsFromNow) {
      warnings.push(`Event date is more than 2 years in the future. Please verify the year.`);
    }
    
    // Check for time parsing issues with better regex
    const timeRegex = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/gi;
    const matches = [...originalEmail.matchAll(timeRegex)];
    
    if (matches.length > 0) {
      const match = matches[0];
      const emailTimeFound = match[0];
      const emailHour = parseInt(match[1]);
      const emailMinute = match[2] ? parseInt(match[2]) : 0;
      const emailIsPM = match[3].toLowerCase().includes('p');
      
      const extractedHour = startDate.getHours();
      const extractedMinute = startDate.getMinutes();
      
      // Convert email time to 24-hour format
      let expectedHour = emailHour;
      if (emailIsPM && emailHour !== 12) {
        expectedHour = emailHour + 12;
      } else if (!emailIsPM && emailHour === 12) {
        expectedHour = 0;
      }
      
      // Check if extracted time matches expected time
      if (extractedHour !== expectedHour || Math.abs(extractedMinute - emailMinute) > 5) {
        const extractedTime = startDate.toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true 
        });
        warnings.push(`🚨 MAJOR TIME ERROR: Email shows "${emailTimeFound}" but extracted time is "${extractedTime}". Expected: ${expectedHour}:${emailMinute.toString().padStart(2,'0')}, got: ${extractedHour}:${extractedMinute.toString().padStart(2,'0')}.`);
      }
    }

    // Check day of week consistency if mentioned in email
    const emailLower = originalEmail.toLowerCase();
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const extractedDayIndex = startDate.getDay();
    const extractedDayName = dayNames[extractedDayIndex];
    
    for (const dayName of dayNames) {
      if (emailLower.includes(dayName) && dayName !== extractedDayName) {
        warnings.push(`Email mentions "${dayName}" but extracted date falls on ${extractedDayName}. Please verify the date.`);
        break;
      }
    }
    
    // Check if end date is before start date
    if (endDate <= startDate) {
      warnings.push(`End time appears to be before or same as start time. Please verify.`);
    }
    
  } catch (error) {
    warnings.push(`Date format validation failed. Please verify the extracted dates.`);
  }
  
  return warnings;
}

// Function to generate ICS file content
function generateICSContent(eventData) {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  
  // Format dates for ICS
  const formatICSDate = (dateStr) => {
    if (!dateStr) return timestamp;
    try {
      const date = new Date(dateStr);
      return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    } catch {
      return timestamp;
    }
  };

  const startDate = formatICSDate(eventData.startDate);
  const endDate = formatICSDate(eventData.endDate);
  const uid = uuidv4();

  // Build description with meeting link if present
  let description = eventData.description || '';
  if (eventData.meetingLink) {
    if (description) {
      description += '\\n\\n';
    }
    description += `Join Meeting: ${eventData.meetingLink}`;
  }

  return `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Email Calendar Extractor//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
BEGIN:VEVENT
UID:${uid}@email-calendar-extractor.com
DTSTART:${startDate}
DTEND:${endDate}
SUMMARY:${eventData.title || 'Extracted Event'}
DESCRIPTION:${description}
LOCATION:${eventData.location || ''}
STATUS:CONFIRMED
SEQUENCE:0
CREATED:${timestamp}
LAST-MODIFIED:${timestamp}
END:VEVENT
END:VCALENDAR`;
}

// API endpoint to handle file uploads and text extraction
app.post('/api/upload-file', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const file = req.file;
    const fileExt = path.extname(file.originalname).toLowerCase();
    let extractedText = '';

    console.log(`Processing file: ${file.originalname} (${fileExt})`);

    switch (fileExt) {
      case '.pdf':
        try {
          const pdfData = await pdfParse(file.buffer);
          extractedText = pdfData.text;
          console.log(`Extracted ${extractedText.length} characters from PDF`);
        } catch (pdfError) {
          console.error('PDF parsing error:', pdfError);
          return res.status(400).json({ 
            error: 'Failed to parse PDF file',
            message: 'The PDF file may be corrupted, password-protected, or contain only images. Please try a text-based PDF or use plain text mode.'
          });
        }
        break;
      
      case '.txt':
      case '.html':
      case '.eml':
      case '.msg':
        extractedText = file.buffer.toString('utf8');
        break;
      
      default:
        return res.status(400).json({ error: 'Unsupported file type' });
    }

    // Basic validation
    if (!extractedText || extractedText.trim().length < 10) {
      return res.status(400).json({ 
        error: 'No readable text found in file',
        message: 'The file appears to be empty or contains no extractable text. Please check the file and try again.'
      });
    }

    if (extractedText.length > 50000) {
      extractedText = extractedText.substring(0, 50000) + '\n\n[Content truncated to 50,000 characters]';
    }

    res.json({
      success: true,
      filename: file.originalname,
      fileType: fileExt,
      textLength: extractedText.length,
      extractedText: extractedText
    });

  } catch (error) {
    console.error('File upload error:', error);
    res.status(500).json({ 
      error: 'Failed to process file',
      message: error.message 
    });
  }
});

// API endpoint to extract calendar event from email content
app.post('/api/extract-event', validateEmailInput, async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        error: 'Invalid input', 
        details: errors.array() 
      });
    }

    const { emailContent, htmlContent, inputType } = req.body;

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ 
        error: 'OpenAI API key not configured' 
      });
    }

    // Function to truncate content to stay within token limits
    function truncateContent(content, maxLength = 6000) {
      if (content.length <= maxLength) return content;
      return content.substring(0, maxLength) + '\n\n[Content truncated for processing...]';
    }

    // Function to clean HTML content for AI processing
    function cleanHtmlContent(html) {
      if (!html) return '';
      
      // Remove script and style tags
      let cleaned = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
      cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
      
      // Remove excessive whitespace and newlines
      cleaned = cleaned.replace(/\s+/g, ' ');
      cleaned = cleaned.replace(/\n\s*\n/g, '\n');
      
      return cleaned.trim();
    }

    // Prepare optimized content for AI
    let contentForAI = emailContent;
    
    if (htmlContent && htmlContent.trim() && inputType === 'rich') {
      const cleanedHtml = cleanHtmlContent(htmlContent);
      
      // If HTML is significantly different from plain text, include both but truncated
      if (cleanedHtml.length > emailContent.length * 1.2) {
        const truncatedHtml = truncateContent(cleanedHtml, 2500);
        const truncatedText = truncateContent(emailContent, 2500);
        contentForAI = `HTML Content:\n${truncatedHtml}\n\nText Content:\n${truncatedText}`;
      } else {
        // If HTML and text are similar, just use the longer one
        contentForAI = cleanedHtml.length > emailContent.length ? cleanedHtml : emailContent;
      }
    }
    
    // Final truncation to ensure we stay within limits
    contentForAI = truncateContent(contentForAI, 5000);

    // Call OpenAI to extract calendar event information
    const completion = await openai.chat.completions.create({
      model: "gpt-4o", // Best accuracy for calendar extraction
      messages: [
        {
          role: "system",
          content: `Extract calendar event from email text. Return JSON only.

YEAR RULES - CRITICAL:
- ALWAYS use 2025 or later for event dates
- If year is ambiguous or missing, default to 2025
- If year appears to be in the past (2024 or earlier), assume it's 2025
- Future events should have realistic years (2025-2030 range)

TIME RULES - FOLLOW EXACTLY:
10:00am = hour 10 (morning)
10:00pm = hour 22 (evening) 
1:00pm = hour 13 (afternoon)
1:00am = hour 1 (night)
12:00pm = hour 12 (noon)
12:00am = hour 0 (midnight)

EXAMPLES:
"December 18, 2025 at 10:00am" = "2025-12-18T10:00:00.000Z"
"July 31, 2025 at 01:00 PM" = "2025-07-31T13:00:00.000Z"
"Monday, March 15th at 2pm" = "2025-03-15T14:00:00.000Z" (assume 2025)

MEETING LINKS:
- Look for actual URLs containing: teams, zoom, webex, meet, conference
- If you see "Click Here to Join" but no actual URL, set meetingLink to "MEETING_LINK_PRESENT_BUT_NOT_EXTRACTED"

Return ONLY this JSON (no markdown, no explanation):
{
  "title": "event title",
  "startDate": "YYYY-MM-DDTHH:MM:SS.000Z",
  "endDate": "YYYY-MM-DDTHH:MM:SS.000Z",
  "location": "location",
  "description": "description", 
  "meetingLink": null,
  "hasEvent": true
}`
        },
        {
          role: "user",
          content: contentForAI
        }
      ],
      temperature: 0.1,
      max_tokens: 1000,
    });

    // Clean and parse the AI response
    let responseContent = completion.choices[0].message.content.trim();
    
    // Remove markdown code blocks if present
    if (responseContent.startsWith('```json')) {
      responseContent = responseContent.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (responseContent.startsWith('```')) {
      responseContent = responseContent.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    
    let eventData;
    try {
      eventData = JSON.parse(responseContent);
    } catch (parseError) {
      console.error('JSON Parse Error:', parseError);
      console.error('Raw AI Response:', completion.choices[0].message.content);
      return res.status(500).json({
        error: 'AI response format error',
        message: 'The AI returned an invalid response format. Please try again or use shorter content.'
      });
    }

    if (!eventData.hasEvent) {
      return res.status(400).json({ 
        error: 'No calendar event information found in the email content' 
      });
    }

    // Fallback: If AI didn't extract a meeting link, try to find one manually
    if (!eventData.meetingLink || eventData.meetingLink === 'null' || eventData.meetingLink === null) {
      const extractedLink = extractMeetingLinks(emailContent);
      if (extractedLink) {
        eventData.meetingLink = extractedLink;
      } else {
        // Force check for meeting indicators in content
        if (emailContent.toLowerCase().includes('click here to join') || 
            emailContent.toLowerCase().includes('join the hearing') ||
            emailContent.toLowerCase().includes('teams') ||
            emailContent.toLowerCase().includes('zoom') ||
            emailContent.toLowerCase().includes('virtual hearing')) {
          eventData.meetingLink = "MEETING_LINK_PRESENT_BUT_NOT_EXTRACTED";
        }
      }
    }

    // SERVER-SIDE TIME CORRECTION - Fix AI mistakes
    function correctTimeExtraction(eventData, emailContent) {
      const timeRegex = /(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/gi;
      const matches = [...emailContent.matchAll(timeRegex)];
      
      if (matches.length > 0) {
        const match = matches[0];
        const emailHour = parseInt(match[1]);
        const emailMinute = match[2] ? parseInt(match[2]) : 0;
        const emailIsPM = match[3].toLowerCase().includes('p');
        
        // Convert to 24-hour format
        let correctHour = emailHour;
        if (emailIsPM && emailHour !== 12) {
          correctHour = emailHour + 12;
        } else if (!emailIsPM && emailHour === 12) {
          correctHour = 0;
        }
        
        // Check if AI got it wrong
        const aiDate = new Date(eventData.startDate);
        const aiHour = aiDate.getHours();
        
        if (aiHour !== correctHour) {
          console.log(`🔧 CORRECTING TIME: AI extracted ${aiHour}:00, email shows ${correctHour}:${emailMinute.toString().padStart(2,'0')}`);
          
          // Fix the start date
          aiDate.setHours(correctHour, emailMinute, 0, 0);
          eventData.startDate = aiDate.toISOString();
          
          // Fix the end date (add 1 hour)
          const endDate = new Date(aiDate);
          endDate.setHours(correctHour + 1, emailMinute, 0, 0);
          eventData.endDate = endDate.toISOString();
          
          return true; // Correction made
        }
      }
      return false; // No correction needed
    }
    
    // Apply time correction
    const timeCorrected = correctTimeExtraction(eventData, emailContent);
    
    // Apply year correction (ensure 2025 or later)
    const yearCorrection = correctEventYear(eventData, emailContent);
    
    // Validate the extracted event data
    const warnings = validateEventData(eventData, emailContent);
    
    // Add correction warnings
    if (timeCorrected) {
      warnings.unshift('✅ Time was automatically corrected based on email content.');
    }
    
    if (yearCorrection.corrected) {
      warnings.unshift(...yearCorrection.warnings);
    }
    
    // Debug logging for extractions
    console.log('DEBUG - Original email excerpt:', emailContent.substring(0, 500));
    console.log('DEBUG - AI extracted start date:', eventData.startDate);
    console.log('DEBUG - Time corrected:', timeCorrected);
    console.log('DEBUG - Year corrected:', yearCorrection.corrected);
    console.log('DEBUG - Validation warnings:', warnings);

    // Generate ICS file content
    const icsContent = generateICSContent(eventData);

    // Return the event data and ICS content
    res.json({
      success: true,
      eventData,
      icsContent,
      warnings: warnings.length > 0 ? warnings : null,
      downloadUrl: '/api/download-ics'
    });

  } catch (error) {
    console.error('Error extracting event:', error);
    
    // Handle specific OpenAI errors
    if (error.status === 429) {
      if (error.error?.code === 'rate_limit_exceeded') {
        return res.status(429).json({ 
          error: 'OpenAI rate limit exceeded. Please try again in a few moments.',
          message: 'The request was too large or you have reached the rate limit. Try shortening your email content or wait a moment before trying again.'
        });
      }
    }
    
    if (error.status === 400 && error.error?.type === 'invalid_request_error') {
      return res.status(400).json({ 
        error: 'Email content too large',
        message: 'The email content is too long to process. Please try with a shorter email or use plain text mode.'
      });
    }
    
    // Generic error handling
    res.status(500).json({ 
      error: 'Failed to extract calendar event',
      message: error.message || 'An unexpected error occurred while processing your email.'
    });
  }
});

// API endpoint to download ICS file
app.post('/api/download-ics', (req, res) => {
  try {
    const { icsContent } = req.body;
    
    if (!icsContent) {
      return res.status(400).json({ error: 'No ICS content provided' });
    }

    res.setHeader('Content-Type', 'text/calendar');
    res.setHeader('Content-Disposition', 'attachment; filename="event.ics"');
    res.send(icsContent);

  } catch (error) {
    console.error('Error downloading ICS:', error);
    res.status(500).json({ error: 'Failed to download ICS file' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((error, req, res, next) => {
  // Handle multer errors
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        error: 'File too large',
        message: 'File size must be less than 10MB. Please try a smaller file.'
      });
    }
    return res.status(400).json({ 
      error: 'File upload error',
      message: error.message 
    });
  }
  
  // Handle file filter errors
  if (error.message.includes('Invalid file type')) {
    return res.status(400).json({ 
      error: 'Invalid file type',
      message: error.message 
    });
  }
  
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Server setup
function startServer() {
  // Check if we're on Render or other cloud platforms
  const isCloudPlatform = process.env.RENDER || process.env.HEROKU || process.env.VERCEL || process.env.NODE_ENV === 'production';
  
  if (isCloudPlatform) {
    // On cloud platforms, use HTTP as they handle SSL termination
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'production'}`);
      console.log(`✅ Ready to accept requests`);
    });
  } else {
    // For local development, try HTTPS first, fallback to HTTP
    try {
      const privateKey = fs.readFileSync('./certs/key.pem', 'utf8');
      const certificate = fs.readFileSync('./certs/cert.pem', 'utf8');
      
      const credentials = { key: privateKey, cert: certificate };
      const httpsServer = https.createServer(credentials, app);
      
      httpsServer.listen(PORT, '0.0.0.0', () => {
        console.log(`🔒 HTTPS Server running on https://localhost:${PORT}`);
        console.log(`📱 Network access: https://192.168.7.239:${PORT}`);
        console.log('🛡️  Note: Using self-signed certificate for development');
      });
    } catch (error) {
      console.log('⚠️  SSL certificates not found. Run "npm run generate-certs" first');
      console.log('🔄 Falling back to HTTP for development...');
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`🌐 HTTP Server running on http://localhost:${PORT}`);
        console.log(`📱 Network access: http://192.168.7.239:${PORT}`);
        console.log('⚠️  WARNING: Running in HTTP mode - not secure for production!');
      });
    }
  }
}

startServer(); 