import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import ini from 'ini';
import type { AwsProfile, SsoSession } from '../types.js';

const CONFIG_PATH = path.join(homedir(), '.aws', 'config');

interface ParsedConfig {
  [key: string]: {
    sso_start_url?: string;
    sso_region?: string;
    sso_registration_scopes?: string;
    sso_session?: string;
    sso_account_id?: string;
    sso_role_name?: string;
    region?: string;
    output?: string;
  };
}

export async function parseAwsConfig(): Promise<{ profiles: AwsProfile[]; ssoSessions: Map<string, SsoSession> }> {
  if (!existsSync(CONFIG_PATH)) {
    console.warn(`AWS config file not found at ${CONFIG_PATH}`);
    return { profiles: [], ssoSessions: new Map() };
  }

  const configContent = await readFile(CONFIG_PATH, 'utf-8');
  const parsed = ini.parse(configContent) as ParsedConfig;

  const ssoSessions = new Map<string, SsoSession>();
  const profiles: AwsProfile[] = [];

  // First pass: extract SSO sessions
  for (const [key, value] of Object.entries(parsed)) {
    if (key.startsWith('sso-session ')) {
      const sessionName = key.replace('sso-session ', '');
      ssoSessions.set(sessionName, {
        name: sessionName,
        sso_start_url: value.sso_start_url || '',
        sso_region: value.sso_region || '',
        sso_registration_scopes: value.sso_registration_scopes,
      });
    }
  }

  // Second pass: extract profiles
  for (const [key, value] of Object.entries(parsed)) {
    if (key.startsWith('profile ')) {
      const profileName = key.replace('profile ', '');
      const ssoSession = value.sso_session ? ssoSessions.get(value.sso_session) : undefined;

      profiles.push({
        name: profileName,
        sso_session: value.sso_session,
        sso_account_id: value.sso_account_id,
        sso_role_name: value.sso_role_name,
        region: value.region || 'us-east-1',
        output: value.output,
        ssoSession,
      });
    }
  }

  // Sort profiles alphabetically for better UX
  profiles.sort((a, b) => a.name.localeCompare(b.name));

  return { profiles, ssoSessions };
}

export function getAwsConfigPath(): string {
  return CONFIG_PATH;
}
