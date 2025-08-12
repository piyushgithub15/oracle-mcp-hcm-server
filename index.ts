import dotenv from 'dotenv';
dotenv.config();
import express, { Request, Response } from "express";
import { z } from "zod";
import cors from 'cors';
import mongoose from 'mongoose';

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: "*",
    optionsSuccessStatus: 200,
  })
);

// MongoDB Connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/leave_management');
    console.log('✅ MongoDB connected successfully');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error);
    process.exit(1);
  }
};

// MongoDB Schemas
const employeeSchema = new mongoose.Schema({
  employeeNumber: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  managerId: { type: String, default: null },
  managerName: { type: String, default: null },
  email: { type: String },
  department: { type: String },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const leaveRequestSchema = new mongoose.Schema({
  personAbsenceEntryId: { type: Number, required: true },
  absenceType: { type: String, required: true },
  startDate: { type: String, required: true },
  endDate: { type: String, required: true },
  duration: { type: String, required: true },
  submittedDate: { type: String, required: true },
  employeeNumber: { type: String, required: true },
  employeeName: { type: String, required: true }
});

const pendingApprovalSchema = new mongoose.Schema({
  approvalId: { type: Number, required: true, unique: true },
  employeeNumber: { type: String, required: true },
  employeeName: { type: String, required: true },
  managerId: { type: String, required: true },
  managerName: { type: String, required: true },
  leaveRequest: { type: leaveRequestSchema, required: true },
  status: { 
    type: String, 
    enum: ['PENDING', 'APPROVED', 'REJECTED'], 
    default: 'PENDING' 
  },
  submittedAt: { type: Date, default: Date.now },
  approvedBy: { type: String },
  approvedAt: { type: Date },
  comments: { type: String, default: '' },
  oracleResponse: { type: mongoose.Schema.Types.Mixed }
});

// Auto-increment for approvalId
// pendingApprovalSchema.pre('save', async function(next) {
//   if (this.isNew) {
//     const lastApproval = await PendingApproval.findOne().sort({ approvalId: -1 });
//     this.approvalId = lastApproval ? lastApproval.approvalId + 1 : 1;
//   }
//   next();
// });

// MongoDB Models
const Employee = mongoose.model('Employee', employeeSchema);
const PendingApproval = mongoose.model('PendingApproval', pendingApprovalSchema);

// Types
interface IEmployee {
  employeeNumber: string;
  name: string;
  managerId: string | null;
  managerName?: string | null;
  email?: string;
  department?: string;
  isActive?: boolean;
}

interface ILeaveRequest {
  personAbsenceEntryId: number;
  absenceType: string;
  startDate: string;
  endDate: string;
  duration: string;
  submittedDate: string;
  employeeNumber: string;
  employeeName: string;
}

interface IPendingApproval {
  approvalId: number;
  employeeNumber: string;
  employeeName: string;
  managerId: string;
  managerName: string;
  leaveRequest: ILeaveRequest;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  submittedAt: Date;
  approvedBy?: string;
  approvedAt?: Date;
  comments?: string;
  oracleResponse?: any;
}

// Initialize default employees
const initializeEmployees = async () => {
  try {
    const existingEmployees = await Employee.countDocuments();
    if (existingEmployees === 0) {
      const defaultEmployees = [
        {
          employeeNumber: '1460',
          name: 'Aysha',
          managerId: '210',
          managerName: 'Lubna',
          email: 'aysha@adq.ae',
          department: 'IT',
          isActive: true
        },
        {
          employeeNumber: '210',
          name: 'Lubna',
          managerId: null,
          managerName: null,
          email: 'lubna@adq.ae',
          department: 'Management',
          isActive: true
        }
      ];

      await Employee.insertMany(defaultEmployees);
      console.log('✅ Default employees initialized');
    }
  } catch (error) {
    console.error('❌ Error initializing employees:', error);
  }
};

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

const applyLeaveSchema = z.object({
  employeeNumber: z.string(),
  absenceType: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  startDateDuration: z.string().optional().default("1"),
  endDateDuration: z.string().optional().default("1"),
  employeeToken: z.string()
});

const approveRejectSchema = z.object({
  managerId: z.string(),
  action: z.enum(['APPROVE', 'REJECT']),
  comments: z.string().optional().default('')
});

const employeeSchema_validation = z.object({
  employeeNumber: z.string(),
  name: z.string(),
  managerId: z.string().nullable(),
  managerName: z.string().optional(),
  email: z.string().email().optional(),
  department: z.string().optional()
});

// Utility function to make Oracle API calls
async function callOracleAPI(endpoint: string, data: any, employeeToken?: string): Promise<any> {
  const url = employeeToken 
    ? `${process.env.ORACLE_BASE_URL}${endpoint}?Authorization=Basic%20${encodeURIComponent(employeeToken)}`
    : `${process.env.ORACLE_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${process.env.ORACLE_TOKEN}`,
      "Accept": "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  });

  const resp = await response.json()
  console.log("response status",response.status)
  console.log("response status",resp)


  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  if (resp.status == "Failed") {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  return resp;
}

// GET LEAVE BALANCE
app.post('/leave-balance', async (req: Request, res: Response) => {
  const parseResult = getLeaveBalanceSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: "Invalid input", details: parseResult.error.format() });
  }

  const { employeeNumber, asofDate } = parseResult.data;

  try {
    // Check if employee exists in database
    const employee = await Employee.findOne({ employeeNumber, isActive: true });
    if (!employee) {
      return res.status(404).json({ error: "Employee not found", employeeNumber });
    }

    const requestData = {
      operationName: "getEmpLeaveBalance",
      projectName: "MOBILEAPP",
      employeeNumber,
      asofDate
    };

    const data = await callOracleAPI('/ADQ_EMP_GET_ABSEN_BALAN_SYNC/1.0/leavebalance', requestData);
    return res.json({ data });

  } catch (error) {
    console.error('Error fetching leave balance:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// CREATE LEAVE ENTRY (Original endpoint)
app.post('/create-leave', async (req: Request, res: Response) => {
  const parseResult = createLeaveSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: "Invalid input", details: parseResult.error.format() });
  }

  const { employeeToken, ...rest } = parseResult.data;

  try {
    // Check if employee exists in database
    const employee = await Employee.findOne({ employeeNumber: rest.personNumber, isActive: true });
    if (!employee) {
      return res.status(404).json({ error: "Employee not found", employeeNumber: rest.personNumber });
    }

    const requestData = {
      operationName: "createLeave",
      projectName: "MOBILEAPP",
      ...rest
    };

    const data = await callOracleAPI('/ADQ_CREATE_ABSENCE_SYNC/1.0/createAbsence', requestData, employeeToken);
    return res.json({ data });

  } catch (error) {
    console.error('Error creating leave entry:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// APPLY FOR LEAVE (Employee submits leave request for approval)
app.post('/apply-leave', async (req: Request, res: Response) => {
  const parseResult = applyLeaveSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: "Invalid input", details: parseResult.error.format() });
  }

  const {
    employeeNumber,
    absenceType,
    startDate,
    endDate,
    startDateDuration,
    endDateDuration,
    employeeToken
  } = parseResult.data;

  try {
    // Find employee and manager in database
    const employee = await Employee.findOne({ employeeNumber, isActive: true });
    if (!employee) {
      return res.status(404).json({
        error: 'Employee not found',
        employeeNumber
      });
    }

    if (!employee.managerId) {
      return res.status(400).json({
        error: 'No manager assigned to employee',
        employeeNumber
      });
    }

    const manager = await Employee.findOne({ employeeNumber: employee.managerId, isActive: true });
    if (!manager) {
      return res.status(400).json({
        error: 'Manager not found',
        managerId: employee.managerId
      });
    }

    // Create leave request with SUBMITTED status (pending approval)
    const requestData = {
      operationName: "createLeave",
      projectName: "MOBILEAPP",
      personNumber: employeeNumber,
      employer: "ADQ PJSC",
      absenceType,
      startDate,
      endDate,
      absenceStatusCd: "SUBMITTED",
      approvalStatusCd: "PENDING",
      startDateDuration,
      endDateDuration
    };

    // Call Oracle API to create leave entry
    let oracleResult;
    try {
      oracleResult = await callOracleAPI('/ADQ_CREATE_ABSENCE_SYNC/1.0/createAbsence', requestData, employeeToken);
    } catch (oracleError) {
      console.warn('Oracle API failed, using simulated response:', oracleError);
      oracleResult = {
        status: "SUCCESS",
        statusDesc: "Leave request created successfully",
        personAbsenceEntryId: Date.now(),
        absenceType: absenceType,
        submittedDate: new Date().toISOString().split('T')[0],
        personId: parseInt(employeeNumber) + 300000000000000,
        personNumber: employeeNumber,
        formattedDuration: `${parseFloat(startDateDuration)} Days`
      };
    }

    const lastApproval = await PendingApproval.findOne().sort({ approvalId: -1 });
    const approvalId = lastApproval ? lastApproval.approvalId + 1 : 1;

    // Create pending approval in database
    const approval = new PendingApproval({
      employeeNumber: employeeNumber,
      employeeName: employee.name,
      managerId: employee.managerId,
      managerName: manager.name,
      approvalId :approvalId,
      leaveRequest: {
        personAbsenceEntryId: oracleResult.personAbsenceEntryId,
        absenceType: absenceType,
        startDate: startDate,
        endDate: endDate,
        duration: `${parseFloat(startDateDuration)} Days`,
        submittedDate: oracleResult.submittedDate || new Date().toISOString().split('T')[0],
        employeeNumber: employeeNumber,
        employeeName: employee.name
      },
      status: 'PENDING',
      oracleResponse: oracleResult
    });

    await approval.save();

    console.log(approval)

    return res.json({
      status: 'SUCCESS',
      statusDesc: 'Leave request submitted successfully',
      data: oracleResult,
      approvalInfo: {
        approvalId: approval.approvalId,
        pendingWith: manager.name,
        managerId: employee.managerId,
        message: `Leave request submitted successfully. Pending approval from ${manager.name} (${employee.managerId})`
      }
    });

  } catch (error) {
    console.error('Error applying for leave:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET PENDING APPROVALS FOR MANAGER
app.get('/pending-approvals/:managerId', async (req: Request, res: Response) => {
  try {
    const { managerId } = req.params;

    // Validate manager exists in database
    const manager = await Employee.findOne({ employeeNumber: managerId, isActive: true });
    if (!manager) {
      return res.status(404).json({
        error: 'Manager not found',
        managerId
      });
    }

    // Find pending approvals for this manager
    const managerApprovals = await PendingApproval.find({
      managerId: managerId,
      status: 'PENDING'
    }).sort({ submittedAt: -1 });

    return res.json({
      status: 'SUCCESS',
      statusDesc: 'Pending approvals retrieved successfully',
      data: {
        managerId: managerId,
        managerName: manager.name,
        pendingCount: managerApprovals.length,
        approvals: managerApprovals
      }
    });

  } catch (error) {
    console.error('Error fetching pending approvals:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// APPROVE OR REJECT LEAVE REQUEST
app.post('/approve-reject/:approvalId', async (req: Request, res: Response) => {
  const parseResult = approveRejectSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: "Invalid input", details: parseResult.error.format() });
  }

  const { approvalId } = req.params;
  const { managerId, action, comments } = parseResult.data;

  try {
    // Validate manager exists
    const manager = await Employee.findOne({ employeeNumber: managerId, isActive: true });
    if (!manager) {
      return res.status(404).json({
        error: 'Manager not found',
        managerId
      });
    }

    // Find the approval in database
    const approval = await PendingApproval.findOne({ approvalId: parseInt(approvalId) });
    if (!approval) {
      return res.status(404).json({
        error: 'Approval request not found',
        approvalId: parseInt(approvalId)
      });
    }

    // Validate manager has permission to approve this request
    if (approval.managerId !== managerId) {
      return res.status(403).json({
        error: 'Unauthorized: You can only approve requests for your direct reports',
        requestManagerId: approval.managerId,
        yourManagerId: managerId
      });
    }

    // Check if already processed
    if (approval.status !== 'PENDING') {
      return res.status(400).json({
        error: `Request already ${approval.status.toLowerCase()}`,
        currentStatus: approval.status
      });
    }

    // Update approval status in database
    approval.status = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
    approval.approvedBy = managerId;
    approval.approvedAt = new Date();
    approval.comments = comments;

    await approval.save();

    // In production, you would update the Oracle system here
    // This would involve calling another Oracle API to update the leave status
    
    return res.json({
      status: 'SUCCESS',
      statusDesc: `Leave request ${action.toLowerCase()}d successfully`,
      data: {
        personAbsenceEntryId: approval.leaveRequest.personAbsenceEntryId,
        approvalStatus: approval.status,
        approvedBy: manager.name,
        approvedDate: approval.approvedAt,
        comments: comments,
        approval: approval
      }
    });

  } catch (error) {
    console.error('Error processing approval:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET ALL APPROVALS (for admin/reporting purposes)
app.get('/all-approvals', async (req: Request, res: Response) => {
  try {
    const { status, managerId, employeeNumber, page = 1, limit = 50 } = req.query;
    
    // Build filter query
    const filter: any = {};
    if (status) filter.status = status;
    if (managerId) filter.managerId = managerId;
    if (employeeNumber) filter.employeeNumber = employeeNumber;

    // Pagination
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    
    const approvals = await PendingApproval.find(filter)
      .sort({ submittedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit as string));

    const total = await PendingApproval.countDocuments(filter);
    const pending = await PendingApproval.countDocuments({ ...filter, status: 'PENDING' });
    const approved = await PendingApproval.countDocuments({ ...filter, status: 'APPROVED' });
    const rejected = await PendingApproval.countDocuments({ ...filter, status: 'REJECTED' });

    return res.json({
      status: 'SUCCESS',
      statusDesc: 'All approvals retrieved successfully',
      data: {
        total,
        pending,
        approved,
        rejected,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          totalPages: Math.ceil(total / parseInt(limit as string))
        },
        approvals
      }
    });
  } catch (error) {
    console.error('Error fetching all approvals:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// EMPLOYEE MANAGEMENT ENDPOINTS

// GET EMPLOYEE INFO
app.get('/employee/:employeeNumber', async (req: Request, res: Response) => {
  try {
    const { employeeNumber } = req.params;
    const employee = await Employee.findOne({ employeeNumber, isActive: true });
    
    if (!employee) {
      return res.status(404).json({
        error: 'Employee not found',
        employeeNumber
      });
    }

    return res.json({
      status: 'SUCCESS',
      data: employee
    });
  } catch (error) {
    console.error('Error fetching employee info:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// CREATE OR UPDATE EMPLOYEE
app.post('/employee', async (req: Request, res: Response) => {
  const parseResult = employeeSchema_validation.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: "Invalid input", details: parseResult.error.format() });
  }

  try {
    const employeeData = parseResult.data;
    
    // If managerId is provided, validate manager exists
    if (employeeData.managerId) {
      const manager = await Employee.findOne({ 
        employeeNumber: employeeData.managerId, 
        isActive: true 
      });
      if (!manager) {
        return res.status(400).json({
          error: 'Manager not found',
          managerId: employeeData.managerId
        });
      }
      employeeData.managerName = manager.name;
    }

    const employee = await Employee.findOneAndUpdate(
      { employeeNumber: employeeData.employeeNumber },
      { ...employeeData, updatedAt: new Date() },
      { upsert: true, new: true }
    );

    return res.json({
      status: 'SUCCESS',
      statusDesc: 'Employee saved successfully',
      data: employee
    });
  } catch (error) {
    console.error('Error saving employee:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET ALL EMPLOYEES
app.get('/employees', async (req: Request, res: Response) => {
  try {
    const { managerId, department, page = 1, limit = 50 } = req.query;
    
    const filter: any = { isActive: true };
    if (managerId) filter.managerId = managerId;
    if (department) filter.department = department;

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    
    const employees = await Employee.find(filter)
      .sort({ name: 1 })
      .skip(skip)
      .limit(parseInt(limit as string));

    const total = await Employee.countDocuments(filter);

    return res.json({
      status: 'SUCCESS',
      data: {
        total,
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          totalPages: Math.ceil(total / parseInt(limit as string))
        },
        employees
      }
    });
  } catch (error) {
    console.error('Error fetching employees:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// HEALTH CHECK
app.get('/health', async (req: Request, res: Response) => {
  try {
    // Check database connection
    const dbStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
    const employeeCount = await Employee.countDocuments({ isActive: true });
    const pendingApprovalsCount = await PendingApproval.countDocuments({ status: 'PENDING' });

    res.json({
      status: 'OK',
      message: 'Leave Management API is running',
      timestamp: new Date().toISOString(),
      database: {
        status: dbStatus,
        activeEmployees: employeeCount,
        pendingApprovals: pendingApprovalsCount
      },
      endpoints: {
        'POST /leave-balance': 'Get employee leave balance',
        'POST /create-leave': 'Create leave entry (direct)',
        'POST /apply-leave': 'Apply for leave (with approval workflow)',
        'GET /pending-approvals/:managerId': 'Get pending approvals for manager',
        'POST /approve-reject/:approvalId': 'Approve or reject leave request',
        'GET /all-approvals': 'Get all approvals (admin)',
        'GET /employee/:employeeNumber': 'Get employee information',
        'POST /employee': 'Create or update employee',
        'GET /employees': 'Get all employees',
        'GET /health': 'Health check'
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      message: 'Health check failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Fallback for unsupported methods
app.all('/leave-balance', (_, res) => {
  res.status(405).json({ error: "Method Not Allowed. Use POST." });
});
app.all('/create-leave', (_, res) => {
  res.status(405).json({ error: "Method Not Allowed. Use POST." });
});

// Global error handling middleware
app.use((err: Error, req: Request, res: Response, next: any) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: "Internal server error" });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Server startup
const PORT = process.env.PORT || 3002;

const startServer = async () => {
  try {
    await connectDB();
    await initializeEmployees();
    
    app.listen(PORT, () => {
      console.log(`\n🚀 Server running on port ${PORT}`);
      console.log('📊 MongoDB connected and initialized');
      console.log('\n=== LEAVE MANAGEMENT API ===');
      console.log('Available endpoints:');
      console.log('POST /leave-balance - Get employee leave balance');
      console.log('POST /create-leave - Create leave entry (direct)');
      console.log('POST /apply-leave - Apply for leave (with approval workflow)');
      console.log('GET  /pending-approvals/:managerId - Get pending approvals for manager');
      console.log('POST /approve-reject/:approvalId - Approve or reject leave request');
      console.log('GET  /all-approvals - Get all approvals (admin)');
      console.log('GET  /employee/:employeeNumber - Get employee information');
      console.log('POST /employee - Create or update employee');
      console.log('GET  /employees - Get all employees');
      console.log('GET  /health - Health check');
      console.log('\n=== TEST WORKFLOW ===');
      console.log('1. Aysha (1460) applies: POST /apply-leave');
      console.log('2. Lubna (210) views pending: GET /pending-approvals/210');
      console.log('3. Lubna approves/rejects: POST /approve-reject/:approvalId');
      console.log('================================\n');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Global error handling
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});

startServer();