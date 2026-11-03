#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { registerPhDataTools } from './tools/ph-data.js';
import { registerScholarshipTools } from './tools/scholarships.js';

function createServer(): McpServer {
  const server = new McpServer({ name: 'ph-data-mcp-server', version: '0.1.0' });
  registerScholarshipTools(server);
  registerPhDataTools(server);
  return server;
}

serveStdio(createServer);
console.error('ph-data-mcp-server running on stdio'); // stderr: stdout carries the protocol
