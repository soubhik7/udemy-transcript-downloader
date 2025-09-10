import React from 'react';
import './LoadingSpinner.css';

const LoadingSpinner = ({ size = 'medium', color = 'accent' }) => {
  return (
    <div className={`loading-spinner loading-spinner--${size} loading-spinner--${color}`}>
      <div className="loading-spinner__circle"></div>
      <div className="loading-spinner__circle"></div>
      <div className="loading-spinner__circle"></div>
    </div>
  );
};

export default LoadingSpinner;