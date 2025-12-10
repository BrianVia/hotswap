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
 * Trigger SSO login via AWS CLI
 * This opens the browser for the user to authenticate
 */
export async function loginWithSSO(profileName: string): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    console.log(`Starting SSO login for profile: ${profileName}`);
    
    const process = spawn('aws', ['sso', 'login', '--profile', profileName], {
      shell: true,
      stdio: ['inherit', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    process.stdout?.on('data', (data) => {
      stdout += data.toString();
      console.log('SSO stdout:', data.toString());
    });

    process.stderr?.on('data', (data) => {
      stderr += data.toString();
      console.log('SSO stderr:', data.toString());
    });

    process.on('close', (code) => {
      // Clear cached provider to force re-fetch after login
      clearCredentialProvider(profileName);
      
      if (code === 0) {
        console.log('SSO login successful');
        resolve({ success: true });
      } else {
        console.error('SSO login failed:', stderr);
        resolve({ 
          success: false, 
          error: stderr || `AWS CLI exited with code ${code}` 
        });
      }
    });

    process.on('error', (error) => {
      console.error('SSO login error:', error);
      resolve({ 
        success: false, 
        error: `Failed to start AWS CLI: ${error.message}` 
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
