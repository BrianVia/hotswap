/**
 * Extract the stable prefix from a CloudFormation-generated table name.
 * Pattern: {StackName}-{tableLogicalId}{hash}-{cfnSuffix}
 * Example: 'MetadataStack-savvymetadata09BC1DD1-1QOLI4L3PHUH5' -> 'MetadataStack-savvymetadata09BC1DD1'
 *
 * This enables bookmarks to work across environments where the same logical table
 * has different CloudFormation-generated suffixes.
 */
export function extractTablePrefix(tableName: string): string {
  // Match pattern: last segment is random CFN suffix (uppercase alphanumeric, 8-16 chars)
  const match = tableName.match(/^(.+)-[A-Z0-9]{8,}$/);
  return match ? match[1] : tableName;
}

/**
 * Check if two tables are logically the same (same prefix, different environments)
 */
export function tablesMatch(table1: string, table2: string): boolean {
  return extractTablePrefix(table1) === extractTablePrefix(table2);
}
