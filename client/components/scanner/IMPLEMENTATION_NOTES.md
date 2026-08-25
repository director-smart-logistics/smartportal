# Html5-QRCode Implementation - Best Practices

## Overview

This scanner implementation follows the official [html5-qrcode documentation](https://scanapp.org/html5-qrcode-docs/docs/intro) and best practices from the ScanApp blog.

## Key Implementation Details

### 1. **Proper API Usage**

Per the documentation, `Html5Qrcode.start()` requires:

```typescript
await html5Qrcode.start(
  cameraIdOrConfig,           // string (cameraId) OR MediaTrackConstraints
  configuration,              // Html5QrcodeCameraScanConfig  
  qrCodeSuccessCallback,      // (decodedText, decodedResult) => void
  qrCodeErrorCallback         // (errorMessage) => void (optional)
);
```

**Our Implementation:**
- ✅ Uses `facingMode: 'environment'` for back camera on mobile
- ✅ Falls back to specific camera ID when available
- ✅ Proper success/error callbacks with deduplication

### 2. **Dynamic QR Box Sizing** 

Following [best practice article](https://scanapp.org/blog/2022/01/09/setting-dynamic-qr-box-size-in-html5-qrcode.html), we use a **function** for `qrbox` instead of fixed dimensions:

```typescript
qrbox: (viewfinderWidth, viewfinderHeight) => {
  // Responsive sizing - works on all devices
  const qrboxWidth = Math.floor(viewfinderWidth * 0.8);  // 80% width
  const qrboxHeight = Math.floor(viewfinderHeight * 0.3); // 30% height for barcodes
  return {
    width: Math.min(qrboxWidth, 600),   // Max 600px
    height: Math.max(qrboxHeight, 150), // Min 150px for horizontal barcodes
  };
}
```

**Benefits:**
- Automatically adjusts to screen size (mobile/desktop)
- Optimized for horizontal shipping barcodes (80% × 30%)
- Prevents box from being too large or too small

### 3. **Configuration Options**

#### **FPS (Frames Per Second)**
```typescript
fps: 20  // Scan 20 times per second
```
- Higher = faster detection but more CPU
- Lower = slower but battery-friendly
- **20 fps** is optimal for shipping barcodes

#### **Aspect Ratio**
```typescript
aspectRatio: 1.777778  // 16:9
```
- Matches most webcams and phone cameras
- Prevents video distortion

#### **disableFlip**
```typescript
disableFlip: false  // Allow mirrored/flipped barcodes
```
- `false` = Scan mirrored barcodes (more compatible)
- `true` = Skip mirrored scan (faster but may miss codes)

#### **formatsToSupport**
```typescript
formatsToSupport: [
  Html5QrcodeSupportedFormats.CODE_128,    // Most common
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.PDF_417,     // FedEx
  Html5QrcodeSupportedFormats.DATA_MATRIX, // DHL
  Html5QrcodeSupportedFormats.AZTEC,       // FedEx Ground
  Html5QrcodeSupportedFormats.MAXICODE,    // UPS
  // ... etc
]
```
- Prioritize common formats first for faster detection
- Only include formats you actually need

### 4. **Camera Selection**

Per documentation, three ways to select camera:

#### **Option 1: Camera ID (Recommended)**
```typescript
const cameras = await Html5Qrcode.getCameras();
const backCamera = cameras.find(c => c.label.includes('back'));
await html5Qrcode.start(backCamera.id, config, onSuccess, onError);
```

#### **Option 2: facingMode (Mobile-Friendly)**
```typescript
await html5Qrcode.start(
  { facingMode: 'environment' },  // Back camera
  config, onSuccess, onError
);
```

#### **Option 3: facingMode with exact (Strict)**
```typescript
await html5Qrcode.start(
  { facingMode: { exact: 'environment' } },  // Fail if back camera unavailable
  config, onSuccess, onError
);
```

**Our Implementation:**
- ✅ Try to find back camera by ID first
- ✅ Fall back to `facingMode: 'environment'` if not found
- ✅ Works on both desktop and mobile

### 5. **State Management**

Per documentation, the scanner is **stateful**:

- Must call `stop()` before calling `start()` again
- Must call `stop()` before component unmount
- Must call `stop()` before switching modes (camera ↔ file)

**Our Implementation:**
```typescript
useEffect(() => {
  return () => {
    // Proper cleanup on unmount
    if (scannerRef.current && scanningRef.current) {
      scannerRef.current.stop().catch(err => {
        console.warn('[Html5QrScanner] Cleanup error:', err);
      });
    }
  };
}, []);
```

### 6. **Error Handling**

#### **Expected Errors (Silent)**
These happen on every frame without a barcode:
- `NotFoundException`
- `NotFoundError`
- `No MultiFormat Readers`

**Solution:** Filter these out in error callback

```typescript
const onScanError = (errorMessage: string) => {
  const expectedErrors = ['NotFoundException', 'not found', 'NotFoundError'];
  if (!expectedErrors.some(err => errorMessage.toLowerCase().includes(err.toLowerCase()))) {
    console.warn('[Scanner] Unexpected error:', errorMessage);
  }
};
```

#### **Actual Errors (Log)**
- Camera permission denied
- No cameras found
- Invalid configuration
- Browser not supported

### 7. **Success Callback & Deduplication**

Per documentation, success callback receives:
```typescript
(decodedText: string, decodedResult: Html5QrcodeResult) => {
  // decodedText: The barcode string
  // decodedResult: Full result with format, bounds, etc.
}
```

**Our Implementation:**
- ✅ Store detected codes with timestamp
- ✅ Deduplicate within 2-second window
- ✅ Extract format name for display

```typescript
const onScanSuccess = (decodedText: string, decodedResult: Html5QrcodeResult) => {
  setState(prev => {
    // Avoid duplicates within 2 seconds
    const exists = prev.detectedCodes.some(code => 
      code.text === decodedText && (Date.now() - code.timestamp) < 2000
    );
    if (exists) return prev;
    
    return {
      ...prev,
      detectedCodes: [...prev.detectedCodes, {
        text: decodedText,
        format: decodedResult.result.format?.formatName || 'unknown',
        timestamp: Date.now(),
      }],
    };
  });
};
```

### 8. **HTML Container Requirements**

Per documentation:
- Must provide a container element ID
- Library will render scanner UI inside it
- **Do NOT set height** - it's derived from video aspect ratio
- Width can be set, or library will use default

**Our Implementation:**
```typescript
// Create off-screen container (we use our own video element for display)
const container = document.createElement('div');
container.id = 'html5qr-reader';
container.style.position = 'absolute';
container.style.top = '-9999px';  // Hide off-screen
container.style.left = '-9999px';
document.body.appendChild(container);

// Initialize scanner with container ID
const scanner = new Html5Qrcode('html5qr-reader');
```

### 9. **Video Stream Handling**

Html5-qrcode creates its own `<video>` element. To show the stream in our custom UI:

```typescript
// Wait for scanner to start
await scanner.start(...);

// Find the video element created by html5-qrcode
const html5Video = document.querySelector('#html5qr-reader video');

// Copy the MediaStream to our visible video element
ourVideoElement.srcObject = html5Video.srcObject;
ourVideoElement.play();
```

### 10. **File Scanning** (Not Currently Used)

Per documentation, scanner can also scan from image files:

```typescript
const html5Qrcode = new Html5Qrcode('reader');

// Scan a file
html5Qrcode.scanFile(imageFile, true)
  .then(decodedText => {
    console.log('Scanned:', decodedText);
  })
  .catch(err => {
    console.error('Scan failed:', err);
  });
```

**Important:**
- Camera scanning and file scanning are **mutually exclusive**
- Must call `stop()` before switching modes
- Use `clear()` method to clear the canvas

## Performance Optimization

### Best Settings for Shipping Barcodes

```typescript
{
  fps: 20,                    // Fast enough, not too CPU-intensive
  qrbox: (w, h) => ({         // Dynamic sizing
    width: w * 0.8,           // 80% width for horizontal barcodes
    height: h * 0.3,          // 30% height (barcodes are horizontal)
  }),
  disableFlip: false,         // Allow mirrored codes
  aspectRatio: 1.777778,      // 16:9
  formatsToSupport: [         // Only shipping formats
    CODE_128, CODE_39,        // Most common
    PDF_417, DATA_MATRIX,     // Carrier-specific
    // ... etc
  ],
  experimentalFeatures: {
    useBarCodeDetectorIfSupported: true, // Use browser's native API
  },
}
```

## Common Issues & Solutions

### Issue: Video doesn't show
**Cause:** Container has `display: none`
**Solution:** Use `position: absolute` with off-screen coordinates

### Issue: Console spam with errors
**Cause:** Error callback fires every frame without barcode
**Solution:** Filter expected errors silently

### Issue: Same barcode detected multiple times
**Cause:** Callback fires continuously while barcode in view
**Solution:** Implement time-based deduplication (2 seconds)

### Issue: Scanner doesn't work on mobile
**Cause:** Using camera ID instead of facingMode
**Solution:** Use `{ facingMode: 'environment' }` for mobile

### Issue: Barcode not detected at certain distances
**Cause:** Fixed qrbox size doesn't fit barcode
**Solution:** Use dynamic qrbox function for responsive sizing

## References

- [Official Documentation](https://scanapp.org/html5-qrcode-docs/docs/intro)
- [API Reference](https://scanapp.org/html5-qrcode-docs/docs/apis)
- [Dynamic QR Box Tutorial](https://scanapp.org/blog/2022/01/09/setting-dynamic-qr-box-size-in-html5-qrcode.html)
- [GitHub Repository](https://github.com/mebjas/html5-qrcode)

## Implementation Checklist

- ✅ Create HTML container element
- ✅ Initialize `Html5Qrcode` with container ID
- ✅ Use dynamic qrbox function for responsive sizing
- ✅ Implement proper camera selection (ID or facingMode)
- ✅ Set up success callback with deduplication
- ✅ Set up error callback with filtering
- ✅ Configure appropriate barcode formats
- ✅ Set optimal FPS (20 for shipping barcodes)
- ✅ Properly handle scanner state (start/stop)
- ✅ Clean up on component unmount
- ✅ Copy video stream to custom UI element
- ✅ Handle camera permissions gracefully
- ✅ Provide user feedback for scanning state

## Current Status

All best practices from documentation have been implemented:
- ✅ Dynamic QR box sizing (80% × 30% for barcodes)
- ✅ Proper API usage with correct parameters
- ✅ Mobile-friendly camera selection
- ✅ Error filtering to prevent console spam
- ✅ Deduplication to prevent duplicate detections
- ✅ Proper state management and cleanup
- ✅ 20 fps for optimal detection speed
- ✅ Prioritized shipping barcode formats
- ✅ Native BarcodeDetector API when available
