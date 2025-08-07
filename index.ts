import dotenv from 'dotenv';
dotenv.config();
import express ,{Request,Response} from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
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

  const getServer = () => {
    const server = new McpServer({ name: 'stateless-server', version: '1.0.0' });
  
    server.registerTool(
      "getLeaveBalance",
      {
        title: "Get Leave Balance",
        description: "Fetch leave balances for a specific employee as of a given date.",
        inputSchema: {
          employeeNumber: z.string(),
          asofDate: z.string(),
        }
      },
      async (args) => {
        const response = await fetch(
          `${process.env.ORACLE_BASE_URL}/ADQ_EMP_GET_ABSEN_BALAN_SYNC/1.0/leavebalance`,
          {
            method: "POST",
            headers: {
              "Authorization": `Basic ${process.env.ORACLE_TOKEN}`,
              "Accept": "application/json",
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              operationName: "getEmpLeaveBalance",
              projectName: "MOBILEAPP",
              ...args
            })
          }
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        const data = await response.json()
        return {
          content: [
            {
              type: 'text',
              text: `${JSON.stringify(data)}`,
            },
          ],
        };
      }
    );
  
    server.registerTool(
      "createLeaveBalance",
      {
        title: "Create Leave Entry",
        description: "Submit a leave request for an employee.",
        inputSchema: {
          personNumber: z.string(),
          employer: z.string(),
          absenceType: z.string(),
          startDate: z.string(),
          endDate: z.string(),
          absenceStatusCd: z.string(),
          approvalStatusCd: z.string(),
          startDateDuration: z.string(),
          endDateDuration: z.string(),
        }
      },
      async (args) => {
        const response = await fetch(
          `${process.env.ORACLE_BASE_URL}/ADQ_CREATE_ABSENCE_SYNC/1.0/createAbsence`,
          {
            method: "POST",
            headers: {
              "Authorization": `Basic ${process.env.ORACLE_TOKEN}`,
              "Accept": "application/json",
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              operationName: "createLeave",
              projectName: "MOBILEAPP",
              ...args
            })
          }
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        const data = await response.json()
        return {
          content: [
            {
              type: 'text',
              text: `${JSON.stringify(data)}`,
            },
          ],
        };
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