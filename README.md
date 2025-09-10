# Course Transcript Downloader

A NodeJS-based tool for downloading transcripts from Udemy and LinkedIn Learning courses. This script uses Puppeteer to navigate through the course platforms' UI and extract transcripts for each lecture in a course.

## Features

- Downloads transcripts from any Udemy or LinkedIn Learning course you have access to
- Creates individual transcript files for each lecture
- Generates a combined transcript file with all lectures
- Optionally downloads `.srt` files with timestamps for each lecture
- Scrapes and saves course content structure
- Supports email-based authentication for Udemy and password authentication for LinkedIn Learning
- Handles Cloudflare security challenges
- Runs in headless mode for better performance
- Parallel processing of transcripts (Udemy only)

## Prerequisites

- Node.js (v14 or newer)
- NPM
- A Udemy account and/or LinkedIn Learning account with access to the courses you want to download transcripts from

## Installation

1. Clone this repository:
   ```
   git clone https://github.com/TOA-Anakin/udemy-transcript-downloader.git
   cd udemy-transcript-downloader
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file in the root directory with your credentials:
   ```
   # For Udemy courses
   UDEMY_EMAIL=your-email@example.com

   # For LinkedIn Learning courses
   LINKEDIN_EMAIL=your-email@example.com
   LINKEDIN_PASSWORD=your-password
   ```

## Usage

Run the script with the course URL as an argument:

For Udemy courses:
```
npm start "https://www.udemy.com/course/your-course-url/"
```

For LinkedIn Learning courses:
```
npm start "https://www.linkedin.com/learning/your-course-name/"
```

Or use the direct Node.js command:

```
node src/index.js "https://www.udemy.com/course/your-course-url/"
# or
node src/index.js "https://www.linkedin.com/learning/your-course-name/"
```

The script will:

1. Ask if you want to download `.srt` files (with timestamps) for each lecture
2. Ask for your preferred language for transcripts
3. For Udemy courses, ask how many tabs to use for downloading transcripts (default is 5)
   - A higher number can speed things up, but requires a good PC (enough CPU and RAM)
4. Open a headless browser and navigate to the platform's login page
5. For Udemy:
   - Fill in your email from the .env file
   - Ask you to enter the 6-digit verification code from your email
6. For LinkedIn Learning:
   - Log in with your email and password from the .env file
7. Navigate to the course page
8. Scrape course content structure
9. Enter the course player
10. Go through each lecture and download available transcripts
11. Save individual transcript files in the `output` directory

## Output Files

All output files are saved to the `output` directory:

- `CONTENTS.txt` - Course structure with sections and lectures
- `[Lecture Name].txt` - Individual transcript files for each lecture
- `[Lecture Name].srt` - Individual transcript files with timestamps in SubRip format (optional)

## Troubleshooting

- **Verification Code Issues (Udemy)**: Make sure to enter the verification code quickly after receiving it in your email
- **LinkedIn Authentication Issues**: Ensure your LinkedIn credentials in the .env file are correct
- **Browser Crashing**: If you experience issues with headless mode, you can modify the script to use `headless: false` for debugging
- **Missing Transcripts**: Not all lectures may have transcripts. The script will create empty files for lectures without transcripts.
- **SRT Errors**: If `.srt` generation fails for a lecture, try increasing timeouts or re-running the script with fewer browser tabs open.
- **Slow Transcript Downloads**: For Udemy courses, the script can download transcripts in parallel using multiple browser tabs. If your PC is slow or has limited memory, stick to a lower number of tabs (e.g. 1–3). If you have a powerful machine, you can safely use 5 or more tabs for faster processing.

## License

MIT

## Disclaimer

This tool is for personal use only. Please respect Udemy's and LinkedIn Learning's terms of service.
