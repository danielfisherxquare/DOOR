import swaggerJsdoc from 'swagger-jsdoc';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'DOOR Platform API',
      version: '1.0.0',
      description: '赛事运营管理平台 API 文档 — Event Operations Management Platform',
      contact: {
        name: 'DOOR Team',
      },
    },
    servers: [
      {
        url: process.env.PUBLIC_BASE_URL || 'http://localhost:3001',
        description: process.env.NODE_ENV === 'production' ? 'Production' : 'Local Development',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: '使用登录接口获取的 accessToken',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: '错误信息' },
          },
        },
        Success: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: { type: 'object' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: [
    './src/modules/**/*.routes.js',
  ],
};

export const swaggerSpec = swaggerJsdoc(options);
