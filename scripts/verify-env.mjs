#!/usr/bin/env node

/**
 * Environment Variable Verification Script
 * Ensures all required variables are set before deployment
 */

const requiredVars = [
  "DATABASE_URL",
  "REDIS_URL",
  "SESSION_SECRET",
  "ENCRYPTION_KEY",
  "NEXT_PUBLIC_APP_URL",
];

const conditionalVars = {
  production: [
    "APPLICATIONINSIGHTS_CONNECTION_STRING",
    "STRIPE_SECRET_KEY",
    "GEMINI_API_KEY",
  ],
  development: [],
};

const missingVars = [];
const missingConditional = [];

const env = process.env.NODE_ENV || "development";

// Check required vars
for (const varName of requiredVars) {
  if (!process.env[varName]) {
    missingVars.push(varName);
  }
}

// Check conditional vars
const conditional = conditionalVars[env as keyof typeof conditionalVars] || [];
for (const varName of conditional) {
  if (!process.env[varName]) {
    missingConditional.push(varName);
  }
}

const hasErrors = missingVars.length > 0;
const hasWarnings = missingConditional.length > 0 && env === "production";

if (hasErrors) {
  console.error(`❌ Missing required environment variables for ${env}:`);
  for (const varName of missingVars) {
    console.error(`   - ${varName}`);
  }
  process.exit(1);
}

if (hasWarnings) {
  console.warn(`⚠️  Missing recommended environment variables for ${env}:`);
  for (const varName of missingConditional) {
    console.warn(`   - ${varName}`);
  }
}

console.log(`✓ Environment variables verified for ${env}`);
console.log(`  Required: ${requiredVars.length}/${requiredVars.length} set`);
if (conditional.length > 0) {
  const set = conditional.length - missingConditional.length;
  console.log(`  Conditional: ${set}/${conditional.length} set`);
}
