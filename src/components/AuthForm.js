import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from './LoadingSpinner';
import './AuthForm.css';

const AuthForm = () => {
  const [formData, setFormData] = useState({
    email: '',
    mfaCode: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState('email'); // 'email' or 'mfa'
  const navigate = useNavigate();

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error when user starts typing
    if (error) setError('');
  };

  const validateEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const validateMfaCode = (code) => {
    // MFA codes are typically 6 digits
    const mfaRegex = /^\d{6}$/;
    return mfaRegex.test(code);
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.email.trim()) {
      setError('Please enter your email address');
      return;
    }
    
    if (!validateEmail(formData.email)) {
      setError('Please enter a valid email address');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Simulate API call to request MFA code
      const response = await fetch('http://localhost:3001/api/auth/request-mfa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: formData.email })
      });

      if (response.ok) {
        setStep('mfa');
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Failed to send verification code');
      }
    } catch (err) {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMfaSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.mfaCode.trim()) {
      setError('Please enter the verification code');
      return;
    }
    
    if (!validateMfaCode(formData.mfaCode)) {
      setError('Please enter a valid 6-digit verification code');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      // Simulate API call to verify MFA code
      const response = await fetch('http://localhost:3001/api/auth/verify-mfa', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          email: formData.email,
          mfaCode: formData.mfaCode 
        })
      });

      if (response.ok) {
        const data = await response.json();
        // Store authentication token securely
        sessionStorage.setItem('authToken', data.token);
        sessionStorage.setItem('userEmail', formData.email);
        
        // Navigate to dashboard
        navigate('/dashboard');
      } else {
        const errorData = await response.json();
        setError(errorData.message || 'Invalid verification code');
      }
    } catch (err) {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackToEmail = () => {
    setStep('email');
    setFormData(prev => ({ ...prev, mfaCode: '' }));
    setError('');
  };

  return (
    <div className="auth-form-container fade-in">
      <div className="auth-form-card">
        <div className="auth-form-header">
          <h2>Welcome to Udemy Transcript Downloader</h2>
          <p className="auth-form-subtitle">
            {step === 'email' 
              ? 'Enter your email to get started'
              : 'Enter the verification code sent to your email'
            }
          </p>
        </div>

        {step === 'email' ? (
          <form onSubmit={handleEmailSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="email" className="form-label">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                className={`form-input ${error ? 'error' : ''}`}
                placeholder="your.email@example.com"
                disabled={isLoading}
                autoComplete="email"
                autoFocus
              />
            </div>

            {error && (
              <div className="error-message slide-in">
                <span className="error-icon">⚠️</span>
                {error}
              </div>
            )}

            <button
              type="submit"
              className="submit-button"
              disabled={isLoading || !formData.email.trim()}
            >
              {isLoading ? (
                <>
                  <LoadingSpinner size="small" />
                  Sending Code...
                </>
              ) : (
                'Send Verification Code'
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleMfaSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="mfaCode" className="form-label">
                Verification Code
              </label>
              <input
                type="text"
                id="mfaCode"
                name="mfaCode"
                value={formData.mfaCode}
                onChange={handleInputChange}
                className={`form-input ${error ? 'error' : ''}`}
                placeholder="123456"
                disabled={isLoading}
                maxLength="6"
                pattern="\d{6}"
                autoComplete="one-time-code"
                autoFocus
              />
              <small className="form-help">
                Check your email for a 6-digit verification code
              </small>
            </div>

            {error && (
              <div className="error-message slide-in">
                <span className="error-icon">⚠️</span>
                {error}
              </div>
            )}

            <div className="form-actions">
              <button
                type="button"
                onClick={handleBackToEmail}
                className="back-button"
                disabled={isLoading}
              >
                ← Back
              </button>
              <button
                type="submit"
                className="submit-button"
                disabled={isLoading || !formData.mfaCode.trim()}
              >
                {isLoading ? (
                  <>
                    <LoadingSpinner size="small" />
                    Verifying...
                  </>
                ) : (
                  'Verify & Continue'
                )}
              </button>
            </div>
          </form>
        )}

        <div className="auth-form-footer">
          <p className="security-note">
            🔒 Your credentials are handled securely and never stored permanently
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthForm;