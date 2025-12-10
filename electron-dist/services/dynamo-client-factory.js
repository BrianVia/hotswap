import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { fromSSO } from '@aws-sdk/credential-provider-sso';
import { parseAwsConfig } from './config-parser.js';
// Cache of DynamoDB clients per profile
const dynamoClients = new Map();
const docClients = new Map();
/**
 * Get or create a DynamoDB client for a profile
 */
export async function getDynamoDBClient(profileName) {
    if (dynamoClients.has(profileName)) {
        return dynamoClients.get(profileName);
    }
    const { profiles } = await parseAwsConfig();
    const profile = profiles.find(p => p.name === profileName);
    if (!profile) {
        throw new Error(`Profile not found: ${profileName}`);
    }
    const client = new DynamoDBClient({
        region: profile.region,
        credentials: fromSSO({ profile: profileName }),
    });
    dynamoClients.set(profileName, client);
    return client;
}
/**
 * Get or create a DynamoDB Document client for a profile
 * Document client provides a simpler interface with automatic marshalling
 */
export async function getDynamoDBDocClient(profileName) {
    if (docClients.has(profileName)) {
        return docClients.get(profileName);
    }
    const client = await getDynamoDBClient(profileName);
    const docClient = DynamoDBDocumentClient.from(client, {
        marshallOptions: {
            removeUndefinedValues: true,
            convertEmptyValues: false,
        },
        unmarshallOptions: {
            wrapNumbers: false,
        },
    });
    docClients.set(profileName, docClient);
    return docClient;
}
/**
 * Clear cached clients for a profile (e.g., after re-authentication)
 */
export function clearClientsForProfile(profileName) {
    const client = dynamoClients.get(profileName);
    if (client) {
        client.destroy();
        dynamoClients.delete(profileName);
    }
    docClients.delete(profileName);
}
/**
 * Clear all cached clients
 */
export function clearAllClients() {
    for (const client of dynamoClients.values()) {
        client.destroy();
    }
    dynamoClients.clear();
    docClients.clear();
}
//# sourceMappingURL=dynamo-client-factory.js.map