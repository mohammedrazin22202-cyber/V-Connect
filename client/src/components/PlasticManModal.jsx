import { useState, useEffect } from 'react';
import { listenForContingencyProtocol, getDecodedCredentials } from '../security/plasticManProtocol';
import './PlasticManModal.css';

export default function PlasticManModal() {
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const unlisten = listenForContingencyProtocol((detail) => {
      setData(detail);
      setCopied(false);
    });

    return () => unlisten();
  }, []);

  // Close on Escape key
  useEffect(() => {
    if (!data) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setData(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [data]);

  if (!data) return null;

  const credentials = data.credentials || getDecodedCredentials();

  const handleCopyProof = () => {
    const proofText = `=== CONTINGENCY PROTOCOL: PLASTIC MAN ===
Authenticity Verification Certificate
------------------------------------------
Status: ACTIVATED & VERIFIED
Real Project Name: ${credentials.projectName}
Real Owner Name: ${credentials.ownerName}
Author: ${credentials.author}
Contact: ${credentials.contact}
LinkedIn: ${credentials.linkedIn}
GitHub: ${credentials.gitHub}
Key Index: Author Master Key #${data.keyIndex} of 21 Authenticated
Timestamp: ${data.timestamp}
Verification Token: ${data.token}
------------------------------------------
Protected by Intellectual Property and Author Contingency Verification.`;

    navigator.clipboard.writeText(proofText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(console.error);
  };

  return (
    <div className="pm-overlay" role="dialog" aria-modal="true" aria-labelledby="pm-title">
      <div className="pm-container">
        <div className="pm-scanline-bar" />

        <div className="pm-content">
          {/* Header */}
          <div className="pm-header">
            <div>
              <div className="pm-badge-row">
                <span className="pm-alert-pill">
                  <span className="pm-pulsing-dot" />
                  Contingency Protocol Activated
                </span>
                <span className="pm-verified-pill">
                  ✓ Verified Original Author
                </span>
              </div>
              <h2 id="pm-title" className="pm-title">
                CODE NAME: {credentials.codeName.toUpperCase()}
              </h2>
            </div>
            <button
              className="pm-close-btn"
              onClick={() => setData(null)}
              aria-label="Close protocol modal"
            >
              ✕
            </button>
          </div>

          {/* Core Credentials Grid */}
          <div className="pm-grid">
            <div className="pm-card highlight">
              <div className="pm-card-label">Real Project Name</div>
              <div className="pm-card-value accent">{credentials.projectName}</div>
            </div>

            <div className="pm-card highlight">
              <div className="pm-card-label">Real Owner Name</div>
              <div className="pm-card-value danger">{credentials.ownerName}</div>
            </div>

            <div className="pm-card">
              <div className="pm-card-label">Original Author</div>
              <div className="pm-card-value">{credentials.author}</div>
            </div>

            <div className="pm-card">
              <div className="pm-card-label">Direct Contact</div>
              <div className="pm-card-value">
                <a href={`mailto:${credentials.contact}`} className="pm-link">
                  {credentials.contact}
                </a>
              </div>
            </div>

            <div className="pm-card">
              <div className="pm-card-label">Official LinkedIn</div>
              <div className="pm-card-value">
                <a
                  href={credentials.linkedIn}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pm-link"
                >
                  🔗 LinkedIn Profile
                </a>
              </div>
            </div>

            <div className="pm-card">
              <div className="pm-card-label">Official GitHub</div>
              <div className="pm-card-value">
                <a
                  href={credentials.gitHub}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pm-link"
                >
                  🐙 GitHub Profile
                </a>
              </div>
            </div>
          </div>

          {/* Legal / Authenticity Warning Notice */}
          <div className="pm-notice-box">
            <div className="pm-notice-text">
              <strong>Notice of Authenticity:</strong> This hidden protocol verifies that this application and codebase are the original creation and intellectual property of <strong>{credentials.ownerName}</strong>. Any unauthorized distribution, rebranding, or copyright infringement will be subject to intellectual property enforcement.
            </div>
          </div>

          {/* Meta Footer */}
          <div className="pm-meta-footer">
            <span>MASTER KEY: #{data.keyIndex.toString().padStart(2, '0')} / 21 VALIDATED</span>
            <span>TOKEN: {data.token}</span>
            <span>TIME: {new Date(data.timestamp).toLocaleTimeString()}</span>
          </div>

          {/* Action Buttons */}
          <div className="pm-actions">
            <button
              className="pm-btn pm-btn-secondary"
              onClick={() => setData(null)}
            >
              Dismiss Protocol
            </button>
            <button
              className="pm-btn pm-btn-primary"
              onClick={handleCopyProof}
            >
              {copied ? '✓ Ownership Proof Copied!' : '📋 Copy Proof of Ownership'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
