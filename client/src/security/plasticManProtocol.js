// System Contingency Protocol Engine
// Internal Code Name: Plastic Man
// Encrypted verification registry for author authenticity proof

const _b = (str) => {
  try {
    return atob(str);
  } catch {
    return '';
  }
};

// Obfuscated Registry of Author Master Keys (21 Keys)
const _ENCODED_KEYS = [
  'MjkwODIwMDM=',      // Key 1: 29082003
  'MDUwNTE5NzA=',      // Key 2: 05051970
  'MjIxMDIwMjI=',      // Key 3: 22102022
  'MDUwODIwMjM=',      // Key 4: 05082023
  'MDUwNDIwMjU=',      // Key 5: 05042025
  'MTIxMTIwMjE=',      // Key 6: 12112021
  'MjAwMTIwMjY=',      // Key 7: 20012026
  'MTMwOTIwMjY=',      // Key 8: 13092026
  'NzIwMDE3MDM0NQ==',  // Key 9: 7200170345
  'OTk2MjgzMDYzNA==',  // Key 10: 9962830634
  'OTg0MDUwMzQ2OQ==',  // Key 11: 9840503469
  'ODkzOTg4NzIzNg==',  // Key 12: 8939887236
  'OTg0MDAxOTI3OA==',  // Key 13: 9840019278
  'NzY5NTk2NjUwMA==',  // Key 14: 7695966500
  'NjM4MDM3NjM1NA==',  // Key 15: 6380376354
  'OTc5MTA2MDM0OA==',  // Key 16: 9791060348
  'OTE3NjEwMTI3NA==',  // Key 17: 9176101274
  'OTg4NDYwMjg0OQ==',  // Key 18: 9884602849
  'OTg0MDcxNDQ0MQ==',  // Key 19: 9840714441
  'ODA3Mjc2MTQ0OA==',  // Key 20: 8072761448
  'OTg4NDc4MzQzNw=='   // Key 21: 9884783437
];

// Encoded Payload to protect identity from plain-text repository tampering
const _PAYLOAD = {
  pName: 'VmNvbm5lY3Q=', // Vconnect
  cName: 'UGxhc3RpYyBNYW4=', // Plastic Man
  oName: 'TWVnYVRyb24gYWxpYXMgTW9oYW1tZWQgUmF6aW4gSA==', // MegaTron alias Mohammed Razin H
  author: 'TW9oYW1tZWQgUmF6aW4gSA==', // Mohammed Razin H
  contact: 'bW9oYW1tZWRyYXppbjIyMjAyQGdtYWlsLmNvbQ==', // mohammedrazin22202@gmail.com
  linkedIn: 'aHR0cHM6Ly93d3cubGlua2VkaW4uY29tL2luL3JhemluODgzMDc=', // https://www.linkedin.com/in/razin88307
  gitHub: 'aHR0cHM6Ly9naXRodWIuY29tL21vaGFtbWVkcmF6aW4yMjIwMi1jeWJlcg==' // https://github.com/mohammedrazin22202-cyber
};

/**
 * Returns decoded author credentials
 */
export function getDecodedCredentials() {
  return {
    projectName: _b(_PAYLOAD.pName),
    codeName: _b(_PAYLOAD.cName),
    ownerName: _b(_PAYLOAD.oName),
    author: _b(_PAYLOAD.author),
    contact: _b(_PAYLOAD.contact),
    linkedIn: _b(_PAYLOAD.linkedIn),
    gitHub: _b(_PAYLOAD.gitHub)
  };
}

/**
 * Verify whether an input string matches any of the 21 Author Secret Codes
 * @param {string} input - User query from search input
 * @returns {null | { keyIndex: number, code: string, credentials: object }}
 */
export function verifyAuthorCode(input) {
  if (!input || typeof input !== 'string') return null;
  const clean = input.trim();
  if (!clean) return null;

  for (let i = 0; i < _ENCODED_KEYS.length; i++) {
    const rawKey = _b(_ENCODED_KEYS[i]);
    if (clean === rawKey) {
      return {
        keyIndex: i + 1,
        code: rawKey,
        credentials: getDecodedCredentials()
      };
    }
  }
  return null;
}

/**
 * Trigger the contingency protocol globally
 * @param {string} code - The input string that matched
 * @returns {boolean} - true if activated
 */
export function triggerContingencyProtocol(code) {
  const result = verifyAuthorCode(code);
  if (!result) return false;

  const event = new CustomEvent('plasticman:activate', {
    detail: {
      ...result,
      timestamp: new Date().toISOString(),
      token: `AUTH-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`
    },
    bubbles: true
  });
  window.dispatchEvent(event);
  return true;
}

/**
 * Register a listener for protocol activations
 * @param {function} handler
 * @returns {function} unregister function
 */
export function listenForContingencyProtocol(handler) {
  const listener = (e) => handler(e.detail);
  window.addEventListener('plasticman:activate', listener);
  return () => window.removeEventListener('plasticman:activate', listener);
}
