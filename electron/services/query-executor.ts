import { QueryCommandInput, ScanCommandInput } from '@aws-sdk/lib-dynamodb';
import type { QueryParams, FilterCondition, DynamoKeyValueType } from '../types.js';

export interface ScanParams {
  tableName: string;
  indexName?: string;
  limit?: number;
  exclusiveStartKey?: Record<string, unknown>;
  filters?: FilterCondition[];
}

/**
 * Coerce a string value to the appropriate DynamoDB type
 * Returns number for 'N' type, string for 'S' type, original string for 'B' or undefined
 */
function coerceKeyValue(value: string, valueType?: DynamoKeyValueType): string | number {
  if (valueType === 'N') {
    const num = Number(value);
    if (!isNaN(num) && isFinite(num)) {
      return num;
    }
    // If parsing fails, return original string and let DynamoDB handle the error
    console.warn(`Failed to parse numeric value: ${value}`);
  }
  // For 'S', 'B', or undefined, return as string
  return value;
}

/**
 * Build FilterExpression from filter conditions
 */
function buildFilterExpression(
  filters: FilterCondition[],
  expressionAttributeNames: Record<string, string>,
  expressionAttributeValues: Record<string, unknown>
): string | undefined {
  if (!filters || filters.length === 0) return undefined;

  const conditions: string[] = [];

  filters.forEach((filter, index) => {
    const attrName = `#f${index}`;
    const attrValue = `:f${index}`;
    expressionAttributeNames[attrName] = filter.attribute;

    switch (filter.operator) {
      case 'eq':
        expressionAttributeValues[attrValue] = filter.value;
        conditions.push(`${attrName} = ${attrValue}`);
        break;
      case 'ne':
        expressionAttributeValues[attrValue] = filter.value;
        conditions.push(`${attrName} <> ${attrValue}`);
        break;
      case 'lt':
        expressionAttributeValues[attrValue] = filter.value;
        conditions.push(`${attrName} < ${attrValue}`);
        break;
      case 'lte':
        expressionAttributeValues[attrValue] = filter.value;
        conditions.push(`${attrName} <= ${attrValue}`);
        break;
      case 'gt':
        expressionAttributeValues[attrValue] = filter.value;
        conditions.push(`${attrName} > ${attrValue}`);
        break;
      case 'gte':
        expressionAttributeValues[attrValue] = filter.value;
        conditions.push(`${attrName} >= ${attrValue}`);
        break;
      case 'begins_with':
        expressionAttributeValues[attrValue] = filter.value;
        conditions.push(`begins_with(${attrName}, ${attrValue})`);
        break;
      case 'contains':
        expressionAttributeValues[attrValue] = filter.value;
        conditions.push(`contains(${attrName}, ${attrValue})`);
        break;
      case 'exists':
        conditions.push(`attribute_exists(${attrName})`);
        break;
      case 'not_exists':
        conditions.push(`attribute_not_exists(${attrName})`);
        break;
      case 'between':
        expressionAttributeValues[attrValue] = filter.value;
        expressionAttributeValues[`${attrValue}b`] = filter.value2;
        conditions.push(`${attrName} BETWEEN ${attrValue} AND ${attrValue}b`);
        break;
    }
  });

  return conditions.length > 0 ? conditions.join(' AND ') : undefined;
}

/**
 * Build a DynamoDB QueryCommandInput from QueryParams
 */
export function buildQueryCommand(params: QueryParams): QueryCommandInput {
  const { tableName, indexName, keyCondition, filters, limit, scanIndexForward, exclusiveStartKey } = params;

  const expressionAttributeNames: Record<string, string> = {
    '#pk': keyCondition.pk.name,
  };
  const expressionAttributeValues: Record<string, unknown> = {
    ':pk': coerceKeyValue(keyCondition.pk.value, keyCondition.pk.valueType),
  };

  let keyConditionExpression = '#pk = :pk';

  // Add sort key condition if provided
  if (keyCondition.sk) {
    const { name, operator, value, value2, valueType } = keyCondition.sk;
    expressionAttributeNames['#sk'] = name;
    expressionAttributeValues[':sk'] = coerceKeyValue(value, valueType);

    switch (operator) {
      case 'eq':
        keyConditionExpression += ' AND #sk = :sk';
        break;
      case 'begins_with':
        keyConditionExpression += ' AND begins_with(#sk, :sk)';
        break;
      case 'between':
        keyConditionExpression += ' AND #sk BETWEEN :sk AND :sk2';
        expressionAttributeValues[':sk2'] = value2 ? coerceKeyValue(value2, valueType) : value2;
        break;
      case 'lt':
        keyConditionExpression += ' AND #sk < :sk';
        break;
      case 'lte':
        keyConditionExpression += ' AND #sk <= :sk';
        break;
      case 'gt':
        keyConditionExpression += ' AND #sk > :sk';
        break;
      case 'gte':
        keyConditionExpression += ' AND #sk >= :sk';
        break;
    }
  }

  // Build filter expression
  const filterExpression = buildFilterExpression(filters || [], expressionAttributeNames, expressionAttributeValues);

  const command: QueryCommandInput = {
    TableName: tableName,
    KeyConditionExpression: keyConditionExpression,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
  };

  if (filterExpression) {
    command.FilterExpression = filterExpression;
  }

  if (indexName) {
    command.IndexName = indexName;
  }

  if (limit !== undefined) {
    command.Limit = limit;
  }

  if (scanIndexForward !== undefined) {
    command.ScanIndexForward = scanIndexForward;
  }

  if (exclusiveStartKey) {
    command.ExclusiveStartKey = exclusiveStartKey;
  }

  return command;
}

/**
 * Build a DynamoDB ScanCommandInput from ScanParams
 */
export function buildScanCommand(params: ScanParams): ScanCommandInput {
  const { tableName, indexName, limit, exclusiveStartKey, filters } = params;

  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, unknown> = {};

  const filterExpression = buildFilterExpression(filters || [], expressionAttributeNames, expressionAttributeValues);

  const command: ScanCommandInput = {
    TableName: tableName,
  };

  if (filterExpression) {
    command.FilterExpression = filterExpression;
    command.ExpressionAttributeNames = expressionAttributeNames;
    command.ExpressionAttributeValues = expressionAttributeValues;
  }

  if (indexName) {
    command.IndexName = indexName;
  }

  if (limit !== undefined) {
    command.Limit = limit;
  }

  if (exclusiveStartKey) {
    command.ExclusiveStartKey = exclusiveStartKey;
  }

  return command;
}
