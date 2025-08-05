import express ,{Request,Response} from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js"
import { z } from "zod";
import cors from 'cors'


const app = express();
app.use(express.json());
app.use(
  cors({
    origin: "*",
    optionsSuccessStatus: 200, // For legacy browser support
  }),
);


// Input schemas
const listRecordsSchema = z.object({
    expand: z.string().optional(),
    fields: z.string().optional(),
    q: z.string().optional(),
    offset: z.number().optional(),
    limit: z.number().optional(),
    onlyData: z.boolean().optional(),
    orderBy: z.string().optional(),
    totalResults: z.boolean().optional()
  });
  const getAttachmentsSchema = z.object({
    documentsOfRecordId: z.number(),
    expand: z.string().optional(),
    q: z.string().optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
    onlyData: z.boolean().optional(),
    orderBy: z.string().optional(),
    totalResults: z.boolean().optional(),
    links: z.string().optional(),
    dependency: z.string().optional()
  });
  
  // Utility to build query parameters
  function toQuery(params: any): string {
    const esc = encodeURIComponent;
    return Object.entries(params || {})
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => esc(k) + '=' + esc(String(v)))
      .join('&');
  }

const getServer = () => {
    const server = new McpServer({ name: 'stateless-server', version: '1.0.0' });

server.registerTool(
  "getPayrollDocumentRecords",
  {
    title: "Get Payroll Document Records",
    description: "List payroll document records with filters",
    inputSchema: {
        expand: z.string().optional(),
        fields: z.string().optional(),
        q: z.string().optional(),
        offset: z.number().optional(),
        limit: z.number().optional(),
        onlyData: z.boolean().optional(),
        orderBy: z.string().optional(),
        totalResults: z.boolean().optional()
      }
  },
  async (args:any) => {
    const query = toQuery(args);
    const res = await fetch(
      `${process.env.ORACLE_BASE_URL}/hcmRestApi/resources/11.13.18.05/payrollDocumentRecords${query ? '?' + query : ''}`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${process.env.ORACLE_OAUTH_TOKEN}`,
          "Accept": "application/json"
        }
      }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return await res.json();
  }
);

// Tool #2: get attachments for a payrollDocumentRecord
server.registerTool(
  "getPayrollDocumentAttachments",
  {
    title: "Get Payroll Document Record Attachments",
    description: "List attachments for a given payroll document record",
    inputSchema: {
        documentsOfRecordId: z.number(),
        expand: z.string().optional(),
        q: z.string().optional(),
        limit: z.number().optional(),
        offset: z.number().optional(),
        onlyData: z.boolean().optional(),
        orderBy: z.string().optional(),
        totalResults: z.boolean().optional(),
        links: z.string().optional(),
        dependency: z.string().optional()
      }
  },
  async (args:any) => {
    const { documentsOfRecordId, ...rest } = args;
    const query = toQuery(rest);
    const path = `/hcmRestApi/resources/11.13.18.05/payrollDocumentRecords/${documentsOfRecordId}/child/attachments`;
    const res = await fetch(
      `${process.env.ORACLE_BASE_URL}${path}${query ? '?' + query : ''}`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${process.env.ORACLE_OAUTH_TOKEN}`,
          "Accept": "application/json"
        }
      }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return await res.json();
  }
);


    return server;
  };

  app.post('/mcp', async (req: Request, res: Response) => {
    
    try {
      const server = getServer(); 
      const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on('close', () => {
        console.log('Request closed');
        transport.close();
        server.close();
      });
    } catch (error) {
      console.error('Error handling MCP request:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal server error',
          },
          id: null,
        });
      }
    }
  });
  
  app.get('/mcp', async (req: Request, res: Response) => {
    console.log('Received GET MCP request');
    res.writeHead(405).end(JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed."
      },
      id: null
    }));
  });
  
  app.delete('/mcp', async (req: Request, res: Response) => {
    console.log('Received DELETE MCP request');
    res.writeHead(405).end(JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed."
      },
      id: null
    }));
  });
  
  
  // Start the server
  const PORT = 3002;
  app.listen(PORT);
  
  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
  });
  
  process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
  });