const puppeteer = require('puppeteer');
const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

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

  // Launch browser
  console.log('Launching browser...');
  const browser = await puppeteerExtra.launch({
    headless: false,
    defaultViewport: null,
    args: ['--start-maximized']
  });

  try {
    const page = await browser.newPage();
    
    // Navigate to login page
    console.log('Navigating to login page...');
    await page.goto('https://www.udemy.com/join/passwordless-auth', { waitUntil: 'networkidle2' });
    
    // Wait for user to log in
    console.log('Please log in to Udemy...');
    await new Promise((resolve) => {
      rl.question('Press Enter or type "continue" after you have logged in: ', (answer) => {
        resolve();
      });
    });

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
    
    await page.goto(apiUrl, { waitUntil: 'networkidle2' });
    
    // Extract the JSON response
    const courseJson = await page.evaluate(() => {
      try {
        return JSON.parse(document.querySelector('body').innerText);
      } catch (e) {
        return null;
      }
    });
    
    if (!courseJson || !courseJson.results) {
      throw new Error('Could not retrieve course content. Make sure you are logged in and have access to this course.');
    }
    
    // Process course structure
    console.log('Processing course structure...');
    const courseStructure = processCourseStructure(courseJson.results);
    
    // Generate CONTENTS.txt
    console.log('Generating CONTENTS.txt...');
    generateContentsFile(courseStructure, outputDir);
    
    // Download transcripts
    console.log('Downloading transcripts...');
    await downloadTranscripts(browser, courseUrl, courseStructure);
    
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
async function downloadTranscripts(browser, courseUrl, courseStructure) {
  const page = await browser.newPage();
  
  // Process chapters
  for (const chapter of courseStructure.chapters) {
    for (const lecture of chapter.lectures) {
      await processLecture(page, courseUrl, lecture, chapter);
    }
  }
  
  // Process standalone lectures (if any)
  for (const lecture of courseStructure.lectures) {
    await processLecture(page, courseUrl, lecture);
  }
}

// Process a single lecture
async function processLecture(page, courseUrl, lecture, chapter = null) {
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
    
    // Wait briefly before moving to the next lecture to avoid overwhelming the browser
    await page.waitForTimeout(1000);
  } catch (error) {
    console.error(`Error processing lecture ${lecture.title}:`, error.message);
  }
}

// Run the main function
main();