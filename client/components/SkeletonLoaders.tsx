import { Skeleton } from "@/components/ui/skeleton";

export function SkeletonCard() {
  return (
    <div className="p-4 space-y-3">
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-8 w-3/4" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}

export function SkeletonStatCard() {
  return (
    <div className="p-4 space-y-2">
      <div className="flex justify-between items-start">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-8 w-8 rounded" />
      </div>
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-3 w-1/3" />
    </div>
  );
}

export function SkeletonChart() {
  return (
    <div className="p-4 space-y-3">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-2 w-2/3" />
      <div className="space-y-2 mt-4">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex gap-2">
            <Skeleton className="h-20 flex-1" />
            <Skeleton className="h-24 flex-1" />
            <Skeleton className="h-16 flex-1" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonTable({
  rows = 5,
  columns = 3,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex gap-2">
        {[...Array(columns)].map((_, i) => (
          <Skeleton key={`header-${i}`} className="h-10 flex-1" />
        ))}
      </div>
      {/* Body */}
      {[...Array(rows)].map((_, i) => (
        <div key={`row-${i}`} className="flex gap-2">
          {[...Array(columns)].map((_, j) => (
            <Skeleton key={`cell-${i}-${j}`} className="h-12 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

// Enhanced Table Skeleton with realistic structure
export function SkeletonDataTable({ rows = 10 }: { rows?: number }) {
  return (
    <div className="rounded-md border">
      {/* Table Header */}
      <div className="border-b bg-muted/50 p-4">
        <div className="flex gap-4">
          <Skeleton className="h-4 w-8" /> {/* Checkbox */}
          <Skeleton className="h-4 w-32" /> {/* Tracking */}
          <Skeleton className="h-4 w-40" /> {/* Customer */}
          <Skeleton className="h-4 w-24" /> {/* Status */}
          <Skeleton className="h-4 w-24" /> {/* Origin */}
          <Skeleton className="h-4 w-24" /> {/* Destination */}
          <Skeleton className="h-4 w-20" /> {/* Actions */}
        </div>
      </div>
      {/* Table Body */}
      <div className="divide-y">
        {[...Array(rows)].map((_, i) => (
          <div key={`data-row-${i}`} className="p-4">
            <div className="flex gap-4 items-center">
              <Skeleton className="h-4 w-4 rounded" /> {/* Checkbox */}
              <Skeleton className="h-4 w-32" /> {/* Tracking */}
              <Skeleton className="h-4 w-40" /> {/* Customer */}
              <Skeleton className="h-6 w-20 rounded-full" /> {/* Badge */}
              <Skeleton className="h-4 w-24" /> {/* Origin */}
              <Skeleton className="h-4 w-24" /> {/* Destination */}
              <div className="flex gap-2">
                <Skeleton className="h-8 w-8 rounded" /> {/* Action btn */}
                <Skeleton className="h-8 w-8 rounded" /> {/* Action btn */}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonText() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="h-4 w-3/5" />
    </div>
  );
}

export function SkeletonTimeline() {
  return (
    <div className="flex items-start gap-4">
      <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-2/3" />
      </div>
    </div>
  );
}

export function SkeletonList() {
  return (
    <div className="space-y-2">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="p-3 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      ))}
    </div>
  );
}

// Payroll-specific skeleton for employee/time entry tables
export function SkeletonPayrollTable({ rows = 10 }: { rows?: number }) {
  return (
    <div className="rounded-md border">
      {/* Table Header */}
      <div className="border-b bg-muted/50 p-4">
        <div className="flex gap-4">
          <Skeleton className="h-4 w-40" /> {/* Employee */}
          <Skeleton className="h-4 w-24" /> {/* Date */}
          <Skeleton className="h-4 w-20" /> {/* Check In */}
          <Skeleton className="h-4 w-20" /> {/* Check Out */}
          <Skeleton className="h-4 w-20" /> {/* Hours */}
          <Skeleton className="h-4 w-24" /> {/* Type */}
          <Skeleton className="h-4 w-32" /> {/* Notes */}
          <Skeleton className="h-4 w-24" /> {/* Actions */}
        </div>
      </div>
      {/* Table Body */}
      <div className="divide-y">
        {[...Array(rows)].map((_, i) => (
          <div key={`payroll-row-${i}`} className="p-4">
            <div className="flex gap-4 items-center">
              <Skeleton className="h-4 w-40" /> {/* Employee name */}
              <Skeleton className="h-4 w-24" /> {/* Date */}
              <Skeleton className="h-4 w-20" /> {/* Time */}
              <Skeleton className="h-4 w-20" /> {/* Time */}
              <Skeleton className="h-4 w-16" /> {/* Hours */}
              <Skeleton className="h-6 w-20 rounded-full" /> {/* Badge */}
              <Skeleton className="h-4 w-32" /> {/* Notes */}
              <div className="flex gap-2">
                <Skeleton className="h-8 w-16 rounded" /> {/* Edit */}
                <Skeleton className="h-8 w-16 rounded" /> {/* Delete */}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Skeleton for expandable payroll report rows
export function SkeletonPayrollReportRows({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {[...Array(rows)].map((_, i) => (
        <div key={`report-row-${i}`} className="border rounded-lg bg-card">
          <div className="flex items-center gap-4 p-4">
            <Skeleton className="h-8 w-8 rounded" /> {/* Chevron */}
            <Skeleton className="h-4 w-24" /> {/* Frequency */}
            <Skeleton className="h-6 w-20 rounded-full" /> {/* Status */}
            <Skeleton className="h-4 w-16" /> {/* Employee Count */}
            <Skeleton className="h-4 w-32" /> {/* Gross Pay */}
            <Skeleton className="h-6 w-32 rounded-full" /> {/* Net Pay */}
            <Skeleton className="h-4 w-24" /> {/* Date */}
            <div className="flex gap-2 ml-auto">
              <Skeleton className="h-8 w-8 rounded" />
              <Skeleton className="h-8 w-8 rounded" />
              <Skeleton className="h-8 w-8 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Skeleton for employee payroll details (when expanded)
export function SkeletonEmployeePayrollDetails() {
  return (
    <div className="bg-gray-50 dark:bg-gray-900 p-4 space-y-4">
      {/* Employee Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <div className="text-right space-y-1">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-3 w-20 ml-auto" />
        </div>
      </div>

      {/* Pay Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="border rounded-lg p-3 space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>

      {/* Deductions */}
      <div className="border rounded-lg p-4 space-y-3">
        <Skeleton className="h-4 w-24" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="space-y-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
