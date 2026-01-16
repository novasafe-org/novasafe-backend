#!/usr/bin/env node

/**
 * Request Validation Script for Add Item Endpoint
 * 
 * Usage: node validate-request.js <path-to-json-file>
 * Example: node validate-request.js sample-add-item-request.json
 */

const fs = require('fs');
const path = require('path');

// Get file path from command line
const filePath = process.argv[2];

if (!filePath) {
  console.error('❌ Error: Please provide a JSON file path');
  console.log('Usage: node validate-request.js <path-to-json-file>');
  process.exit(1);
}

// Read and parse JSON file
let request;
try {
  const fileContent = fs.readFileSync(filePath, 'utf8');
  request = JSON.parse(fileContent);
} catch (error) {
  console.error('❌ Error reading or parsing JSON file:', error.message);
  process.exit(1);
}

console.log('🔍 Validating request body...\n');

let isValid = true;
const errors = [];

// Validate encrypted_data
if (!request.encrypted_data) {
  errors.push('❌ encrypted_data is MISSING');
  isValid = false;
} else if (typeof request.encrypted_data !== 'string') {
  errors.push(`❌ encrypted_data must be a string, got: ${typeof request.encrypted_data}`);
  isValid = false;
} else if (request.encrypted_data.length === 0) {
  errors.push('❌ encrypted_data cannot be empty');
  isValid = false;
} else {
  // Validate base64 format
  try {
    Buffer.from(request.encrypted_data, 'base64');
    console.log('✅ encrypted_data is present and valid base64');
  } catch (e) {
    errors.push('❌ encrypted_data is not valid base64');
    isValid = false;
  }
}

// Validate IV
if (!request.iv) {
  errors.push('❌ iv is MISSING');
  isValid = false;
} else if (typeof request.iv !== 'string') {
  errors.push(`❌ iv must be a string, got: ${typeof request.iv}`);
  isValid = false;
} else {
  try {
    const ivBuffer = Buffer.from(request.iv, 'base64');
    if (ivBuffer.length !== 12) {
      errors.push(`❌ iv is ${ivBuffer.length} bytes, expected exactly 12 bytes`);
      isValid = false;
    } else {
      console.log('✅ iv is valid (12 bytes)');
    }
  } catch (e) {
    errors.push('❌ iv is not valid base64');
    isValid = false;
  }
}

// Validate category
if (!request.category) {
  errors.push('❌ category is MISSING');
  isValid = false;
} else if (typeof request.category !== 'string') {
  errors.push(`❌ category must be a string, got: ${typeof request.category}`);
  isValid = false;
} else if (request.category.length === 0) {
  errors.push('❌ category cannot be empty');
  isValid = false;
} else {
  const validCategories = ['password', 'personal-id', 'property', 'financial', 'medical', 'photos', 'notes', 'misc'];
  if (!validCategories.includes(request.category)) {
    console.log(`⚠️  category "${request.category}" is not in the standard list, but may still be valid`);
  } else {
    console.log('✅ category is valid');
  }
}

// Validate field_count
if (request.field_count === undefined || request.field_count === null) {
  errors.push('❌ field_count is MISSING');
  isValid = false;
} else if (typeof request.field_count !== 'number') {
  errors.push(`❌ field_count must be a number, got: ${typeof request.field_count}`);
  isValid = false;
} else if (request.field_count < 0) {
  errors.push(`❌ field_count must be >= 0, got: ${request.field_count}`);
  isValid = false;
} else {
  console.log(`✅ field_count is valid: ${request.field_count}`);
}

// Validate attachment_count
if (request.attachment_count === undefined || request.attachment_count === null) {
  errors.push('❌ attachment_count is MISSING');
  isValid = false;
} else if (typeof request.attachment_count !== 'number') {
  errors.push(`❌ attachment_count must be a number, got: ${typeof request.attachment_count}`);
  isValid = false;
} else if (request.attachment_count < 0) {
  errors.push(`❌ attachment_count must be >= 0, got: ${request.attachment_count}`);
  isValid = false;
} else {
  console.log(`✅ attachment_count is valid: ${request.attachment_count}`);
}

// Validate optional fields
if (request.title !== undefined && typeof request.title !== 'string') {
  errors.push(`⚠️  title should be a string, got: ${typeof request.title}`);
}

if (request.folderId !== undefined && request.folderId !== null && typeof request.folderId !== 'string') {
  errors.push(`⚠️  folderId should be a string or null, got: ${typeof request.folderId}`);
}

if (request.tags !== undefined && !Array.isArray(request.tags)) {
  errors.push(`⚠️  tags should be an array, got: ${typeof request.tags}`);
}

if (request.isFavorite !== undefined && typeof request.isFavorite !== 'boolean') {
  errors.push(`⚠️  isFavorite should be a boolean, got: ${typeof request.isFavorite}`);
}

// Print errors
if (errors.length > 0) {
  console.log('\n❌ Validation Errors:');
  errors.forEach(error => console.log(`  ${error}`));
}

// Print summary
console.log('\n' + '='.repeat(50));
if (isValid) {
  console.log('✅ Request is VALID and ready to send!');
  console.log('\nRequest body:');
  console.log(JSON.stringify(request, null, 2));
} else {
  console.log('❌ Request is INVALID. Please fix the errors above.');
  process.exit(1);
}

