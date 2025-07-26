# 📅 Email Calendar Extractor

A secure HTTPS web application that uses OpenAI's GPT-4 to extract calendar event information from email content and generate downloadable `.ics` calendar files.

## 🌐 **Live Demo**

Your app is currently running and accessible at:
- **💻 Local Access**: `https://localhost:3443`
- **📱 Network Access**: `https://192.168.7.239:3443` (perfect for mobile devices)

Now deployed to: **[GitHub Repository](https://github.com/NaukhanGreenwin/Calendar.git)**

## ✨ Features

- **AI-Powered Extraction**: Uses OpenAI's GPT-4 to intelligently parse email content and extract calendar events
- **Secure HTTPS**: All communications encrypted with SSL/TLS
- **Input Validation**: Server-side sanitization and validation of all user inputs
- **Rate Limiting**: Protection against abuse with configurable rate limits
- **Modern UI**: Clean, responsive interface that works on all devices
- **ICS File Generation**: Standards-compliant calendar files compatible with all major calendar applications
- **Privacy Focused**: No permanent storage of user data

## 🛡️ Security Features

- **HTTPS Only**: Enforced SSL/TLS encryption
- **Input Sanitization**: All user inputs are validated and sanitized
- **Rate Limiting**: 10 requests per 15 minutes per IP address
- **CORS Protection**: Configured cross-origin resource sharing
- **Helmet.js Security**: Additional security headers and protections
- **No Data Persistence**: Email content is not stored on the server

## 🚀 Quick Start

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- OpenAI API key
- OpenSSL (for generating development certificates)

### Installation

1. **Clone or download the project files**

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp config.env.template .env
   ```
   
   Edit `.env` and add your OpenAI API key:
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   ```

4. **Generate SSL certificates for development**
   ```bash
   npm run generate-certs
   ```

5. **Start the server**
   ```bash
   npm start
   ```
   
   For development with auto-reload:
   ```bash
   npm run dev
   ```

6. **Access the application**
   - Open your browser to `https://localhost:3443`
   - You may see a security warning for the self-signed certificate - this is normal for development

## 📖 Usage

1. **Paste Email Content**: Copy and paste the body of an email containing event information into the text area
2. **Extract Event**: Click the "Generate Calendar Event" button to process the content
3. **Review Details**: The extracted event information will be displayed
4. **Download ICS**: Click the download button to get your `.ics` calendar file
5. **Import to Calendar**: Open the downloaded file with your preferred calendar application

### Supported Input Types

The application accepts multiple input formats:

#### **📧 Rich Content (HTML/Images)**
- Paste directly from email clients (Outlook, Gmail, Apple Mail)
- Preserves formatting, links, and embedded images
- Best for modern email content

#### **📝 Plain Text**
- Simple text input for basic emails
- Fastest processing method
- Good for large content

#### **📎 File Upload**
- **.pdf** - PDF documents (great for printed emails or email attachments)
- **.eml** - Email files from most email clients
- **.msg** - Outlook email files
- **.txt** - Plain text files
- **.html** - HTML email files

### Example Content

The application works best with emails containing:
- Meeting invitations
- Event announcements with dates and times
- Conference or webinar details
- Appointment confirmations
- PDF documents with event information

```
Subject: Team Meeting Tomorrow

Hi everyone,

We have our weekly team meeting scheduled for:

Date: March 15, 2024
Time: 2:00 PM - 3:30 PM PST
Location: Conference Room A, 123 Main St, San Francisco, CA
Meeting ID: 123-456-789

Agenda:
- Project updates
- Q2 planning
- New feature discussions

Please join on time.

Thanks!
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | Your OpenAI API key (required) | - |
| `PORT` | Server port | 3443 |
| `NODE_ENV` | Environment (development/production) | development |
| `FRONTEND_URL` | Frontend URL for CORS | https://localhost:3443 |
| `SSL_PRIVATE_KEY` | Path to SSL private key (production) | - |
| `SSL_CERTIFICATE` | Path to SSL certificate (production) | - |
| `SSL_CA` | Path to SSL CA bundle (production) | - |

### Rate Limiting

The application includes rate limiting to prevent abuse:
- **Window**: 15 minutes
- **Limit**: 10 requests per IP address
- **Response**: HTTP 429 when limit exceeded

## 🏗️ Production Deployment

### 1. SSL Certificates

For production, replace the self-signed certificates with proper SSL certificates:

```bash
# Let's Encrypt example
sudo certbot --nginx -d yourdomain.com
```

Update your `.env` file with the certificate paths:
```
SSL_PRIVATE_KEY=/etc/letsencrypt/live/yourdomain.com/privkey.pem
SSL_CERTIFICATE=/etc/letsencrypt/live/yourdomain.com/fullchain.pem
```

### 2. Environment Setup

```bash
export NODE_ENV=production
export OPENAI_API_KEY=your_production_api_key
export PORT=443
```

### 3. Process Management

Use a process manager like PM2:

```bash
npm install -g pm2
pm2 start server.js --name email-calendar-extractor
pm2 startup
pm2 save
```

### 4. Reverse Proxy (Optional)

Use nginx as a reverse proxy for additional security and performance:

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name yourdomain.com;
    
    ssl_certificate /path/to/certificate.pem;
    ssl_certificate_key /path/to/private-key.pem;
    
    location / {
        proxy_pass https://localhost:3443;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## 🔒 Security Considerations

### Input Validation
- All inputs are validated on both client and server side
- Character limits enforced (10-50,000 characters)
- HTML escaping prevents XSS attacks
- Express-validator used for robust validation

### Data Privacy
- Email content is processed in memory only
- No permanent storage of user data
- OpenAI API calls follow their data usage policies
- Rate limiting prevents enumeration attacks

### HTTPS/SSL
- All communications encrypted
- HSTS headers enforced
- Secure cookie settings
- CSP headers implemented

## 🐛 Troubleshooting

### Common Issues

**"OpenAI API key not configured"**
- Ensure your `.env` file contains `OPENAI_API_KEY`
- Verify the API key is valid and has sufficient credits

**"SSL certificates not found"**
- Run `npm run generate-certs` to create development certificates
- Check that the `certs/` directory exists with `key.pem` and `cert.pem`

**"No calendar event information found"**
- Ensure the email contains clear date/time information
- Try rephrasing or adding more context to the email content
- Check that the content is not too sparse or ambiguous

**Rate limiting errors**
- Wait 15 minutes before trying again
- Consider adjusting rate limits in `server.js` for development

**PDF processing issues**
- Ensure PDF contains selectable text (not just images)
- Password-protected PDFs are not supported
- Large PDFs may take longer to process
- For image-based PDFs, use OCR software first to convert to text

### Development Tips

1. **Testing with various email formats**: Try different email styles and formats
2. **Monitoring OpenAI usage**: Keep track of your API usage and costs
3. **Browser console**: Check for JavaScript errors in the browser console
4. **Server logs**: Monitor the server console for detailed error information

## 📚 API Documentation

### POST `/api/extract-event`

Extract calendar event from email content.

**Request Body:**
```json
{
  "emailContent": "string (10-50000 characters)"
}
```

**Response:**
```json
{
  "success": true,
  "eventData": {
    "title": "string",
    "startDate": "ISO 8601 date string",
    "endDate": "ISO 8601 date string",
    "location": "string",
    "description": "string",
    "hasEvent": true
  },
  "icsContent": "string",
  "downloadUrl": "/api/download-ics"
}
```

### POST `/api/download-ics`

Download ICS calendar file.

**Request Body:**
```json
{
  "icsContent": "string"
}
```

**Response:** ICS file download

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- OpenAI for providing the GPT-4 API
- Express.js community for the excellent web framework
- All contributors and users of this application

---

**Note**: This application requires an OpenAI API key and will incur costs based on usage. Please monitor your OpenAI account for billing information. 