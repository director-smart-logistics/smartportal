# Icons Rule

## No Emojis - Use Lucide React Icons

**NEVER use emojis in the UI.** Always use Lucide React icons instead.

### Examples

❌ **Bad:**
```tsx
<option value="van">🚐 Van</option>
<span>🔵 Azul</span>
```

✅ **Good:**
```tsx
import { Truck, Car, Bike, Boxes } from "lucide-react";

<div className="flex items-center gap-2">
  <Truck className="h-4 w-4" />
  <span>Van</span>
</div>

// For colors, use actual CSS colored elements:
<span className="w-3 h-3 rounded-full bg-blue-600" />
```

### Available Vehicle Icons
- `Truck` - Van, Camión, Pickup
- `Boxes` - Furgón
- `Car` - Auto
- `Bike` - Motocicleta, Bicicleta

### Rationale
- Emojis render inconsistently across platforms/browsers
- Lucide icons are vector-based and scale perfectly
- Icons can be styled with Tailwind classes (size, color, etc.)
- Better accessibility with proper aria labels
