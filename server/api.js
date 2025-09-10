const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const os = require('os');
const archiver = require('archiver');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Store active download sessions
const downloadSessions = new Map();

// Helper function to create downloads directory
function createDownloadsDir() {
  const downloadsPath = path.join(__dirname, '..', 'output', 'udemy-transcripts');
  if (!fs.existsSync(downloadsPath)) {
    fs.mkdirSync(downloadsPath, { recursive: true });
  }
  return downloadsPath;
}

// Helper function to wait for element
async function waitForElement(page, selector, timeout = 30000) {
  try {
    await page.waitForSelector(selector, { timeout });
    return true;
  } catch (error) {
    console.log(`Element ${selector} not found within ${timeout}ms`);
    return false;
  }
}

// Helper function to handle MFA
async function handleMFA(page, mfaCode) {
  try {
    // Wait for MFA input field
    const mfaFound = await waitForElement(page, 'input[data-purpose="two-factor-authentication-code-input"]', 10000);
    
    if (mfaFound) {
      console.log('MFA required, entering code...');
      await page.type('input[data-purpose="two-factor-authentication-code-input"]', mfaCode);
      await page.click('button[data-purpose="two-factor-authentication-submit-button"]');
      
      // Wait for navigation after MFA
      await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 });
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('MFA handling error:', error);
    throw new Error('Failed to handle MFA authentication');
  }
}

// Request MFA endpoint (step 1)
app.post('/api/auth/request-mfa', async (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }
  
  // Simulate MFA request - in real implementation, this would send an actual MFA code
  res.json({ 
    success: true, 
    message: 'MFA code sent to your email' 
  });
});

// Verify MFA endpoint (step 2)
app.post('/api/auth/verify-mfa', async (req, res) => {
  const { email, mfaCode } = req.body;
  
  if (!email || !mfaCode) {
    return res.status(400).json({ error: 'Email and MFA code are required' });
  }
  
  // For demo purposes, accept any 6-digit code
  if (!/^\d{6}$/.test(mfaCode)) {
    return res.status(400).json({ error: 'Invalid MFA code format' });
  }
  
  // Generate a simple token
  const token = Buffer.from(`${email}:${Date.now()}`).toString('base64');
  
  res.json({ 
    success: true, 
    token,
    message: 'Authentication successful' 
  });
});

// Login endpoint (legacy - keeping for compatibility)
app.post('/api/login', async (req, res) => {
  const { email, mfaCode } = req.body;
  
  if (!email || !mfaCode) {
    return res.status(400).json({ error: 'Email and MFA code are required' });
  }
  
  try {
    const browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: ['--start-maximized']
    });
    
    const page = await browser.newPage();
    
    // Navigate to Udemy login
    await page.goto('https://www.udemy.com/join/login-popup/', { waitUntil: 'networkidle0' });
    
    // Fill login form
    await page.type('#id_email', email);
    await page.type('#id_password', process.env.UDEMY_PASSWORD || '');
    
    // Click login button
    await page.click('button[type="submit"]');
    
    // Wait for navigation
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 });
    
    // Handle MFA if required
    await handleMFA(page, mfaCode);
    
    // Check if login was successful
    const currentUrl = page.url();
    if (currentUrl.includes('login') || currentUrl.includes('error')) {
      await browser.close();
      return res.status(401).json({ error: 'Login failed. Please check your credentials.' });
    }
    
    // Store browser instance for this session
    const sessionId = Date.now().toString();
    downloadSessions.set(sessionId, { browser, page });
    
    res.json({ 
      success: true, 
      sessionId,
      message: 'Login successful' 
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed: ' + error.message });
  }
});

// Start download endpoint (for Dashboard component)
app.post('/api/download/start', async (req, res) => {
  const { courseUrl, email, settings } = req.body;
  
  if (!courseUrl || !email) {
    return res.status(400).json({ error: 'Course URL and email are required' });
  }
  
  try {
    const downloadId = Date.now().toString();
    
    // Store download progress
    downloadSessions.set(downloadId, {
      status: 'starting',
      progress: 0,
      courseUrl,
      email,
      settings,
      completed: false,
      error: null
    });
    
    // Start download process asynchronously
    setTimeout(() => {
      simulateDownloadProgress(downloadId);
    }, 1000);
    
    res.json({ 
      success: true, 
      downloadId,
      message: 'Download started' 
    });
    
  } catch (error) {
    console.error('Download start error:', error);
    res.status(500).json({ error: 'Failed to start download: ' + error.message });
  }
});

// Get download progress endpoint
app.get('/api/download/progress/:downloadId', (req, res) => {
  const { downloadId } = req.params;
  
  const session = downloadSessions.get(downloadId);
  if (!session) {
    return res.status(404).json({ error: 'Download session not found' });
  }
  
  res.json({
    progress: session.progress,
    status: session.status,
    completed: session.completed,
    error: session.error,
    fileCount: session.fileCount || 0
  });
});

// Simulate download progress for demo
function simulateDownloadProgress(downloadId) {
  const session = downloadSessions.get(downloadId);
  if (!session) return;
  
  let progress = 0;
  const interval = setInterval(() => {
    progress += Math.random() * 20;
    if (progress >= 100) {
      progress = 100;
      session.completed = true;
      session.status = 'Download completed successfully!';
      session.fileCount = Math.floor(Math.random() * 20) + 5;
      clearInterval(interval);
    }
    
    session.progress = Math.min(progress, 100);
    session.status = progress < 100 ? `Downloading... ${Math.floor(progress)}%` : 'Download completed successfully!';
    downloadSessions.set(downloadId, session);
  }, 1000);
}

// Download transcripts endpoint (legacy)
app.post('/api/download', async (req, res) => {
  const { sessionId, courseUrl } = req.body;
  
  if (!sessionId || !courseUrl) {
    return res.status(400).json({ error: 'Session ID and course URL are required' });
  }
  
  const session = downloadSessions.get(sessionId);
  if (!session) {
    return res.status(401).json({ error: 'Invalid session. Please login again.' });
  }
  
  try {
    const { page } = session;
    const downloadId = Date.now().toString();
    
    // Navigate to course
    await page.goto(courseUrl, { waitUntil: 'networkidle0' });
    
    // Get course title
    const courseTitle = await page.$eval('h1[data-purpose="course-header-title"]', el => el.textContent.trim())
      .catch(() => 'Unknown Course');
    
    // Create course directory
    const downloadsPath = createDownloadsDir();
    const courseDir = path.join(downloadsPath, courseTitle.replace(/[^a-zA-Z0-9]/g, '_'));
    if (!fs.existsSync(courseDir)) {
      fs.mkdirSync(courseDir, { recursive: true });
    }
    
    // Get all lecture links
    const lectureLinks = await page.$$eval('a[data-purpose="curriculum-item-link"]', links => 
      links.map(link => ({
        title: link.querySelector('span[data-purpose="item-title"]')?.textContent?.trim() || 'Untitled',
        url: link.href
      }))
    );
    
    if (lectureLinks.length === 0) {
      return res.status(404).json({ error: 'No lectures found in this course' });
    }
    
    // Store download progress
    const downloadProgress = {
      id: downloadId,
      total: lectureLinks.length,
      completed: 0,
      status: 'downloading',
      courseTitle,
      courseDir
    };
    
    downloadSessions.set(sessionId, { 
      ...session, 
      downloadProgress 
    });
    
    // Start downloading transcripts asynchronously
    downloadTranscripts(sessionId, lectureLinks, courseDir);
    
    res.json({ 
      success: true, 
      downloadId,
      total: lectureLinks.length,
      courseTitle
    });
    
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Download failed: ' + error.message });
  }
});

// Download progress endpoint
app.get('/api/progress/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = downloadSessions.get(sessionId);
  
  if (!session || !session.downloadProgress) {
    return res.status(404).json({ error: 'Download session not found' });
  }
  
  res.json(session.downloadProgress);
});

// Logout endpoint
app.post('/api/logout', async (req, res) => {
  const { sessionId } = req.body;
  
  if (sessionId && downloadSessions.has(sessionId)) {
    const session = downloadSessions.get(sessionId);
    if (session.browser) {
      await session.browser.close();
    }
    downloadSessions.delete(sessionId);
  }
  
  res.json({ success: true });
});

// Function to download transcripts
async function downloadTranscripts(sessionId, lectureLinks, courseDir) {
  const session = downloadSessions.get(sessionId);
  if (!session) return;
  
  const { page } = session;
  
  for (let i = 0; i < lectureLinks.length; i++) {
    try {
      const lecture = lectureLinks[i];
      
      // Navigate to lecture
      await page.goto(lecture.url, { waitUntil: 'networkidle0' });
      
      // Wait for transcript button
      const transcriptFound = await waitForElement(page, 'button[data-purpose="transcript-toggle"]', 10000);
      
      if (transcriptFound) {
        // Click transcript button
        await page.click('button[data-purpose="transcript-toggle"]');
        
        // Wait for transcript content
        await waitForElement(page, '[data-purpose="transcript-content"]', 5000);
        
        // Extract transcript text
        const transcriptText = await page.$eval('[data-purpose="transcript-content"]', el => {
          const paragraphs = el.querySelectorAll('p');
          return Array.from(paragraphs).map(p => p.textContent.trim()).join('\n\n');
        }).catch(() => 'Transcript not available');
        
        // Save transcript to file
        const filename = `${i + 1}_${lecture.title.replace(/[^a-zA-Z0-9]/g, '_')}.txt`;
        const filepath = path.join(courseDir, filename);
        fs.writeFileSync(filepath, transcriptText, 'utf8');
        
        console.log(`Downloaded: ${lecture.title}`);
      } else {
        console.log(`No transcript available for: ${lecture.title}`);
      }
      
      // Update progress
      session.downloadProgress.completed = i + 1;
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`Error downloading ${lectureLinks[i].title}:`, error);
    }
  }
  
  // Mark as completed
  session.downloadProgress.status = 'completed';
  console.log('All transcripts downloaded successfully!');
}

// Download all transcripts as ZIP endpoint
app.get('/api/download/zip/:downloadId', async (req, res) => {
  const { downloadId } = req.params;
  
  try {
    const downloadsPath = createDownloadsDir();
    
    // Check if downloads directory exists and has content
    if (!fs.existsSync(downloadsPath)) {
      return res.status(404).json({ error: 'No downloads found' });
    }
    
    const subdirs = fs.readdirSync(downloadsPath).filter(item => {
      const itemPath = path.join(downloadsPath, item);
      return fs.statSync(itemPath).isDirectory();
    });
    
    if (subdirs.length === 0) {
      return res.status(404).json({ error: 'No course downloads found' });
    }
    
    // Set response headers for ZIP download
    const zipFileName = `udemy-transcripts-${downloadId || Date.now()}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);
    
    // Create ZIP archive
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });
    
    // Handle archive errors
    archive.on('error', (err) => {
      console.error('Archive error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to create ZIP archive' });
      }
    });
    
    // Pipe archive to response
    archive.pipe(res);
    
    // Add all course directories to the archive
    for (const subdir of subdirs) {
      const subdirPath = path.join(downloadsPath, subdir);
      archive.directory(subdirPath, subdir);
    }
    
    // Finalize the archive
    await archive.finalize();
    
    console.log(`ZIP archive created successfully: ${zipFileName}`);
    
  } catch (error) {
    console.error('ZIP download error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to create ZIP download: ' + error.message });
    }
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;