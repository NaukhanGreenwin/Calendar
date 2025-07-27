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
const LocationEnhancer = require('./location-enhancer');
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
    this.locationEnhancer = new LocationEnhancer();
    
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

      // Handle both old and new format for logging
      const eventTitle = eventData.events ? eventData.events[0]?.title : eventData.title;
      console.log(`Successfully extracted event: "${eventTitle}"`);

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
   * Validates and normalizes a single event's date strings
   */
  validateAndNormalizeSingleEvent(eventData, userCurrentTime = null) {
    // Enhance location data with known addresses
    if (eventData.locationDetails) {
      eventData.locationDetails = this.locationEnhancer.enhanceLocation(eventData.locationDetails);
    }
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
      1.  **Date Parsing (CRITICAL):** 
          - ALWAYS look for ANY date/time information in the text
          - For "Wednesday, August 6th at 3PM" → find next August 6th that falls on Wednesday, time = 15:00
          - For "meeting Wednesday" → find next Wednesday from current date
          - For "at 3PM" → use 15:00 as time
          - For relative dates: "today", "tomorrow", "next Monday" etc.
          - If year is missing, determine correct year based on context
          - NEVER return hasEvent: false if there's ANY meeting/event mentioned
          - NEVER leave dates as null if ANY time reference exists
      2.  **Time:** Convert all times to a 24-hour format.
          - 1PM=13:00, 2PM=14:00, 3PM=15:00, etc.
          - 12AM (midnight) = 00:00. 12PM (noon) = 12:00.
      3.  **Timezone:** If a timezone is mentioned in the text, preserve it and include it in the timezone field. If no timezone is specified, assume the user's timezone (${userTimezone}). Always format dates as ISO 8601 strings with timezone info when possible.
      4.  **Attendee Extraction:**
          - Extract ALL email addresses mentioned in the email (To:, CC:, From:, in content)
          - Extract names associated with email addresses
          - Look for phrases like "invited:", "attendees:", "participants:"
          - Include the sender and recipients as attendees
          - Format as: [{"name": "John Doe", "email": "john@company.com"}, ...]
      4b. **Location Extraction with Address Intelligence (CRITICAL):**
          - ALWAYS extract location information if ANY is mentioned
          - Use your knowledge to provide full addresses for well-known places:
            * "CN Tower" → name: "CN Tower", address: "290 Bremner Blvd, Toronto, ON M5V 3L9", isWellKnownPlace: true
            * "Jack Astors" → name: "Jack Astors", address: "Multiple locations - specify if mentioned", city: "Toronto"
            * "Rogers Centre" → name: "Rogers Centre", address: "1 Blue Jays Way, Toronto, ON M5V 1J1", isWellKnownPlace: true
            * "Union Station" → name: "Union Station", address: "65 Front St W, Toronto, ON M5J 1E6", isWellKnownPlace: true
            * "Pearson Airport" → name: "Toronto Pearson Airport", address: "6301 Silver Dart Dr, Mississauga, ON L5P 1B2", isWellKnownPlace: true
            * "Eaton Centre" → name: "CF Toronto Eaton Centre", address: "220 Yonge St, Toronto, ON M5B 2H1", isWellKnownPlace: true
          - For restaurants/chains, include typical address format: "Restaurant Name, [Area/Street if mentioned]"
          - For office buildings, include full address if it's a known building
          - For conference rooms, include building name and address if mentioned
          - NEVER leave location fields empty if ANY location reference exists
      5.  **Location Intelligence:** 
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
         
      **CRITICAL DATE PARSING RULES:**
         - TODAY = ${userLocalTime.split(',')[0]} (${now.toLocaleDateString('en-US', { timeZone: userTimezone, month: 'numeric', day: 'numeric', year: 'numeric' })})
         - TOMORROW = ${new Date(now.getTime() + 24*60*60*1000).toLocaleDateString('en-US', { timeZone: userTimezone, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
         - When you see "Wednesday, August 6th" - find the next occurrence of that date from today
         - When you see "3PM" or "at 3PM" - convert to 15:00 in 24-hour format
         - ALWAYS extract dates and times even if they seem incomplete
         - If only a day is mentioned (like "Wednesday"), find the next Wednesday from today
         - If only a time is mentioned (like "3PM"), use today's date with that time
         
      **IMPORTANT:** NEVER return "Not specified" for dates if ANY date/time information exists in the text!

      **Examples:**
      Location:
      - "Meeting at Google HQ" → name: "Google Headquarters", address: "1600 Amphitheatre Parkway, Mountain View, CA", isWellKnownPlace: true
      - "Conference Room B, Building 2" → name: "Conference Room B, Building 2", address: null, isWellKnownPlace: false
      - "Starbucks on 5th Avenue" → name: "Starbucks", city: "New York", isWellKnownPlace: false
      - "Central Park" → name: "Central Park", address: "New York, NY 10024", isWellKnownPlace: true
      
      Date Examples (CRITICAL):
      - "meeting Wednesday, August 6th at 3PM" → find next August 6th that's a Wednesday, set time to 15:00
      - "tomorrow at 2 PM" → exactly 1 day from current date at 14:00
      - "DashQ Meeting" with "Wednesday, August 6th at 3PM" → title: "DashQ Meeting", date: next Aug 6th Wednesday at 15:00
      - ALWAYS extract the meeting title/subject from the email
      - NEVER return hasEvent: false if meeting details are mentioned
      
      Return ONLY the JSON object, nothing else.

      JSON FORMAT (CRITICAL - MUST FOLLOW EXACTLY):
      {
        "hasEvent": true,
        "events": [
          {
            "title": "DashQ Meeting (REQUIRED - extract from subject/content)",
            "startDate": "2025-08-06T15:00:00.000Z (REQUIRED - Wednesday Aug 6th at 3PM)",
            "endDate": "2025-08-06T16:00:00.000Z (REQUIRED - 1 hour after start if not specified)",
            "location": "string | null",
            "locationDetails": {
              "name": "string | null",
              "address": "string | null", 
              "city": "string | null",
              "state": "string | null",
              "country": "string | null",
              "isWellKnownPlace": false
            },
            "description": "Review platform and have key personnel on the call",
            "timezone": "${userTimezone}",
            "attendees": [
              {"name": "Nauman Khan", "email": "NKhan@greenwin.ca"},
              {"name": "Elizabeth Giannitelli", "email": "EGiannitelli@greenwin.ca"},
              {"name": "Neda Omidi", "email": "nomidi@greenwin.ca"}
            ],
            "meetingType": "video-call",
            "isRecurring": false,
            "recurrencePattern": null
          }
        ]
      }
      
      CRITICAL REQUIREMENTS:
      - ALWAYS set hasEvent: true if ANY meeting is mentioned
      - ALWAYS extract title from subject line or content
      - ALWAYS calculate proper dates from "Wednesday, August 6th at 3PM"
      - NEVER leave title, startDate, or endDate as null/undefined
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
      console.log('AI Response:', responseJson); // Debug logging
      
      const parsedData = JSON.parse(responseJson);
      console.log('Parsed Data:', parsedData); // Debug logging
      
      // Validate and normalize dates if event was found
      if (parsedData.hasEvent) {
        // Handle both single event and multiple events format
        if (parsedData.events && Array.isArray(parsedData.events)) {
          // Multiple events format
          parsedData.events = parsedData.events.map(event => 
            this.validateAndNormalizeSingleEvent(event, userCurrentTime)
          );
        } else {
          // Legacy single event format - convert to new format
          const singleEvent = this.validateAndNormalizeSingleEvent(parsedData, userCurrentTime);
          parsedData = {
            hasEvent: true,
            events: [singleEvent]
          };
        }
        
        // Additional validation for relative date accuracy
        if (userCurrentTime) {
          const warnings = this.validateRelativeDates(content, parsedData, userCurrentTime);
          if (warnings.length > 0) {
            parsedData.warnings = warnings;
          }
        }
        
        return parsedData;
      } else {
        // Check if AI incorrectly said no event when there clearly is one
        const hasEventKeywords = /meeting|appointment|call|conference|event|schedule|invite/i.test(content);
        if (hasEventKeywords) {
          console.warn('AI said no event but content contains meeting keywords. Forcing re-analysis...');
          // Could implement retry logic here
        }
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

    const now = new Date().toISOString().replace(/[-:.]/g, '').slice(0, -4) + 'Z';
    
    // Handle both single event and multiple events
    const events = eventData.events || [eventData];
    
    const icsParts = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//AiCal//Event Extractor//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:REQUEST',
      'X-WR-CALNAME:Calendar Invitation',
      'X-WR-TIMEZONE:UTC'
    ];

    // Add each event
    events.forEach(event => {
      const { startDate, endDate, title, description, location, locationDetails, timezone, attendees } = event;
      
      // Build comprehensive location string for ICS
      let icsLocation = location || '';
      console.log('Event location data:', { location, locationDetails }); // Debug logging
      
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
      
      console.log('Final ICS location:', icsLocation); // Debug logging

      // Properly escape ICS location field
      const escapedLocation = icsLocation
        .replace(/\\/g, '\\\\')  // Escape backslashes
        .replace(/;/g, '\\;')    // Escape semicolons
        .replace(/,/g, '\\,')    // Escape commas
        .replace(/\n/g, '\\n')   // Escape newlines
        .replace(/\r/g, '\\r');  // Escape carriage returns

      console.log('Escaped ICS location:', escapedLocation); // Debug logging

      // Function to fold long lines according to ICS specification
      const foldLine = (line) => {
        if (line.length <= 75) return line;
        let folded = line.substring(0, 75);
        let remaining = line.substring(75);
        while (remaining.length > 0) {
          folded += '\r\n ' + remaining.substring(0, 74);
          remaining = remaining.substring(74);
        }
        return folded;
      };

      const locationLine = foldLine(`LOCATION:${escapedLocation}`);

      icsParts.push(
        'BEGIN:VEVENT',
        `UID:${uuidv4()}@aical.com`,
        `DTSTAMP:${now}`,
        `DTSTART:${formatDate(startDate)}`,
        `DTEND:${formatDate(endDate)}`,
        `SUMMARY:${title || 'No Title'}`,
        `DESCRIPTION:${(description || '').replace(/\n/g, '\\n')}`,
        locationLine,
        'STATUS:CONFIRMED',
        'SEQUENCE:0',
        'TRANSP:OPAQUE'
      );

      // Add organizer (first attendee or default)
      if (attendees && attendees.length > 0 && attendees[0].email) {
        const organizer = attendees[0];
        const organizerName = organizer.name ? organizer.name : organizer.email.split('@')[0];
        icsParts.push(`ORGANIZER;CN="${organizerName}":mailto:${organizer.email}`);
      }

      // Add attendees if available
      if (attendees && Array.isArray(attendees)) {
        attendees.forEach(attendee => {
          if (attendee.email) {
            const attendeeName = attendee.name ? attendee.name : attendee.email.split('@')[0];
            // Properly format attendee line with quotes around name
            icsParts.push(`ATTENDEE;CN="${attendeeName}";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${attendee.email}`);
          }
        });
      }

      // Add timezone information as a comment if available
      if (timezone) {
        icsParts.splice(-1, 0, `X-ORIGINAL-TIMEZONE:${timezone}`);
      }

      icsParts.push('END:VEVENT');
    });

    icsParts.push('END:VCALENDAR');

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
        
        httpsServer.listen(this.port, '0.0.0.0', () => {
          console.log(`🔒 HTTPS Server running on https://localhost:${this.port}`);
          console.log(`📱 Network access: https://192.168.7.239:${this.port}`);
          console.log(`🌐 Access from iPhone: https://192.168.7.239:${this.port}`);
        });
        return;

      } catch (err) {
        console.log('⚠️ Could not find SSL certs, falling back to HTTP. For HTTPS, run: npm run generate-certs');
      }
    }

    // In production or if HTTPS setup fails, use HTTP
    this.app.listen(this.port, '0.0.0.0', () => {
      console.log(`🚀 HTTP Server running on http://localhost:${this.port}`);
      console.log(`📱 Network access: http://192.168.7.239:${this.port}`);
      console.log(`🌐 Access from iPhone: http://192.168.7.239:${this.port}`);
    });
  }
}

// Create and start the service
const calendarService = new CalendarService();
calendarService.start(); 