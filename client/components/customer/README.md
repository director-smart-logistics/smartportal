# Customer Components

Production-ready components for the enhanced Customer Details page.

## Components

### 1. **CustomerInfoGrid**
Displays all customer information in organized, accessible sections.

```tsx
import { CustomerInfoGrid } from '@/components/customer/CustomerInfoGrid';

<CustomerInfoGrid customer={customer} />
```

**Features**: Copy-to-clipboard, smart field hiding, responsive grid, dark mode

---

### 2. **CustomerStats**
Shows 8 metric cards with customer statistics.

```tsx
import { CustomerStats } from '@/components/customer/CustomerStats';
import { calculateCustomerStats } from '@/lib/utils/customerStats';

const stats = calculateCustomerStats(packages, customer.createdAt);

<CustomerStats stats={stats} />
```

**Metrics**: Total/Active/Delivered packages, Value, Weight, Days as customer, Activity

---

### 3. **CustomerPackagesTable**
Professional data table with search, filter, sort, pagination, and export.

```tsx
import { CustomerPackagesTable } from '@/components/customer/CustomerPackagesTable';

<CustomerPackagesTable packages={packages} />
```

**Features**: Search, status filter, sortable columns, pagination, CSV export

---

### 4. **CustomerDetailTabs**
Tabbed interface with URL-based routing and badge counts.

```tsx
import { CustomerDetailTabs } from '@/components/customer/CustomerDetailTabs';

<CustomerDetailTabs
  overviewContent={<CustomerInfoGrid customer={customer} />}
  packagesContent={<CustomerPackagesTable packages={packages} />}
  packagesCount={packages.length}
/>
```

**Features**: URL routing (`?tab=packages`), badge counts, lazy rendering

---

## Complete Integration Example

```tsx
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { CustomerInfoGrid } from '@/components/customer/CustomerInfoGrid';
import { CustomerStats } from '@/components/customer/CustomerStats';
import { CustomerPackagesTable } from '@/components/customer/CustomerPackagesTable';
import { CustomerDetailTabs } from '@/components/customer/CustomerDetailTabs';
import { calculateCustomerStats } from '@/lib/utils/customerStats';
import { useCustomer } from '@/lib/hooks/queries/useCustomers';
import { usePackagesByCustomer } from '@/lib/hooks/queries/usePackages';

export default function CustomerDetail() {
  const { id } = useParams();
  const { data: customer, isLoading } = useCustomer(id || '');
  const { data: customerPackages } = usePackagesByCustomer(id || '');
  const packages = customerPackages || [];

  // Calculate statistics
  const stats = useMemo(() => 
    calculateCustomerStats(packages, customer?.createdAt || new Date().toISOString()),
    [packages, customer]
  );

  if (isLoading) return <div>Loading...</div>;
  if (!customer) return <div>Customer not found</div>;

  return (
    <DashboardLayout>
      {/* Header with actions */}
      <div className="flex justify-between items-center mb-6">
        <h1>{customer.fullName}</h1>
        <div className="flex gap-2">
          <Button onClick={() => setIsEditModalOpen(true)}>Edit</Button>
          <Button variant="destructive" onClick={handleDelete}>Delete</Button>
        </div>
      </div>

      {/* Quick Statistics Dashboard */}
      <CustomerStats stats={stats} className="mb-6" />

      {/* Tabbed Content */}
      <CustomerDetailTabs
        overviewContent={<CustomerInfoGrid customer={customer} />}
        packagesContent={<CustomerPackagesTable packages={packages} />}
        packagesCount={packages.length}
      />
    </DashboardLayout>
  );
}
```

---

## Utilities

### calculateCustomerStats()
```tsx
import { calculateCustomerStats } from '@/lib/utils/customerStats';

const stats = calculateCustomerStats(packages, customerCreatedAt);
// Returns: CustomerStats object with 8 metrics
```

### formatRelativeTime()
```tsx
import { formatRelativeTime } from '@/lib/utils/customerStats';

const relative = formatRelativeTime(date, 'en'); // "2 days ago"
```

### copyToClipboard()
```tsx
import { copyToClipboard } from '@/lib/utils/customerStats';

const success = await copyToClipboard('text');
```

---

## Testing

All components include complete `data-testid` attributes:

```typescript
// E2E Test Example
test('displays customer information', async ({ page }) => {
  await page.goto('/customers/123');
  
  await expect(page.getByTestId('field-full-name')).toContainText('John Doe');
  await expect(page.getByTestId('stat-total-packages')).toBeVisible();
  
  await page.click('[data-testid="tab-packages"]');
  await expect(page.getByTestId('packages-table')).toBeVisible();
});
```

---

## Accessibility

- ✅ WCAG AA compliant
- ✅ Keyboard navigation
- ✅ Screen reader support
- ✅ ARIA labels
- ✅ Focus management

---

## Internationalization

All components use translation keys from `customers.detailsPage.*`:

```json
{
  "customers": {
    "detailsPage": {
      "tabs": { "overview": "Overview", "packages": "Packages" },
      "stats": { "totalPackages": "Total Packages" },
      "info": { "personalInfo": "Personal Information" }
    }
  }
}
```

---

## Dark Mode

All components automatically support dark mode via `useTheme()` hook.

---

## Performance

- Memoized calculations (useMemo)
- Lazy tab rendering
- Efficient sorting/filtering
- Debounced search (implicit)

---

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)
