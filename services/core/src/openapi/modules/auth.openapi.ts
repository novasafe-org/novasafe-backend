import type { OpenApiDocument } from '../types/openapi.types';

const jsonBody = (schema: Record<string, unknown>, example?: unknown) => ({
  required: true,
  content: {
    'application/json': { schema, ...(example ? { example } : {}) },
  },
});

const successEnvelope = (example?: unknown) => ({
  '200': {
    description: 'Success',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/SuccessEnvelope' },
        ...(example ? { example } : {}),
      },
    },
  },
});

const errorResponse = () => ({
  '400': { description: 'Bad request', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } } },
  '401': { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorEnvelope' } } } },
});

const platformHeaders = [
  { $ref: '#/components/parameters/XClientSource' },
  { $ref: '#/components/parameters/XClientPlatform' },
  { $ref: '#/components/parameters/XClientVersion' },
  { $ref: '#/components/parameters/XRequestId' },
  { $ref: '#/components/parameters/XTraceId' },
];

/** Auth + onboarding paths (mirrors mobile_vault + /api/v1). */
export const buildAuthOpenApiPaths = (): OpenApiDocument['paths'] => ({
  '/api/v1/auth/login': {
    post: {
      tags: ['Auth'],
      operationId: 'login',
      summary: 'Email/password login',
      description: 'Returns JWT access token and session, or requiresTwoFactor if 2FA enabled.',
      parameters: platformHeaders,
      requestBody: jsonBody(
        {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', format: 'password' },
            devicePlatform: { type: 'string' },
            deviceModel: { type: 'string' },
            deviceOsVersion: { type: 'string' },
          },
        },
        { email: 'user@example.com', password: '********' },
      ),
      responses: { ...successEnvelope(), ...errorResponse() },
    },
  },
  '/mobile/auth/login': {
    post: {
      tags: ['Auth (Legacy)'],
      operationId: 'mobileLogin',
      summary: 'Login (legacy path)',
      parameters: platformHeaders,
      requestBody: jsonBody({
        type: 'object',
        required: ['email', 'password'],
        properties: { email: { type: 'string' }, password: { type: 'string' } },
      }),
      responses: successEnvelope(),
    },
  },
  '/api/v1/auth/2fa/verify': {
    post: {
      tags: ['Auth'],
      operationId: 'verifyTwoFactor',
      summary: 'Complete 2FA after login',
      parameters: platformHeaders,
      requestBody: jsonBody({
        type: 'object',
        required: ['email', 'code'],
        properties: { email: { type: 'string' }, code: { type: 'string' } },
      }),
      responses: successEnvelope(),
    },
  },
  '/api/v1/auth/logout': {
    post: {
      tags: ['Auth'],
      operationId: 'logout',
      summary: 'Logout (revoke session)',
      security: [{ bearerAuth: [] }],
      parameters: platformHeaders,
      responses: successEnvelope(),
    },
  },
  '/api/v1/auth/validate-session': {
    get: {
      tags: ['Auth'],
      operationId: 'validateSession',
      summary: 'Validate current session',
      security: [{ bearerAuth: [] }],
      parameters: platformHeaders,
      responses: successEnvelope(),
    },
  },
  '/api/v1/auth/oauth/google': {
    post: {
      tags: ['OAuth'],
      operationId: 'googleOAuth',
      summary: 'Google Sign-In',
      parameters: platformHeaders,
      requestBody: jsonBody({
        type: 'object',
        required: ['idToken'],
        properties: { idToken: { type: 'string' } },
      }),
      responses: successEnvelope(),
    },
  },
  '/api/v1/auth/oauth/apple': {
    post: {
      tags: ['OAuth'],
      operationId: 'appleOAuth',
      summary: 'Apple Sign-In',
      parameters: platformHeaders,
      requestBody: jsonBody({
        type: 'object',
        required: ['identityToken', 'nonce'],
        properties: {
          identityToken: { type: 'string' },
          nonce: { type: 'string' },
          givenName: { type: 'string' },
          familyName: { type: 'string' },
        },
      }),
      responses: successEnvelope(),
    },
  },
  '/api/v1/onboarding/check-email': {
    post: {
      tags: ['Onboarding'],
      operationId: 'checkEmail',
      summary: 'Check if email exists',
      parameters: platformHeaders,
      requestBody: jsonBody({
        type: 'object',
        properties: { email: { type: 'string', format: 'email' } },
      }),
      responses: successEnvelope(),
    },
  },
  '/api/v1/onboarding/send-otp': {
    post: {
      tags: ['Onboarding'],
      operationId: 'sendOtp',
      summary: 'Send signup OTP',
      parameters: platformHeaders,
      requestBody: jsonBody({ type: 'object', properties: { email: { type: 'string' } } }),
      responses: successEnvelope(),
    },
  },
  '/api/v1/onboarding/verify-otp': {
    post: {
      tags: ['Onboarding'],
      operationId: 'verifyOtp',
      summary: 'Verify signup OTP',
      parameters: platformHeaders,
      requestBody: jsonBody({
        type: 'object',
        properties: { email: { type: 'string' }, otp: { type: 'string' } },
      }),
      responses: successEnvelope(),
    },
  },
  '/api/v1/onboarding/create-account': {
    post: {
      tags: ['Onboarding'],
      operationId: 'createAccount',
      summary: 'Create account after OTP',
      parameters: platformHeaders,
      requestBody: jsonBody({
        type: 'object',
        required: ['email', 'fullName', 'password'],
        properties: {
          email: { type: 'string' },
          fullName: { type: 'string' },
          password: { type: 'string', minLength: 8 },
        },
      }),
      responses: { '201': { description: 'Created' }, ...successEnvelope() },
    },
  },
  '/api/v1/health': {
    get: {
      tags: ['System'],
      operationId: 'health',
      summary: 'Health check',
      responses: { '200': { description: 'OK' }, '503': { description: 'Degraded' } },
    },
  },
});

export const authOpenApiComponents = {
  securitySchemes: {
    bearerAuth: {
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT',
      description: 'NovaSafe access token from login/OAuth',
    },
  },
  parameters: {
    XClientSource: {
      name: 'x-client-source',
      in: 'header',
      schema: {
        type: 'string',
        enum: [
          'MOBILE_ANDROID',
          'MOBILE_IOS',
          'WEB_APP',
          'BROWSER_EXTENSION',
          'DESKTOP_APP',
          'ADMIN_PANEL',
        ],
      },
      description: 'Declared client source (verified separately by trust layer)',
    },
    XClientPlatform: {
      name: 'x-client-platform',
      in: 'header',
      schema: { type: 'string', enum: ['android', 'ios', 'web', 'windows', 'macos', 'extension'] },
    },
    XClientVersion: {
      name: 'x-client-version',
      in: 'header',
      schema: { type: 'string' },
    },
    XRequestId: { name: 'x-request-id', in: 'header', schema: { type: 'string' } },
    XTraceId: { name: 'x-trace-id', in: 'header', schema: { type: 'string' } },
  },
  schemas: {
    SuccessEnvelope: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        source: { type: 'string' },
        token: { type: 'string' },
        accessToken: { type: 'string' },
        user: { type: 'object' },
      },
    },
    ErrorEnvelope: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        message: { type: 'string' },
        code: { type: 'string' },
      },
    },
  },
};
