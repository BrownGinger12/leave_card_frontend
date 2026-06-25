# DepEd Leave Management Frontend

## Stack

- React Vite 5.2.1
- TypeScript
- Tailwind CSS
- React Router DOM
- Axios
- React Hook Form
- Zod
- TanStack Query (React Query)

---

# API Configuration

## Base URL

```env
VITE_API_BASE_URL=http://localhost:5000
```

## Example Axios Instance

```typescript
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});
```

---

# Project Structure

```text
src/
│
├── components/
│   ├── common/
│   ├── forms/
│   ├── tables/
│   ├── modals/
│   └── layout/
│
├── pages/
│   ├── dashboard/
│   ├── employees/
│   ├── employee-profile/
│   ├── leave-applications/
│   ├── leave-approvals/
│   ├── leave-balances/
│   ├── ledger-history/
│   ├── cto-applications/
│   └── settings/
│
├── services/
│   ├── employee.service.ts
│   ├── leave-application.service.ts
│   ├── leave-approval.service.ts
│   ├── leave-credit.service.ts
│   ├── leave-type.service.ts
│   ├── dashboard.service.ts
│   └── cto-application.service.ts
│
├── models/
│   ├── employee.model.ts
│   ├── leave-application.model.ts
│   ├── leave-balance.model.ts
│   ├── leave-approval.model.ts
│   ├── leave-transaction.model.ts
│   └── cto-application.model.ts
│
├── hooks/
│
├── routes/
│
├── utils/
│
├── constants/
│
└── App.tsx
```

---

# Pages

## Dashboard

### Endpoint

```http
GET /dashboard
```

### Displays

- Total Employees
- Pending Leave Applications
- Pending CTO Applications
- Approved Leave Applications
- Approved CTO Applications
- Leave Statistics
- Recent Transactions

---

## Employee Management

### Endpoints

```http
POST   /employees
GET    /employees
GET    /employees/:id
PUT    /employees/:id
DELETE /employees/:id

GET    /employees/search
GET    /employees/:id/profile
```

### Features

- Employee Listing
- Search Employee
- Create Employee
- Update Employee
- Delete Employee
- Pagination
- Employee Profile View

### Table Columns

- Leave Card Number
- Employee Number
- Full Name
- Employee Type
- Employment Status
- Email

---

## Employee Profile

### Endpoints

```http
GET /employees/:id/profile
GET /employees/:id/leave-balances
GET /employees/:id/transactions
```

### Features

- Employee Information
- Leave Balances
- Recent Leave Applications
- Recent CTO Applications
- Transaction History

---

## Leave Types

### Endpoint

```http
GET /leave-types
```

### Features

Used to populate:

- Leave Application Dropdowns
- Filters
- Reports
- Leave Balance Screens

---

## Leave Applications

### Endpoints

```http
POST /leave-applications
GET  /leave-applications
GET  /leave-applications/:id
GET  /leave-applications/employee/:employee_id
```

### Features

- Create Leave Application
- View Application Details
- View Employee Leave History
- HR Leave Monitoring
- Approval Queue

### Form Fields

- Employee
- Leave Type
- Date Filed
- Start Date
- End Date
- Reason
- Other Leave Description

---

## Leave Approvals

### Endpoints

```http
POST /leave-approvals
GET  /leave-approvals/application/:application_id
```

### Features

- Approve Application
- Reject Application
- View Approval History
- Add Remarks

---

## Leave Balances

### Endpoint

```http
GET /employees/:id/leave-balances
```

### Displays

- VL Balance
- SL Balance
- SPL Balance
- CTO Balance
- VSC Balance

### Table Columns

- Leave Type
- Current Balance
- Last Updated

---

## Leave Credits

### Endpoint

```http
POST /leave-credits
```

### Features

- Credit VL
- Credit SL
- View Credit History

### Form Fields

- Employee
- Leave Type
- Amount
- Transaction Date
- Remarks

---

## CTO Applications

### Endpoints

```http
POST /cto-applications
POST /cto-applications/decide
GET  /cto-applications
GET  /cto-applications/:id
GET  /cto-applications/employee/:employee_id
```

### Features

- Submit CTO Application
- Approve CTO Application
- Reject CTO Application
- View CTO History

### Form Fields

- Activity Name
- Activity Start Date
- Activity End Date
- Participation Start Date
- Participation End Date
- Days Rendered
- Special Order Number

---

## Ledger History

### Endpoint

```http
GET /employees/:id/transactions
```

### Features

- Credit Transactions
- Debit Transactions
- Running Balance History
- Audit Trail
- Leave Card History

---

# TypeScript Models

## Employee

```typescript
export interface Employee {
  id: number;
  leave_card_number: string;
  employee_number: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  email: string;
  employee_type: "TEACHING" | "NON_TEACHING";
  employment_status:
    | "PERMANENT"
    | "TEMPORARY"
    | "CASUAL"
    | "CONTRACT_OF_SERVICE";
  school_id: number;
}
```

---

## Leave Balance

```typescript
export interface LeaveBalance {
  leave_type_id: number;
  leave_type_code: string;
  leave_type_name: string;
  balance: number;
}
```

---

## Leave Application

```typescript
export interface LeaveApplication {
  id: number;
  application_number: string;
  employee_id: number;
  leave_type_id: number;
  date_filed: string;
  start_date: string;
  end_date: string;
  total_days: number;
  reason: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
}
```

---

## CTO Application

```typescript
export interface CtoApplication {
  id: number;
  application_number: string;
  employee_id: number;
  activity_name: string;
  activity_start_date: string;
  activity_end_date: string;
  participation_start_date: string;
  participation_end_date: string;
  days_rendered: number;
  special_order_number?: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
}
```

---

## Leave Transaction

```typescript
export interface LeaveTransaction {
  id: number;
  transaction_number: string;
  leave_type: string;
  transaction_type: "CREDIT" | "DEBIT";
  amount: number;
  balance_snapshot_after: number;
  transaction_date: string;
  remarks?: string;
}
```

---

# UI Design Guidelines

## Theme

Use a clean government-style interface.

### Colors

- Primary: Blue
- Secondary: White
- Accent: Gray
- Success: Green
- Warning: Orange
- Danger: Red

---

## Tables

### Requirements

- Search
- Pagination
- Loading State
- Empty State
- Error State
- Sortable Columns

---

## Forms

### Requirements

- React Hook Form
- Zod Validation
- Inline Validation Messages
- Submit Loading State
- Disabled Submit During Processing

---

# Business Rules

## Leave Application

Creating a leave application **DOES NOT** deduct balances.

```text
Submit Application
      ↓
Status = PENDING
      ↓
Await Approval
```

Balance deduction occurs only when approved.

---

## Leave Approval

```text
APPROVED
      ↓
Ledger DEBIT
      ↓
Balance Update
```

---

## CTO Application

```text
Submit CTO Application
      ↓
Status = PENDING
      ↓
Approval
      ↓
Ledger CREDIT
      ↓
Balance Update
```

---

# Important Principles

- Frontend must never calculate balances.
- Frontend must never calculate leave deductions.
- Frontend only displays backend-computed balances.
- All balances must come from backend APIs.
- Ledger remains the single source of truth.
- Employee leave balances are cached projections of the ledger.
- All balance-changing operations must go through the backend ledger service.
- Never derive balances from frontend calculations.
- dates without pay and with pay
- new page for calendar dates with pay, without pay and holidays
- add personal reason to vsc
