const puppeteer = require('puppeteer');
const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Apply stealth plugin to avoid detection
puppeteerExtra.use(StealthPlugin());

// Initialize readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Create output directory if it doesn't exist
const outputDir = path.join(__dirname, '../output');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Main function
async function main() {
  // Check if URL is provided
  if (process.argv.length < 3) {
    console.error('Please provide a Udemy course URL as a parameter');
    console.error('Example: npm start https://www.udemy.com/course/your-course-name');
    process.exit(1);
  }

  // Get course URL from command line argument
  let courseUrl = process.argv[2];

  // Make sure URL ends with a trailing slash
  if (!courseUrl.endsWith('/')) {
    courseUrl += '/';
  }

  console.log(`Course URL: ${courseUrl}`);

  const downloadSrt = await new Promise((resolve) => {
    rl.question('Do you want to download transcripts as .srt files with timestamps as well? (yes/no) [no]: ', (answer) => {
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === 'yes' || normalized === 'y');
    });
  });

  // Launch browser in headless mode
  console.log('Launching browser...');
  const browser = await puppeteerExtra.launch({
    headless: 'new', // Use the new headless mode
    defaultViewport: null,
    args: [
      '--window-size=1280,720',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-setuid-sandbox'
    ],
    protocolTimeout: 300000
  });

  try {
    const page = await browser.newPage();
    await page.waitForTimeout(1000);

    // Navigate to login page
    console.log('Navigating to login page...');
    let loginPageLoaded = false;
    for (let attempt = 0; attempt < 2 && !loginPageLoaded; attempt++) {
      try {
        await page.goto('https://www.udemy.com/join/passwordless-auth', { waitUntil: 'networkidle2' });
        loginPageLoaded = true;
      } catch (err) {
        if (err.message.includes('frame was detached')) {
          console.warn('Frame was detached, retrying navigation...');
          await page.waitForTimeout(1000);
        } else {
          throw err;
        }
      }
    }

    // Check if email is configured
    if (!process.env.UDEMY_EMAIL) {
      console.error('UDEMY_EMAIL not found in .env file. Please configure your credentials.');
      process.exit(1);
    }

    console.log('Processing login...');

    // Wait a few seconds before filling the email input
    await page.waitForTimeout(3000);

    // Fill in the email input
    await page.waitForSelector('input[name="email"]');
    await page.type('input[name="email"]', process.env.UDEMY_EMAIL, { delay: 100 });

    // Close the cookie bar if it exists
    try {
      // Check if cookie bar exists
      const cookieButtonExists = await page.evaluate(() => {
        return !!document.getElementById('onetrust-accept-btn-handler');
      });

      if (cookieButtonExists) {
        await page.$eval('#onetrust-accept-btn-handler', element => element.click());
        console.log('Closed cookie bar');
      }
    } catch (error) {
      console.log('Cookie bar not found or could not be closed');
    }

    // Submit the login form
    await page.$eval('[data-purpose="code-generation-form"] [type="submit"]', element => element.click());
    console.log('Email submitted, waiting for verification code...');

    // Ask user for verification code in terminal
    console.log('You have 5 minutes to enter the verification code before the program times out.');
    const verificationCode = await new Promise((resolve) => {
      rl.question('Please enter the 6-digit verification code from your email: ', (code) => {
        resolve(code.trim());
      });
    });

    // Fill in the verification code
    await page.waitForSelector('[data-purpose="otp-text-area"] input', { timeout: 60000 });
    await page.type('[data-purpose="otp-text-area"] input', verificationCode, { delay: 100 });

    // Submit the verification form
    await page.$eval('[data-purpose="otp-verification-form"] [type="submit"]', element => element.click());
    console.log('Verification submitted, completing login...');

    // Wait for redirect after successful login with a longer timeout
    await page.waitForTimeout(5000);
    console.log('Login successful!');

    // Navigate to course page
    console.log(`Navigating to course page: ${courseUrl}`);
    await page.goto(courseUrl, { waitUntil: 'networkidle2' });

    // Extract course ID
    console.log('Extracting course ID...');
    const courseId = await page.evaluate(() => {
      return document.querySelector("body#udemy").getAttribute("data-clp-course-id");
    });

    if (!courseId) {
      throw new Error('Could not retrieve course ID. Make sure you are logged in and the course URL is correct.');
    }

    console.log(`Course ID: ${courseId}`);

    // Fetch course content
    console.log('Fetching course content...');
    const apiUrl = `https://www.udemy.com/api-2.0/courses/${courseId}/subscriber-curriculum-items/?page_size=200&fields%5Blecture%5D=title,object_index,is_published,sort_order,created,asset,supplementary_assets,is_free&fields%5Bquiz%5D=title,object_index,is_published,sort_order,type&fields%5Bpractice%5D=title,object_index,is_published,sort_order&fields%5Bchapter%5D=title,object_index,is_published,sort_order&fields%5Basset%5D=title,filename,asset_type,status,time_estimation,is_external,transcript&caching_intent=True`;

    let courseJson = null;
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`Attempt ${attempt} to fetch course content...`);
      try {
        await page.goto(apiUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        await page.waitForTimeout(2000);

        const rawBody = await page.evaluate(() => document.body.innerText);

        if (rawBody.trim().startsWith('<!DOCTYPE html>')) {
          throw new Error('HTML response received instead of JSON');
        }

        courseJson = JSON.parse(rawBody);

        if (courseJson && courseJson.results) {
          break; // success
        } else {
          throw new Error('JSON parsed but no results key found');
        }
      } catch (err) {
        console.warn(`[Attempt ${attempt}] Failed to fetch course content: ${err.message}`);
        if (attempt < maxAttempts) {
          console.log('Retrying in 5 seconds...');
          await page.waitForTimeout(5000);
        } else {
          throw new Error('Could not retrieve course content. Make sure you have access to this course and try again.');
        }
      }
    }

    // Process course structure
    console.log('Processing course structure...');
    const courseStructure = processCourseStructure(courseJson.results);

    // Generate CONTENTS.txt
    console.log('Generating CONTENTS.txt...');
    generateContentsFile(courseStructure, outputDir);

    // Download transcripts
    console.log('Downloading transcripts...');
    await downloadTranscripts(browser, courseUrl, courseStructure, downloadSrt);

    console.log('All transcripts have been downloaded successfully!');
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    // Close browser
    await browser.close();
    rl.close();
  }
}

// Process course structure
function processCourseStructure(results) {
  const courseStructure = {
    chapters: [],
    lectures: []
  };

  // Sort results by sort_order (highest first, as per Udemy's order)
  const sortedResults = [...results].sort((a, b) => b.sort_order - a.sort_order);

  let currentChapter = null;
  let chapterCounter = 1;
  let lectureCounter = 1;

  sortedResults.forEach(item => {
    if (item._class === 'chapter') {
      currentChapter = {
        id: item.id,
        title: item.title,
        index: chapterCounter++,
        lectures: []
      };
      courseStructure.chapters.push(currentChapter);
      lectureCounter = 1; // Reset lecture counter for the new chapter
    } else if (item._class === 'lecture' &&
      item.asset &&
      item.asset.asset_type === 'Video') {

      const lecture = {
        id: item.id,
        title: item.title,
        created: item.created,
        timeEstimation: item.asset.time_estimation,
        chapterIndex: currentChapter ? currentChapter.index : null,
        lectureIndex: lectureCounter++
      };

      if (currentChapter) {
        currentChapter.lectures.push(lecture);
      } else {
        courseStructure.lectures.push(lecture);
      }
    }
  });

  return courseStructure;
}

// Convert Udemy lecture video time string to SRT timestamp format
function toSrtTimestamp(timeString) {
  const [min, sec] = timeString.split(':').map(Number);
  const totalSeconds = (min || 0) * 60 + (sec || 0);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')},000`;
}

// Generate CONTENTS.txt file
function generateContentsFile(courseStructure, outputDir) {
  let content = '';

  for (const chapter of courseStructure.chapters) {
    content += `${chapter.index}. ${chapter.title}\n`;

    for (const lecture of chapter.lectures) {
      const timeInMinutes = Math.floor(lecture.timeEstimation / 60);
      const date = new Date(lecture.created).toLocaleDateString();
      content += `${chapter.index}.${lecture.lectureIndex} ${lecture.title} [${timeInMinutes} min, ${date}]\n`;
    }

    content += '\n';
  }

  // Add standalone lectures (if any)
  if (courseStructure.lectures.length > 0) {
    for (const lecture of courseStructure.lectures) {
      const timeInMinutes = Math.floor(lecture.timeEstimation / 60);
      const date = new Date(lecture.created).toLocaleDateString();
      content += `${lecture.lectureIndex}. ${lecture.title} [${timeInMinutes} min, ${date}]\n`;
    }
  }

  fs.writeFileSync(path.join(outputDir, 'CONTENTS.txt'), content, 'utf8');
  console.log('CONTENTS.txt has been created successfully!');
}

// Download transcripts
async function downloadTranscripts(browser, courseUrl, courseStructure, downloadSrt) {
  const page = await browser.newPage();

  // Process chapters
  for (const chapter of courseStructure.chapters) {
    for (const lecture of chapter.lectures) {
      await processLecture(page, courseUrl, lecture, chapter, downloadSrt);
    }
  }

  // Process standalone lectures (if any)
  for (const lecture of courseStructure.lectures) {
    await processLecture(page, courseUrl, lecture, null, downloadSrt);
  }
}

// Process a single lecture
async function processLecture(page, courseUrl, lecture, chapter = null, downloadSrt = false) {
  const lectureUrl = `${courseUrl}learn/lecture/${lecture.id}`;
  const filename = chapter ?
    `${chapter.index}.${lecture.lectureIndex} ${lecture.title}` :
    `${lecture.lectureIndex}. ${lecture.title}`;

  // Sanitize filename by removing invalid characters
  const sanitizedFilename = filename.replace(/[/\\?%*:|"<>]/g, '-');

  console.log(`Processing lecture: ${sanitizedFilename}`);

  try {
    // Navigate to lecture page with a longer timeout
    await page.goto(lectureUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000 // Increase timeout to 60 seconds
    });

    // Wait for video player to load completely (looking for the video container)
    await page.waitForSelector('video', {
      timeout: 30000,
      visible: true
    }).catch(() => {
      console.log(`Note: Video player not fully loaded for lecture: ${lecture.title}, but continuing anyway`);
    });

    // Additional delay to ensure page is fully loaded
    await page.waitForTimeout(2000);

    // Try multiple approaches to find the transcript toggle button
    const transcriptButtonSelectors = [
      'button[data-purpose="transcript-toggle"]',
      '[data-purpose="transcript-toggle"]',
      'button:has-text("Transcript")',
      '.transcript-toggle', // Additional potential class name
      '[aria-label*="transcript" i]', // Any element with transcript in aria-label
      'button[aria-label*="transcript" i]' // Button with transcript in aria-label
    ];

    let transcriptButtonFound = false;

    for (const selector of transcriptButtonSelectors) {
      try {
        // Check if button exists
        const buttonExists = await page.evaluate((sel) => {
          const element = document.querySelector(sel);
          return !!element;
        }, selector);

        if (buttonExists) {
          console.log(`Found transcript button using selector: ${selector}`);

          // Use the direct JavaScript click method
          await page.$eval(selector, element => element.click());
          console.log(`Clicked transcript button using JavaScript method`);

          // Wait a moment for the click to take effect
          await page.waitForTimeout(1500);

          // Check if panel appeared
          const isPanelVisible = await page.evaluate(() => {
            const panel = document.querySelector('[data-purpose="transcript-panel"]');
            return panel && panel.offsetParent !== null;
          });

          if (isPanelVisible) {
            console.log('Transcript panel successfully opened');
            transcriptButtonFound = true;
            break;
          } else {
            console.log('Button clicked but panel did not appear, trying next selector');
          }
        }
      } catch (error) {
        console.log(`Error with selector ${selector}: ${error.message}`);
        continue;
      }
    }

    if (!transcriptButtonFound) {
      console.log(`No transcript button found/clicked successfully for lecture: ${lecture.title}. This lecture might not have a transcript.`);
      // Create a placeholder file
      fs.writeFileSync(path.join(__dirname, '../output', `${sanitizedFilename}.txt`),
        `# ${sanitizedFilename}\n\n[No transcript available or could not be accessed]`, 'utf8');
      console.log(`Created placeholder file for: ${sanitizedFilename}`);
      return;
    }

    // Additional delay to ensure transcript panel is fully loaded
    await page.waitForTimeout(1000);

    // Additional delay to ensure transcript is fully loaded
    await page.waitForTimeout(1000);

    // Extract transcript text with retry logic
    let transcriptText = '';
    let retries = 0;
    const maxRetries = 3;

    while (retries < maxRetries) {
      transcriptText = await page.evaluate(() => {
        const panel = document.querySelector('[data-purpose="transcript-panel"]');
        return panel ? panel.textContent : '';
      });

      if (transcriptText && transcriptText.trim() !== '') {
        break;
      }

      console.log(`Retry ${retries + 1}/${maxRetries} to get transcript...`);
      await page.waitForTimeout(1000);
      retries++;
    }

    if (!transcriptText || transcriptText.trim() === '') {
      console.log(`No transcript content available for lecture: ${lecture.title}`);
      return;
    }

    // Create file content
    const fileContent = `# ${sanitizedFilename}\n\n${transcriptText}`;

    // Write to file
    fs.writeFileSync(path.join(__dirname, '../output', `${sanitizedFilename}.txt`), fileContent, 'utf8');
    console.log(`Transcript saved for: ${sanitizedFilename}`);

    await page.waitForTimeout(500);

    if (downloadSrt) {
      console.log(`Generating SRT file for: ${sanitizedFilename}`);

      try {
        const cueHandles = await page.$$('[data-purpose="transcript-panel"] [data-purpose="transcript-cue"][role="button"]');
        const cueHandlesCount = cueHandles.length;
        const cues = [];

        console.log(`This will take approximately ${cueHandlesCount * 2} seconds`);

        for (let i = 0; i < cueHandles.length; i++) {
          await cueHandles[i].click();
          await page.waitForTimeout(1000);

          const start = await page.evaluate(() => {
            const timeEl = document.querySelector('[data-purpose="current-time"]');
            return timeEl ? timeEl.textContent : null;
          });

          const text = await page.evaluate((index) => {
            const cue = document.querySelectorAll('[data-purpose="transcript-panel"] [data-purpose="transcript-cue"][role="button"]')[index];
            return cue ? cue.textContent : '';
          }, i);

          cues.push({ start, text });

          console.log(`Processed caption ${i + 1}/${cueHandlesCount}: ${text.trim()}`);

          await page.waitForTimeout(1000);
        }

        // Get final end time from video duration
        const finalEnd = await page.evaluate(() => {
          const durEl = document.querySelector('[data-purpose="duration"]');
          return durEl ? durEl.textContent : null;
        });

        // Build .srt structure
        const srtData = cues.map((cue, i) => {
          const startFormatted = toSrtTimestamp(cue.start || '0:00');
          const endRaw = i < cues.length - 1 ? cues[i + 1].start : finalEnd;
          const endFormatted = toSrtTimestamp(endRaw || '0:00');
          return {
            index: i + 1,
            start: startFormatted,
            end: endFormatted,
            text: cue.text || ''
          };
        });

        // Write to .srt file
        const srtFile = path.join(__dirname, '../output', `${sanitizedFilename}.srt`);
        fs.writeFileSync(srtFile, srtData.map(c =>
          `${c.index}\n${c.start} --> ${c.end}\n${c.text.trim()}\n`
        ).join('\n'), 'utf8');

        console.log(`SRT file saved for: ${sanitizedFilename}`);
      } catch (err) {
        console.log(`Error generating SRT for ${sanitizedFilename}: ${err.message}`);
      }
    }

    // Wait briefly before moving to the next lecture to avoid overwhelming the browser
    await page.waitForTimeout(1000);
  } catch (error) {
    console.error(`Error processing lecture ${lecture.title}:`, error.message);
  }
}

// Run the main function
main().catch(err => {
  console.error('Fatal error occurred:', err.message || err);
  process.exit(1);
});