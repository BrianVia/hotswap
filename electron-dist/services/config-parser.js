import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import ini from 'ini';
const CONFIG_PATH = path.join(homedir(), '.aws', 'config');
export async function parseAwsConfig() {
    if (!existsSync(CONFIG_PATH)) {
        console.warn(`AWS config file not found at ${CONFIG_PATH}`);
        return { profiles: [], ssoSessions: new Map() };
    }
    const configContent = await readFile(CONFIG_PATH, 'utf-8');
    const parsed = ini.parse(configContent);
    const ssoSessions = new Map();
    const profiles = [];
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
export function getAwsConfigPath() {
    return CONFIG_PATH;
}
//# sourceMappingURL=config-parser.js.map