/**
 * Coerce a string value to the appropriate DynamoDB type
 * Returns number for 'N' type, string for 'S' type, original string for 'B' or undefined
 */
function coerceKeyValue(value, valueType) {
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
function buildFilterExpression(filters, expressionAttributeNames, expressionAttributeValues) {
    if (!filters || filters.length === 0)
        return undefined;
    const conditions = [];
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
export function buildQueryCommand(params) {
    const { tableName, indexName, keyCondition, filters, limit, scanIndexForward, exclusiveStartKey } = params;
    const expressionAttributeNames = {
        '#pk': keyCondition.pk.name,
    };
    const expressionAttributeValues = {
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
    const command = {
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
export function buildScanCommand(params) {
    const { tableName, indexName, limit, exclusiveStartKey, filters } = params;
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    const filterExpression = buildFilterExpression(filters || [], expressionAttributeNames, expressionAttributeValues);
    const command = {
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
//# sourceMappingURL=query-executor.js.map