# 📅 AI Calendar Event Extractor

Extract calendar events from email content using AI and generate downloadable `.ics` files.

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment:**
   Create a `.env` file with your OpenAI API key:
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   ```

3. **Generate SSL certificates (optional):**
   ```bash
   npm run generate-certs
   ```

4. **Start the server:**
   ```bash
   npm start
   ```

5. **Open your browser:**
   - Local: `https://localhost:7860`
   - Network: `https://[your-ip]:7860`

## Features

- AI-powered email parsing using GPT-4o
- Secure HTTPS with self-signed certificates
- Generates standard `.ics` calendar files
- Clean, modern web interface
- Rate limiting and input validation

## Usage

1. Paste your email content
2. Click "Generate Calendar Event"
3. Download the `.ics` file
4. Import into your calendar app

That's it! 🎉 