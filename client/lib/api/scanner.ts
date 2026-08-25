/**
 * Scanner API - Backend communication for barcode scanning and package matching
 */

export interface ScanResult {
  success?: boolean;
  carrier: string;
  confidence: number;
  trackingNumber: string;
  trackingConfidence?: number;
  allBarcodes?: string[];
  additionalBarcodes?: string[];
  serviceType?: string;
  origin?: string;
  destination?: string;
  weight?: string;
  referenceNumber?: string;
  poNumber?: string;
  metadata?: {
    extractionMethod?: 'zxing' | 'ai_vision' | 'hybrid' | 'failed';
    distance?: number;
    processingTime?: number;
    error?: string;
  };
  corrections?: Record<string, string>;
  enhancementSuggestions?: string[];
}

export interface PackageMatch {
  found: boolean;
  needsConfirmation?: boolean;
  message?: string;
  package?: {
    id: string;
    trackingNumber: string;
    customerName: string;
    status: string;
    destination: string;
    createdAt: string;
    updatedAt: string;
    customer?: {
      id: string;
      fullName: string;
      email: string;
      slCode?: string;
    };
    trackingHistory?: Array<{
      id: string;
      status: string;
      location: string;
      notes?: string;
      createdAt: string;
    }>;
  };
}

export interface UpdateScanResult {
  success: boolean;
  package: {
    id: string;
    trackingNumber: string;
    status: string;
  };
}

class ScannerAPI {
  private baseUrl = '/api/scanner';

  /**
   * Parse shipping label with Gemini AI enhancement
   */
  async parseLabel(
    barcodes: string[],
    image: Blob,
    distance?: number,
    strategy?: string
  ): Promise<ScanResult> {
    const formData = new FormData();
    formData.append('barcodes', JSON.stringify(barcodes));
    
    if (distance) {
      formData.append('distance', distance.toString());
    }
    
    if (strategy) {
      formData.append('strategy', strategy);
    }
    
    formData.append('image', image, 'scan.jpg');
    
    // Add device info
    formData.append('deviceInfo', JSON.stringify({
      userAgent: navigator.userAgent,
      platform: navigator.platform,
    }));

    const response = await fetch(`${this.baseUrl}/parse`, {
      method: 'POST',
      headers: {
        // ✅ Cookies are sent automatically with credentials: 'include'
        // No need for Authorization header - cookie handles auth
      },
      credentials: 'include', // ✅ CRITICAL: Send HttpOnly cookies
      body: formData,
    });

    if (!response.ok) {
      let errorMessage = 'Failed to parse label';
      try {
        const error = await response.json();
        errorMessage = error.message || errorMessage;
      } catch (e) {
        // Response body is not JSON or empty
        errorMessage = `Server error: ${response.status} ${response.statusText}`;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  /**
   * Validate tracking number format
   */
  async validateTracking(
    trackingNumber: string,
    carrier?: string
  ): Promise<{ valid: boolean; carrier: string; confidence: number }> {
    const response = await fetch(`${this.baseUrl}/validate-tracking`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // ✅ Cookies are sent automatically with credentials: 'include'
      },
      credentials: 'include', // ✅ CRITICAL: Send HttpOnly cookies
      body: JSON.stringify({ trackingNumber, carrier }),
    });

    if (!response.ok) {
      throw new Error('Validation failed');
    }

    return response.json();
  }

  /**
   * Match scanned tracking number with existing package
   */
  async matchPackage(
    trackingNumber: string,
    scanData?: {
      carrier?: string;
      confidence?: number;
      extractionMethod?: string;
      distance?: number;
      processingTime?: number;
      userId?: string;
      ipAddress?: string;
      userAgent?: string;
      metadata?: Record<string, any>;
    }
  ): Promise<PackageMatch> {
    const response = await fetch(`${this.baseUrl}/match`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // ✅ Cookies are sent automatically with credentials: 'include'
      },
      credentials: 'include', // ✅ CRITICAL: Send HttpOnly cookies
      body: JSON.stringify({
        trackingNumber,
        carrier: scanData?.carrier,
        confidence: scanData?.confidence,
        extractionMethod: scanData?.extractionMethod,
        distance: scanData?.distance,
        processingTime: scanData?.processingTime,
        userId: scanData?.userId,
        ipAddress: scanData?.ipAddress,
        userAgent: scanData?.userAgent,
        metadata: scanData?.metadata,
      }),
    });

    if (!response.ok) {
      throw new Error('Package match failed');
    }

    return response.json();
  }

  /**
   * Confirm package intake and update status
   */
  async confirmIntake(packageId: string, userId?: string): Promise<{
    success: boolean;
    message: string;
    package: {
      id: string;
      trackingNumber: string;
      status: string;
      customerName: string;
    };
  }> {
    const response = await fetch(`${this.baseUrl}/confirm-intake`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // ✅ Cookies are sent automatically with credentials: 'include'
      },
      credentials: 'include', // ✅ CRITICAL: Send HttpOnly cookies
      body: JSON.stringify({ packageId, userId }),
    });

    if (!response.ok) {
      throw new Error('Failed to confirm package intake');
    }

    return response.json();
  }

  /**
   * Update package from scan data
   */
  async updatePackageFromScan(data: {
    trackingNumber: string;
    status: string;
    location: string;
    notes?: string;
    carrier?: string;
    metadata?: Record<string, any>;
  }): Promise<UpdateScanResult> {
    const response = await fetch(`${this.baseUrl}/update-from-scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // ✅ Cookies are sent automatically with credentials: 'include'
      },
      credentials: 'include', // ✅ CRITICAL: Send HttpOnly cookies
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Update failed');
    }

    return response.json();
  }

  /**
   * Create new package from scan
   */
  async createPackageFromScan(data: {
    trackingNumber: string;
    carrier: string;
    customerName?: string;
    destination?: string;
    weight?: string;
    metadata?: Record<string, any>;
  }): Promise<UpdateScanResult> {
    const response = await fetch(`${this.baseUrl}/create-from-scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // ✅ Cookies are sent automatically with credentials: 'include'
      },
      credentials: 'include', // ✅ CRITICAL: Send HttpOnly cookies
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Creation failed');
    }

    return response.json();
  }
}

export const scannerAPI = new ScannerAPI();
