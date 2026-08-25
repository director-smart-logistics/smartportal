# i18n Structure

This project uses i18next for internationalization with a **namespace-based organization** for better maintainability.

## Directory Structure

```
client/i18n/
├── config.ts           # i18n configuration
├── en/                 # English translations
│   ├── common.json     # Shared translations (buttons, common UI)
│   └── payroll.json    # Payroll module translations
├── es/                 # Spanish translations
│   ├── common.json     # Traducciones compartidas
│   └── payroll.json    # Traducciones de nómina
└── README.md          # This file
```

## Namespaces

### `common` (default)
Contains shared translations used across the application:
- Common UI elements (buttons, labels, messages)
- Generic actions (save, cancel, delete, edit)
- Navigation items
- Error messages
- Success messages

### `payroll`
Contains all payroll-related translations:
- `attendance.*` - Employee Entry and Exit Control
- `import.*` - Time Entry Import functionality
- `weeklyReport.*` - Weekly Payroll Report

## Usage

### Using a single namespace (common - default)
```typescript
import { useLocale } from '@/hooks/useLocale';

function MyComponent() {
  const { t } = useLocale(); // Uses 'common' namespace by default
  
  return <button>{t('common.save')}</button>;
}
```

### Using multiple namespaces
```typescript
import { useLocale } from '@/hooks/useLocale';

function PayrollComponent() {
  const { t } = useLocale(['payroll', 'common']); // Can access both namespaces
  
  return (
    <div>
      <h1>{t('attendance.title')}</h1>
      <button>{t('common.save')}</button>
    </div>
  );
}
```

### Using a specific namespace
```typescript
import { useLocale } from '@/hooks/useLocale';

function PayrollOnlyComponent() {
  const { t } = useLocale('payroll'); // Only payroll namespace
  
  return <h1>{t('attendance.title')}</h1>;
}
```

## Translation Keys Format

### Common namespace
```
common.{action}
common.{uiElement}
```

Examples:
- `common.save`
- `common.cancel`
- `common.delete`
- `common.success`
- `common.error`

### Payroll namespace
```
attendance.{feature}
import.{feature}
weeklyReport.{feature}
```

Examples:
- `attendance.title`
- `attendance.checkIn`
- `import.wizardDescription`
- `import.dragDropFile`
- `weeklyReport.generatePayroll`

## Adding New Namespaces

1. **Create translation files:**
   ```bash
   # English
   touch client/i18n/en/yourmodule.json
   
   # Spanish
   touch client/i18n/es/yourmodule.json
   ```

2. **Update config.ts:**
   ```typescript
   import enYourModule from "./en/yourmodule.json";
   import esYourModule from "./es/yourmodule.json";
   
   const resources = {
     en: {
       common: enCommon,
       payroll: enPayroll,
       yourmodule: enYourModule, // Add here
     },
     es: {
       common: esCommon,
       payroll: esPayroll,
       yourmodule: esYourModule, // Add here
     },
   };
   ```

3. **Use in components:**
   ```typescript
   const { t } = useLocale(['yourmodule', 'common']);
   ```

## Benefits of Namespace Organization

1. **Better Maintainability**: Each module's translations are in separate files
2. **Reduced Conflicts**: Multiple developers can work on different modules
3. **Faster Loading**: Only load translations for modules you need
4. **Clearer Organization**: Easy to find and update translations
5. **Scalability**: Add new modules without bloating common.json

## File Size Guidelines

- Keep namespace files under 500 lines
- If a namespace grows too large, consider splitting into sub-namespaces
- Example: `payroll.json` could split into:
  - `payroll-attendance.json`
  - `payroll-import.json`
  - `payroll-reports.json`

## Restart Requirements

⚠️ **Important**: Changes to JSON translation files require a dev server restart:

```bash
# Stop current server (Ctrl+C / Cmd+C)
pnpm dev
```

i18n caches translations at startup and doesn't hot-reload JSON changes automatically.

## Validation

Run the validation script to check translation files:

```bash
node validate-i18n.js
```

This will verify:
- JSON syntax is valid
- Required translation keys exist
- Files are properly structured
