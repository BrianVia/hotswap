import { spawn } from 'child_process';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import { fromSSO } from '@aws-sdk/credential-provider-sso';
import type { AwsCredentialIdentity } from '@aws-sdk/types';
import type { AuthStatus } from '../types.js';

const SSO_CACHE_DIR = path.join(homedir(), '.aws', 'sso', 'cache');

// Cache of credential providers per profile
const credentialProviders = new Map<string, () => Promise<AwsCredentialIdentity>>();

/**
 * Get cached credentials for a profile, checking if they're still valid
 */
export async function checkAuthStatus(profileName: string): Promise<AuthStatus> {
  try {
    const provider = getCredentialProvider(profileName);
    const credentials = await provider();
    
    return {
      authenticated: true,
      expiresAt: credentials.expiration?.toISOString(),
      profileName,
    };
  } catch (error) {
    console.log(`Auth check failed for ${profileName}:`, (error as Error).message);
    return {
      authenticated: false,
      profileName,
    };
  }
}

/**
 * Get or create a credential provider for a profile
 */
export function getCredentialProvider(profileName: string): () => Promise<AwsCredentialIdentity> {
  if (!credentialProviders.has(profileName)) {
    const provider = fromSSO({ profile: profileName });
    credentialProviders.set(profileName, provider);
  }
  return credentialProviders.get(profileName)!;
}

/**
 * Clear cached credential provider (force refresh)
 */
export function clearCredentialProvider(profileName: string): void {
  credentialProviders.delete(profileName);
}

/**
 * Get extended PATH that includes common CLI installation locations
 * Packaged Electron apps on macOS don't inherit the user's shell PATH
 */
function getExtendedPath(): string {
  const home = homedir();
  const additionalPaths = [
    '/usr/local/bin',           // Homebrew on Intel Macs
    '/opt/homebrew/bin',        // Homebrew on Apple Silicon
    `${home}/.local/bin`,       // pip install --user
    '/usr/local/sbin',
    '/opt/homebrew/sbin',
  ];

  const currentPath = process.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin';
  return [...additionalPaths, currentPath].join(':');
}

/**
 * Trigger SSO login via AWS CLI
 * This opens the browser for the user to authenticate
 */
export async function loginWithSSO(profileName: string): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    console.log(`Starting SSO login for profile: ${profileName}`);

    // Extend PATH to include common CLI locations (packaged apps have limited PATH)
    const extendedEnv = {
      ...process.env,
      PATH: getExtendedPath(),
    };

    // Note: shell: false to prevent command injection via malicious profile names
    const child = spawn('aws', ['sso', 'login', '--profile', profileName], {
      stdio: ['inherit', 'pipe', 'pipe'],
      env: extendedEnv,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
      console.log('SSO stdout:', data.toString());
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
      console.log('SSO stderr:', data.toString());
    });

    child.on('close', (code) => {
      // Clear cached provider to force re-fetch after login
      clearCredentialProvider(profileName);

      if (code === 0) {
        console.log('SSO login successful');
        resolve({ success: true });
      } else {
        console.error('SSO login failed:', stderr);
        resolve({
          success: false,
          error: stderr || `AWS CLI exited with code ${code}`,
        });
      }
    });

    child.on('error', (error) => {
      console.error('SSO login error:', error);
      resolve({
        success: false,
        error: `Failed to start AWS CLI: ${error.message}. Make sure AWS CLI is installed.`,
      });
    });
  });
}

/**
 * Get credentials for a profile (for use with AWS SDK clients)
 */
export async function getCredentials(profileName: string): Promise<AwsCredentialIdentity> {
  const provider = getCredentialProvider(profileName);
  return provider();
}
