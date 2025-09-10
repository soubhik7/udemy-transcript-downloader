import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from './LoadingSpinner';
import './Dashboard.css';

const Dashboard = () => {
  const [courseUrl, setCourseUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const [downloadHistory, setDownloadHistory] = useState([]);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState({
    downloadSrt: false,
    preferredLanguage: 'en_US',
    tabCount: 5
  });
  const navigate = useNavigate();

  useEffect(() => {
    // Check if user is authenticated
    const authToken = sessionStorage.getItem('authToken');
    if (!authToken) {
      navigate('/');
      return;
    }

    // Load download history from localStorage
    const savedHistory = localStorage.getItem('downloadHistory');
    if (savedHistory) {
      setDownloadHistory(JSON.parse(savedHistory));
    }
  }, [navigate]);

  const validateCourseUrl = (url) => {
    const udemyRegex = /^https:\/\/(www\.)?udemy\.com\/course\/[\w-]+\/?/;
    const linkedinRegex = /^https:\/\/(www\.)?linkedin\.com\/learning\/[\w-]+/;
    return udemyRegex.test(url) || linkedinRegex.test(url);
  };

  const handleUrlChange = (e) => {
    setCourseUrl(e.target.value);
    if (error) setError('');
  };

  const handleSettingsChange = (setting, value) => {
    setSettings(prev => ({
      ...prev,
      [setting]: value
    }));
  };

  const handleStartDownload = async () => {
    if (!courseUrl.trim()) {
      setError('Please enter a course URL');
      return;
    }

    if (!validateCourseUrl(courseUrl)) {
      setError('Please enter a valid Udemy or LinkedIn Learning course URL');
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setStatus('Initializing download...');
    setError('');

    try {
      const authToken = sessionStorage.getItem('authToken');
      const userEmail = sessionStorage.getItem('userEmail');

      const response = await fetch('http://localhost:3001/api/download/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({
          courseUrl,
          email: userEmail,
          settings
        })
      });

      if (!response.ok) {
        throw new Error('Failed to start download');
      }

      const { downloadId } = await response.json();
      
      // Start polling for progress
      pollDownloadProgress(downloadId);

    } catch (err) {
      setError(err.message || 'Failed to start download');
      setIsProcessing(false);
    }
  };

  const handleZipDownload = async () => {
    try {
      const authToken = sessionStorage.getItem('authToken');
      const downloadId = Date.now(); // Use timestamp as download ID
      
      setStatus('Preparing ZIP download...');
      
      const response = await fetch(`http://localhost:3001/api/download/zip/${downloadId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create ZIP download');
      }
      
      // Get the filename from response headers
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `udemy-transcripts-${downloadId}.zip`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      
      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      setStatus('ZIP download completed successfully!');
      
    } catch (err) {
      setError(err.message || 'Failed to download ZIP file');
      console.error('ZIP download error:', err);
    }
  };

  const pollDownloadProgress = async (downloadId) => {
    const authToken = sessionStorage.getItem('authToken');
    
    const poll = async () => {
      try {
        const response = await fetch(`http://localhost:3001/api/download/progress/${downloadId}`, {
          headers: {
            'Authorization': `Bearer ${authToken}`
          }
        });

        if (response.ok) {
          const data = await response.json();
          setProgress(data.progress);
          setStatus(data.status);

          if (data.completed) {
            setIsProcessing(false);
            
            // Add to download history
            const newDownload = {
              id: downloadId,
              url: courseUrl,
              timestamp: new Date().toISOString(),
              status: 'completed',
              fileCount: data.fileCount || 0
            };
            
            const updatedHistory = [newDownload, ...downloadHistory.slice(0, 9)];
            setDownloadHistory(updatedHistory);
            localStorage.setItem('downloadHistory', JSON.stringify(updatedHistory));
            
            setStatus('Download completed successfully!');
            setCourseUrl('');
          } else if (data.error) {
            setError(data.error);
            setIsProcessing(false);
          } else {
            // Continue polling
            setTimeout(poll, 2000);
          }
        }
      } catch (err) {
        setError('Failed to get download progress');
        setIsProcessing(false);
      }
    };

    poll();
  };

  const handleLogout = () => {
    sessionStorage.removeItem('authToken');
    sessionStorage.removeItem('userEmail');
    navigate('/');
  };

  const formatTimestamp = (timestamp) => {
    return new Date(timestamp).toLocaleString();
  };

  const userEmail = sessionStorage.getItem('userEmail');

  return (
    <div className="dashboard fade-in">
      <div className="dashboard-header">
        <div className="user-info">
          <span className="user-email">👤 {userEmail}</span>
          <button onClick={handleLogout} className="logout-button">
            Logout
          </button>
        </div>
      </div>

      <div className="dashboard-content">
        <div className="main-panel">
          <div className="download-section">
            <h2>Download Course Transcripts</h2>
            <p className="section-description">
              Enter a Udemy or LinkedIn Learning course URL to download all available transcripts
            </p>

            <div className="url-input-section">
              <div className="form-group">
                <label htmlFor="courseUrl" className="form-label">
                  Course URL
                </label>
                <input
                  type="url"
                  id="courseUrl"
                  value={courseUrl}
                  onChange={handleUrlChange}
                  className={`form-input ${error ? 'error' : ''}`}
                  placeholder="https://www.udemy.com/course/your-course-name"
                  disabled={isProcessing}
                />
              </div>

              {error && (
                <div className="error-message slide-in">
                  <span className="error-icon">⚠️</span>
                  {error}
                </div>
              )}

              <button
                onClick={handleStartDownload}
                className="download-button"
                disabled={isProcessing || !courseUrl.trim()}
              >
                {isProcessing ? (
                  <>
                    <LoadingSpinner size="small" color="white" />
                    Processing...
                  </>
                ) : (
                  <>
                    📥 Start Download
                  </>
                )}
              </button>
              
              <button
                onClick={handleZipDownload}
                className="zip-download-button"
                disabled={isProcessing}
                title="Download all previously downloaded transcripts as a ZIP file"
              >
                📦 Download All as ZIP
              </button>
            </div>

            {isProcessing && (
              <div className="progress-section slide-in">
                <div className="progress-info">
                  <span className="progress-status">{status}</span>
                  <span className="progress-percentage">{progress}%</span>
                </div>
                <div className="progress-bar">
                  <div 
                    className="progress-fill" 
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>

          <div className="settings-section">
            <h3>Download Settings</h3>
            
            <div className="settings-grid">
              <div className="setting-item">
                <label className="setting-label">
                  <input
                    type="checkbox"
                    checked={settings.downloadSrt}
                    onChange={(e) => handleSettingsChange('downloadSrt', e.target.checked)}
                    disabled={isProcessing}
                  />
                  <span className="checkmark"></span>
                  Download SRT files with timestamps
                </label>
              </div>

              <div className="setting-item">
                <label className="setting-label-text">
                  Preferred Language
                </label>
                <select
                  value={settings.preferredLanguage}
                  onChange={(e) => handleSettingsChange('preferredLanguage', e.target.value)}
                  className="setting-select"
                  disabled={isProcessing}
                >
                  <option value="en_US">English (US)</option>
                  <option value="es_ES">Spanish (Spain)</option>
                  <option value="fr_FR">French (France)</option>
                  <option value="de_DE">German (Germany)</option>
                  <option value="pt_BR">Portuguese (Brazil)</option>
                </select>
              </div>

              <div className="setting-item">
                <label className="setting-label-text">
                  Parallel Downloads (Udemy only)
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={settings.tabCount}
                  onChange={(e) => handleSettingsChange('tabCount', parseInt(e.target.value))}
                  className="setting-input"
                  disabled={isProcessing}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="sidebar">
          <div className="history-section">
            <h3>Recent Downloads</h3>
            {downloadHistory.length === 0 ? (
              <p className="no-history">No downloads yet</p>
            ) : (
              <div className="history-list">
                {downloadHistory.map((download) => (
                  <div key={download.id} className="history-item">
                    <div className="history-url">
                      {download.url.split('/').pop() || 'Unknown Course'}
                    </div>
                    <div className="history-meta">
                      <span className="history-date">
                        {formatTimestamp(download.timestamp)}
                      </span>
                      <span className="history-files">
                        {download.fileCount} files
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;