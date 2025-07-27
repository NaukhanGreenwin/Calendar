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
// const GeocodingService = require('./geocoding-service'); // Uncomment to enable geocoding

// Load environment variables from .env file
require('dotenv').config();

/**
 * A service to extract calendar events from text using AI.
 */
class CalendarService {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 7860;
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  /**
   * Configures all Express middleware.
   */
  initializeMiddleware() {
    // Basic security with Helmet
    this.app.use(helmet());

    // Rate limiting to prevent abuse
    this.app.use(rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100,
      message: { error: 'Too many requests, please try again later.' },
    }));

    // CORS for frontend communication
    this.app.use(cors({
      origin: process.env.FRONTEND_URL || `https://localhost:${this.port}`,
      credentials: true,
    }));

    // Parsers for JSON and URL-encoded bodies
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Serve static files from the 'public' directory
    this.app.use(express.static(path.join(__dirname, 'public')));
  }

  /**
   * Sets up all API routes.
   */
  initializeRoutes() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
    });

    // Endpoint to extract event details from content
    this.app.post(
      '/api/extract-event',
      this.validateRequest(),
      this.handleEventExtraction.bind(this)
    );

    // Endpoint to download the generated ICS file
    this.app.post('/api/download-ics', this.handleIcsDownload.bind(this));
  }

  /**
   * Centralized error handling middleware.
   */
  initializeErrorHandling() {
    this.app.use((err, req, res, next) => {
      console.error('Unhandled Error:', err);
      res.status(500).json({ error: 'An internal server error occurred.' });
    });

    // 404 handler for unknown routes
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Endpoint not found.' });
    });
  }

  /**
   * Provides validation rules for the request body.
   */
  validateRequest() {
    return [
      body('emailContent')
        .isLength({ min: 10, max: 25000 })
        .withMessage('Content must be between 10 and 25,000 characters.')
        .trim(),
    ];
  }

  /**
   * Handles the logic for the /api/extract-event endpoint.
   */
  async handleEventExtraction(req, res) {
    // Return validation errors if any
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    // Check for OpenAI API key
    if (!this.openai.apiKey) {
      console.error('OpenAI API key is not configured.');
      return res.status(500).json({ error: 'Service is not configured.' });
    }

    try {
      const { emailContent, userTimezone, userCurrentTime } = req.body;
      
      // Use AI to parse the content
      const eventData = await this.parseContentWithAI(emailContent, userTimezone, userCurrentTime);
      
      if (!eventData || !eventData.hasEvent) {
        return res.status(400).json({ error: 'No calendar event could be found in the provided content.' });
      }

      // Generate the .ics file content
      const icsContent = this.generateIcsContent(eventData);

      console.log(`Successfully extracted event: "${eventData.title}"`);

      // Send the successful response
      res.status(200).json({
        success: true,
        eventData,
        icsContent,
      });

    } catch (error) {
      console.error('Failed to extract event:', error);
      res.status(500).json({ error: 'Failed to extract calendar event due to an internal error.' });
    }
  }

  /**
   * Validates relative date interpretations
   */
  validateRelativeDates(originalContent, eventData, userCurrentTime) {
    const warnings = [];
    const content = originalContent.toLowerCase();
    const userNow = new Date(userCurrentTime.iso);
    const eventStart = new Date(eventData.startDate);
    
    // Check for "tomorrow" keyword
    if (content.includes('tomorrow')) {
      const expectedTomorrow = new Date(userNow.getTime() + 24*60*60*1000);
      const eventDate = new Date(eventStart.toDateString());
      const tomorrowDate = new Date(expectedTomorrow.toDateString());
      
      if (eventDate.getTime() !== tomorrowDate.getTime()) {
        const expectedDay = expectedTomorrow.toLocaleDateString('en-US', { 
          timeZone: userCurrentTime.timezone || 'UTC',
          weekday: 'long', 
          month: 'long', 
          day: 'numeric' 
        });
        warnings.push(`You mentioned "tomorrow" but the extracted date is ${eventStart.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}. Tomorrow should be ${expectedDay}.`);
      }
    }
    
    // Check for "today" keyword
    if (content.includes('today')) {
      const eventDate = new Date(eventStart.toDateString());
      const todayDate = new Date(userNow.toDateString());
      
      if (eventDate.getTime() !== todayDate.getTime()) {
        warnings.push(`You mentioned "today" but the extracted date doesn't match today's date.`);
      }
    }
    
    return warnings;
  }

  /**
   * Validates and normalizes date strings from AI response
   */
  validateAndNormalizeDates(eventData, userCurrentTime = null) {
    if (!eventData.startDate || !eventData.endDate) {
      throw new Error('Missing required date information');
    }

    try {
      const startDate = new Date(eventData.startDate);
      const endDate = new Date(eventData.endDate);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        throw new Error('Invalid date format received from AI');
      }

      if (endDate <= startDate) {
        throw new Error('End date must be after start date');
      }

      // Use browser's current time if available, otherwise server time
      const now = userCurrentTime ? new Date(userCurrentTime.iso) : new Date();
      const oneMinuteFromNow = new Date(now.getTime() + 60000);
      
      if (startDate < oneMinuteFromNow) {
        console.warn('Event start date is in the past, this might be incorrect');
      }

      // Normalize to ISO strings
      eventData.startDate = startDate.toISOString();
      eventData.endDate = endDate.toISOString();

      return eventData;
    } catch (error) {
      throw new Error(`Date validation failed: ${error.message}`);
    }
  }

  /**
   * Sends content to OpenAI for parsing.
   */
  async parseContentWithAI(content, userTimezone = 'UTC', userCurrentTime = null) {
    // Use browser's current time if provided, otherwise fall back to server time
    let now, userLocalTime;
    
    if (userCurrentTime) {
      now = new Date(userCurrentTime.iso);
      userLocalTime = userCurrentTime.local;
    } else {
      now = new Date();
      userLocalTime = userTimezone !== 'UTC' ? 
        now.toLocaleString('en-US', { timeZone: userTimezone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }) :
        now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }

    const systemPrompt = `
      You are an expert assistant for extracting calendar event details from text.
      Analyze the text and return a valid JSON object with the event details.

      CRITICAL RULES:
      1.  **Date Parsing:** 
          - For absolute dates (e.g., "July 28", "7/28"), use the date as specified
          - For relative dates, calculate from the user's current date/time:
            * "today" = current date shown above
            * "tomorrow" = exactly 1 day from current date
            * "day after tomorrow" = exactly 2 days from current date
            * "next Monday" = the next occurrence of Monday from current date
          - If the year is missing, use current year unless the date has already passed, then use next year
      2.  **Time:** Convert all times to a 24-hour format.
          - 1PM=13:00, 2PM=14:00, 3PM=15:00, etc.
          - 12AM (midnight) = 00:00. 12PM (noon) = 12:00.
      3.  **Timezone:** If a timezone is mentioned in the text, preserve it and include it in the timezone field. If no timezone is specified, assume the user's timezone (${userTimezone}). Always format dates as ISO 8601 strings with timezone info when possible.
      4.  **Location Intelligence:** 
          - Extract venue names, business names, or place names mentioned in the text
          - If you recognize well-known places (Google HQ, Apple Park, Harvard University, Central Park, etc.), provide their common address
          - Parse any address components mentioned (street, city, state, zip)
          - For conference rooms or internal locations, include building/company context
          - Mark isWellKnownPlace as true for famous landmarks, major companies, universities, etc.
      5.  **End Time:** If no end time or duration is specified, create an event that is exactly 1 hour long.
      6.  **No Event:** If no event is found, return hasEvent: false.
      7.  **Current Date Context:** 
         - UTC: ${now.toISOString().split('T')[0]} (${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })})
         - User's local time (${userTimezone}): ${userLocalTime}
         
      **CRITICAL RELATIVE DATE RULES:**
         - TODAY = ${userLocalTime.split(',')[0]} (${now.toLocaleDateString('en-US', { timeZone: userTimezone, month: 'numeric', day: 'numeric', year: 'numeric' })})
         - TOMORROW = ${new Date(now.getTime() + 24*60*60*1000).toLocaleDateString('en-US', { timeZone: userTimezone, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
         - DAY AFTER TOMORROW = ${new Date(now.getTime() + 48*60*60*1000).toLocaleDateString('en-US', { timeZone: userTimezone, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
         
      **IMPORTANT:** When you see "tomorrow" in the text, it MUST be ${new Date(now.getTime() + 24*60*60*1000).toLocaleDateString('en-US', { timeZone: userTimezone, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}, NOT any other day!

      **Examples:**
      Location:
      - "Meeting at Google HQ" → name: "Google Headquarters", address: "1600 Amphitheatre Parkway, Mountain View, CA", isWellKnownPlace: true
      - "Conference Room B, Building 2" → name: "Conference Room B, Building 2", address: null, isWellKnownPlace: false
      - "Starbucks on 5th Avenue" → name: "Starbucks", city: "New York", isWellKnownPlace: false
      - "Central Park" → name: "Central Park", address: "New York, NY 10024", isWellKnownPlace: true
      
      Relative Dates (CRITICAL):
      - If today is Saturday July 26, 2025 and text says "tomorrow at 2 PM" → startDate should be Sunday July 27, 2025 at 2 PM
      - If today is Saturday July 26, 2025 and text says "meeting Saj tomorrow" → startDate should be Sunday July 27, 2025
      - NEVER interpret "tomorrow" as anything other than exactly 1 day from the current date
      
      Return ONLY the JSON object, nothing else.

      JSON FORMAT:
      {
        "title": "string",
        "startDate": "YYYY-MM-DDTHH:MM:SS.000Z (ISO 8601 with timezone)",
        "endDate": "YYYY-MM-DDTHH:MM:SS.000Z (ISO 8601 with timezone)",
        "location": "string | null",
        "locationDetails": {
          "name": "string | null (venue/business name)",
          "address": "string | null (full address if mentioned or can be inferred)",
          "city": "string | null",
          "state": "string | null",
          "country": "string | null",
          "isWellKnownPlace": "boolean (true for famous landmarks, major companies, universities, etc.)"
        },
        "description": "string | null",
        "hasEvent": boolean,
        "timezone": "string | null (detected or assumed timezone like '${userTimezone}', 'EST', 'PST', etc.)"
      }
    `;

    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
        max_tokens: 1000,
      });

      const responseJson = completion.choices[0].message.content;
      const parsedData = JSON.parse(responseJson);
      
      // Validate and normalize dates if event was found
      if (parsedData.hasEvent) {
        const validatedData = this.validateAndNormalizeDates(parsedData, userCurrentTime);
        
        // Additional validation for relative date accuracy
        if (userCurrentTime) {
          const warnings = this.validateRelativeDates(content, validatedData, userCurrentTime);
          if (warnings.length > 0) {
            validatedData.warnings = warnings;
          }
        }
        
        return validatedData;
      }
      
      return parsedData;

    } catch (error) {
      console.error('OpenAI API call failed:', error);
      throw new Error('AI parsing failed.');
    }
  }

  /**
   * Generates the content for a .ics file.
   */
  generateIcsContent(eventData) {
    const formatDate = (dateStr) => {
      const date = new Date(dateStr);
      // Always convert to UTC for ICS files for consistency
      return date.toISOString().replace(/[-:.]/g, '').slice(0, -4) + 'Z';
    };

    const { startDate, endDate, title, description, location, locationDetails, timezone } = eventData;
    
    // Build comprehensive location string for ICS
    let icsLocation = location || '';
    if (locationDetails) {
      const locationParts = [];
      if (locationDetails.name) locationParts.push(locationDetails.name);
      if (locationDetails.address) {
        locationParts.push(locationDetails.address);
      } else {
        // Build address from components
        const addressParts = [];
        if (locationDetails.city) addressParts.push(locationDetails.city);
        if (locationDetails.state) addressParts.push(locationDetails.state);
        if (locationDetails.country) addressParts.push(locationDetails.country);
        if (addressParts.length > 0) {
          locationParts.push(addressParts.join(', '));
        }
      }
      icsLocation = locationParts.join(', ') || icsLocation;
    }
    const now = new Date().toISOString().replace(/[-:.]/g, '').slice(0, -4) + 'Z';

    const icsParts = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//AiCal//Event Extractor//EN',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:${uuidv4()}@aical.com`,
      `DTSTAMP:${now}`,
      `DTSTART:${formatDate(startDate)}`,
      `DTEND:${formatDate(endDate)}`,
      `SUMMARY:${title || 'No Title'}`,
      `DESCRIPTION:${(description || '').replace(/\n/g, '\\n')}`,
      `LOCATION:${icsLocation}`,
      'STATUS:CONFIRMED'
    ];

    // Add timezone information as a comment if available
    if (timezone) {
      icsParts.splice(-1, 0, `X-ORIGINAL-TIMEZONE:${timezone}`);
    }

    icsParts.push('END:VEVENT', 'END:VCALENDAR');

    return icsParts.join('\r\n');
  }

  /**
   * Handles the request to download the .ics file.
   */
  handleIcsDownload(req, res) {
    const { icsContent } = req.body;
    if (!icsContent) {
      return res.status(400).json({ error: 'No ICS content provided.' });
    }

    res.setHeader('Content-Type', 'text/calendar');
    res.setHeader('Content-Disposition', 'attachment; filename="event.ics"');
    res.send(icsContent);
  }
  
  /**
   * Starts the Express server.
   */
  start() {
    const isProduction = process.env.NODE_ENV === 'production';

    // In development, try to use HTTPS with self-signed certs
    if (!isProduction) {
      try {
        const privateKey = fs.readFileSync('./certs/key.pem', 'utf8');
        const certificate = fs.readFileSync('./certs/cert.pem', 'utf8');
        const httpsServer = https.createServer({ key: privateKey, cert: certificate }, this.app);
        
        httpsServer.listen(this.port, () => {
          console.log(`🔒 HTTPS Server running on https://localhost:${this.port}`);
        });
        return;

      } catch (err) {
        console.log('⚠️ Could not find SSL certs, falling back to HTTP. For HTTPS, run: npm run generate-certs');
      }
    }

    // In production or if HTTPS setup fails, use HTTP
    this.app.listen(this.port, () => {
      console.log(`🚀 HTTP Server running on http://localhost:${this.port}`);
    });
  }
}

// Create and start the service
const calendarService = new CalendarService();
calendarService.start(); 