# Udemy Transcript Downloader

A NodeJS-based tool for downloading transcripts from Udemy courses. This script uses Puppeteer to navigate through Udemy's UI and extract transcripts for each lecture in a course.

## Features

- Downloads transcripts from any Udemy course you have access to
- Creates individual transcript files for each lecture
- Generates a combined transcript file with all lectures
- Scrapes and saves course content structure
- Supports email-based authentication with verification code
- Handles Cloudflare security challenges
- Runs in headless mode for better performance

## Prerequisites

- Node.js (v14 or newer)
- NPM
- A Udemy account with access to the course you want to download transcripts from

## Installation

1. Clone this repository:
   ```
   git clone https://github.com/yourusername/udemy-transcript-downloader.git
   cd udemy-transcript-downloader
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file in the root directory with your Udemy email:
   ```
   UDEMY_EMAIL=your-email@example.com
   ```

## Usage

Run the script with the URL of the Udemy course as an argument:

```
npm start "https://www.udemy.com/course/your-course-url/"
```

Or use the direct Node.js command:

```
node src/index.js "https://www.udemy.com/course/your-course-url/"
```

The script will:

1. Open a headless browser and navigate to Udemy login
2. Fill in your email from the .env file
3. Ask you to enter the 6-digit verification code from your email
4. Navigate to the course page
5. Scrape course content structure
6. Enter the course player
7. Go through each lecture and download available transcripts
8. Save individual transcript files and a combined file in the `output` directory

## Output Files

All output files are saved to the `output` directory:

- `CONTENTS.txt` - Course structure with sections and lectures
- `[Lecture Name].txt` - Individual transcript files for each lecture
- `TRANSCRIPT.txt` - Combined transcript of all lectures (created at the end)

## Troubleshooting

- **Verification Code Issues**: Make sure to enter the verification code quickly after receiving it in your email
- **Browser Crashing**: If you experience issues with headless mode, you can modify the script to use `headless: false` for debugging
- **Missing Transcripts**: Not all lectures may have transcripts. The script will create empty files for lectures without transcripts.

## License

MIT

## Disclaimer

This tool is for personal use only. Please respect Udemy's terms of service.