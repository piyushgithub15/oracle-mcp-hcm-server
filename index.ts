import dotenv from 'dotenv';
dotenv.config();
import express, { Request, Response } from "express";
import { z } from "zod";
import cors from 'cors';

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: "*",
    optionsSuccessStatus: 200,
  })
);

// Schemas
const getLeaveBalanceSchema = z.object({
  employeeNumber: z.string(),
  asofDate: z.string(),
});

const createLeaveSchema = z.object({
  personNumber: z.string(),
  employer: z.string(),
  absenceType: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  absenceStatusCd: z.string(),
  approvalStatusCd: z.string(),
  startDateDuration: z.string(),
  endDateDuration: z.string(),
  employeeToken: z.string()
});

// GET LEAVE BALANCE
app.post('/leave-balance', async (req: Request, res: Response) => {
  const parseResult = getLeaveBalanceSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: "Invalid input", details: parseResult.error.format() });
  }

  const { employeeNumber, asofDate } = parseResult.data;

  try {
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
          employeeNumber,
          asofDate
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return res.json({ data });

  } catch (error) {
    console.error('Error fetching leave balance:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// CREATE LEAVE ENTRY
app.post('/create-leave', async (req: Request, res: Response) => {
  const parseResult = createLeaveSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: "Invalid input", details: parseResult.error.format() });
  }

  const {
    employeeToken,
    ...rest
  } = parseResult.data;

  try {
    const response = await fetch(
      `${process.env.ORACLE_BASE_URL}/ADQ_CREATE_ABSENCE_SYNC/1.0/createAbsence?Authorization=Basic%20${encodeURIComponent(employeeToken)}`,
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
          ...rest
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return res.json({ data });

  } catch (error) {
    console.error('Error creating leave entry:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Fallback for unsupported methods on these endpoints
app.all('/leave-balance', (_, res) => {
  res.status(405).json({ error: "Method Not Allowed" });
});
app.all('/create-leave', (_, res) => {
  res.status(405).json({ error: "Method Not Allowed" });
});

// Server startup
const PORT = 3002;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Global error handling
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});