# Udemy Transcript Downloader

A NodeJS-based tool for downloading transcripts from Udemy courses. This script uses Puppeteer to navigate through Udemy's UI and extract transcripts for each lecture in a course.

## Features

- Downloads transcripts from any Udemy course you have access to
- Creates individual transcript files for each lecture
- Generates a combined transcript file with all lectures
- Scrapes and saves course content structure
- Supports both automatic and manual login
- Handles Cloudflare security challenges

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

3. Create a `.env` file in the root directory with your Udemy credentials:
   ```
   UDEMY_EMAIL=your-email@example.com
   UDEMY_PASSWORD=your-password
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

1. Open a browser window and log in to Udemy
2. Navigate to the course page
3. Scrape course content structure
4. Enter the course player
5. Go through each lecture and download available transcripts
6. Save individual transcript files and a combined file in the `output` directory

### Manual Login Option

If automatic login fails, the script will switch to manual login mode, allowing you to log in through the browser interface. Just follow the prompts in the terminal.

## Output Files

All output files are saved to the `output` directory:

- `Course content.txt` - Course structure with sections and lectures
- `[Lecture Name].txt` - Individual transcript files for each lecture
- `TRANSCRIPT.txt` - Combined transcript of all lectures

## Troubleshooting

- **Login Issues**: If automatic login doesn't work, the script will fall back to manual login. Follow the instructions in the terminal.
- **Browser Crashing**: Try running with the `--no-sandbox` flag if you're in a Docker/container environment.
- **Missing Transcripts**: Not all lectures may have transcripts. The script will create empty files for lectures without transcripts.

## License

MIT

## Disclaimer

This tool is for personal use only. Please respect Udemy's terms of service.